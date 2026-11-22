const mongoose = require('mongoose');
const { Exam, Question, Attempt, Section, Course, User, Setting } = require('../models');
const AppError = require('../utils/AppError');
const { ROLES, EXAM_STATUS, EXAM_PHASE, ATTEMPT_STATUS, FINAL_ATTEMPT_STATUSES } = require('../constants');
const { getExamPhase } = require('../utils/examWindow');
const { getPagination, buildMeta, escapeRegex } = require('../utils/pagination');
const courseService = require('./course.service');
const attemptService = require('./attempt.service');
const { examAudience } = require('./eligibility.service');
const eventBus = require('../events/eventBus');
const EVENTS = require('../events/eventNames');

const { ObjectId } = mongoose.Types;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Faculty manage only exams they created; admins manage all. */
function assertManager(exam, actor) {
  if (actor.role === ROLES.ADMIN) return;
  if (String(exam.createdBy._id || exam.createdBy) !== actor.id) {
    throw AppError.forbidden('Only the faculty member who created this exam can manage it', 'NOT_EXAM_OWNER');
  }
}

async function findExamOr404(id) {
  const exam = await Exam.findById(id);
  if (!exam) throw AppError.notFound('Exam', 'EXAM_NOT_FOUND');
  return exam;
}

/** Loads an exam and checks the actor manages it (used by REST, reports and sockets). */
async function getManagedExam(id, actor) {
  const exam = await findExamOr404(id);
  assertManager(exam, actor);
  return exam;
}

/** Validates explicit question ids: they exist, belong to the course, are not archived. */
async function resolveQuestionPool(questionIds, courseId) {
  const ids = questionIds.map(String);
  const docs = await Question.find({ _id: { $in: ids } }).select('course marks isArchived');
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw AppError.badRequest('One or more questions do not exist', 'INVALID_QUESTIONS', { missing });
  }
  const wrongCourse = docs.filter((d) => String(d.course) !== String(courseId)).map((d) => String(d._id));
  if (wrongCourse.length > 0) {
    throw AppError.badRequest('Every question must belong to the exam\'s course', 'QUESTION_COURSE_MISMATCH', { wrongCourse });
  }
  const archived = docs.filter((d) => d.isArchived).map((d) => String(d._id));
  if (archived.length > 0) {
    throw AppError.badRequest('Archived questions cannot be added to an exam', 'QUESTION_ARCHIVED', { archived });
  }
  return ids.map((id) => ({ question: byId.get(id)._id, marks: byId.get(id).marks }));
}

/** Random selection from the bank with the $sample aggregation stage. */
async function autoSelectPool({ count, topics, difficulty }, courseId) {
  const match = { course: new ObjectId(String(courseId)), isArchived: false };
  if (topics && topics.length > 0) match.topic = { $in: topics.map((t) => t.toLowerCase()) };
  if (difficulty) match.difficulty = difficulty;

  const picked = await Question.aggregate([{ $match: match }, { $sample: { size: count } }, { $project: { marks: 1 } }]);
  if (picked.length < count) {
    throw AppError.badRequest(
      `Only ${picked.length} matching question(s) are available in the bank; ${count} requested`,
      'NOT_ENOUGH_QUESTIONS'
    );
  }
  return picked.map((p) => ({ question: p._id, marks: p.marks }));
}

async function validateAssignment(assignedTo = {}) {
  const { sections = [], courses = [], students = [] } = assignedTo;
  const [sectionCount, courseCount, studentCount] = await Promise.all([
    sections.length ? Section.countDocuments({ _id: { $in: sections } }) : 0,
    courses.length ? Course.countDocuments({ _id: { $in: courses } }) : 0,
    students.length ? User.countDocuments({ _id: { $in: students }, role: ROLES.STUDENT }) : 0,
  ]);
  if (sectionCount !== sections.length) throw AppError.badRequest('One or more sections do not exist', 'INVALID_ASSIGNMENT');
  if (courseCount !== courses.length) throw AppError.badRequest('One or more courses do not exist', 'INVALID_ASSIGNMENT');
  if (studentCount !== students.length) {
    throw AppError.badRequest('One or more assigned students do not exist or are not students', 'INVALID_ASSIGNMENT');
  }
}

const EDITABLE_FIELDS = [
  'title',
  'instructions',
  'durationMinutes',
  'startTime',
  'endTime',
  'questionsPerAttempt',
  'shuffleQuestions',
  'shuffleOptions',
  'negativeMarking',
  'passPercentage',
  'maxAttempts',
  'resultRelease',
  'assignedTo',
];

function applyFields(exam, data) {
  EDITABLE_FIELDS.forEach((field) => {
    if (data[field] === undefined) return;
    if (field === 'negativeMarking') {
      const current = exam.negativeMarking || {};
      exam.negativeMarking = {
        enabled: data.negativeMarking.enabled !== undefined ? data.negativeMarking.enabled : Boolean(current.enabled),
        fraction: data.negativeMarking.fraction !== undefined ? data.negativeMarking.fraction : current.fraction,
      };
    } else if (field === 'assignedTo') {
      exam.assignedTo = {
        sections: data.assignedTo.sections || [],
        courses: data.assignedTo.courses || [],
        students: data.assignedTo.students || [],
      };
    } else {
      exam[field] = data[field];
    }
  });
}

function populateExam(query) {
  return query
    .populate('course', 'code title')
    .populate('createdBy', 'name email')
    .populate('assignedTo.sections', 'code name')
    .populate('assignedTo.courses', 'code title')
    .populate('assignedTo.students', 'name rollNumber');
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

async function createExam(data, actor, ctx = {}) {
  await courseService.assertCanAuthorForCourse(data.course, actor);

  let pool = [];
  if (data.autoSelect) pool = await autoSelectPool(data.autoSelect, data.course);
  else if (data.questionIds) pool = await resolveQuestionPool(data.questionIds, data.course);

  if (data.assignedTo) await validateAssignment(data.assignedTo);

  const settings = await Setting.getSettings();
  const exam = new Exam({
    course: data.course,
    createdBy: actor.id,
    status: EXAM_STATUS.DRAFT,
    questions: pool,
    passPercentage: settings.defaultPassPercentage,
  });
  applyFields(exam, data);
  await exam.save();

  eventBus.emit(EVENTS.EXAM_CREATED, { exam, actor, ip: ctx.ip });
  return getExamDetail(exam._id, actor);
}

async function listExams(query, actor) {
  const { page, limit, skip } = getPagination(query);
  const now = new Date();
  const filter = {};
  if (actor.role === ROLES.FACULTY) filter.createdBy = actor.id;
  if (query.status) filter.status = query.status;
  if (query.course) filter.course = query.course;
  if (query.search) filter.title = new RegExp(escapeRegex(query.search), 'i');
  if (query.phase === EXAM_PHASE.UPCOMING) filter.startTime = { $gt: now };
  if (query.phase === EXAM_PHASE.LIVE) Object.assign(filter, { startTime: { $lte: now }, endTime: { $gt: now } });
  if (query.phase === EXAM_PHASE.CLOSED) filter.endTime = { $lte: now };

  const [items, total] = await Promise.all([
    Exam.find(filter)
      .populate('course', 'code title')
      .populate('createdBy', 'name email')
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(limit),
    Exam.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit }, total) };
}

/** Full exam with its question pool INCLUDING answer keys (faculty/admin only). */
async function getExamDetail(id, actor) {
  const exam = await populateExam(Exam.findById(id)).populate({
    path: 'questions.question',
    select: '+correctOption text options marks topic difficulty',
  });
  if (!exam) throw AppError.notFound('Exam', 'EXAM_NOT_FOUND');
  assertManager(exam, actor);
  return exam;
}

/**
 * Exams can be edited while in draft, or while published but not yet started
 * and with no attempts. After that, changing timing or questions would be unfair.
 */
async function updateExam(id, data, actor) {
  const exam = await getManagedExam(id, actor);
  const now = new Date();

  if (exam.status === EXAM_STATUS.ARCHIVED) {
    throw AppError.conflict('Archived exams cannot be edited', 'EXAM_ARCHIVED');
  }
  if (exam.status === EXAM_STATUS.PUBLISHED && getExamPhase(exam, now) !== EXAM_PHASE.UPCOMING) {
    throw AppError.conflict('This exam has already started and can no longer be edited', 'EXAM_LOCKED');
  }
  if (await Attempt.exists({ exam: exam._id })) {
    throw AppError.conflict('This exam already has attempts and can no longer be edited', 'EXAM_LOCKED');
  }

  if (data.autoSelect) {
    exam.questions = await autoSelectPool(data.autoSelect, exam.course);
    if (data.questionsPerAttempt === undefined) exam.questionsPerAttempt = exam.questions.length;
  } else if (data.questionIds) {
    exam.questions = await resolveQuestionPool(data.questionIds, exam.course);
    if (data.questionsPerAttempt === undefined) exam.questionsPerAttempt = exam.questions.length;
  }
  if (data.assignedTo) await validateAssignment(data.assignedTo);

  applyFields(exam, data);
  if (exam.status === EXAM_STATUS.PUBLISHED && exam.endTime <= now) {
    throw AppError.badRequest('A published exam must end in the future', 'EXAM_WINDOW_IN_PAST');
  }
  await exam.save();
  return getExamDetail(exam._id, actor);
}

async function deleteExam(id, actor, ctx = {}) {
  const exam = await getManagedExam(id, actor);
  if (await Attempt.exists({ exam: exam._id })) {
    throw AppError.conflict('This exam has attempts and cannot be deleted. Archive it instead.', 'EXAM_HAS_ATTEMPTS');
  }
  await exam.deleteOne();
  eventBus.emit(EVENTS.EXAM_DELETED, { exam, actor, ip: ctx.ip });
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

async function publishExam(id, actor, ctx = {}) {
  const exam = await getManagedExam(id, actor);
  if (exam.status !== EXAM_STATUS.DRAFT) {
    throw AppError.conflict(`Only draft exams can be published (current status: ${exam.status})`, 'INVALID_EXAM_STATE');
  }
  if (exam.questions.length === 0) {
    throw AppError.badRequest('Add at least one question before publishing', 'EXAM_HAS_NO_QUESTIONS');
  }
  const { sections, courses, students } = exam.assignedTo;
  if (sections.length + courses.length + students.length === 0) {
    throw AppError.badRequest('Assign the exam to at least one section, course or student before publishing', 'EXAM_NOT_ASSIGNED');
  }
  if (exam.endTime <= new Date()) {
    throw AppError.badRequest('The exam window has already ended; change the timing first', 'EXAM_WINDOW_IN_PAST');
  }
  const archived = await Question.exists({ _id: { $in: exam.questions.map((q) => q.question) }, isArchived: true });
  if (archived) {
    throw AppError.badRequest('The exam contains archived questions; replace them first', 'QUESTION_ARCHIVED');
  }

  exam.status = EXAM_STATUS.PUBLISHED;
  exam.publishedAt = new Date();
  await exam.save();

  const audience = await examAudience(exam);
  eventBus.emit(EVENTS.EXAM_PUBLISHED, { exam, actor, audience, ip: ctx.ip });
  return getExamDetail(exam._id, actor);
}

async function archiveExam(id, actor, ctx = {}) {
  const exam = await getManagedExam(id, actor);
  if (exam.status === EXAM_STATUS.ARCHIVED) {
    throw AppError.conflict('Exam is already archived', 'INVALID_EXAM_STATE');
  }
  if (await Attempt.exists({ exam: exam._id, status: ATTEMPT_STATUS.IN_PROGRESS })) {
    throw AppError.conflict('Students are currently writing this exam; archive it after they finish', 'EXAM_HAS_ACTIVE_ATTEMPTS');
  }
  exam.status = EXAM_STATUS.ARCHIVED;
  await exam.save();
  eventBus.emit(EVENTS.EXAM_ARCHIVED, { exam, actor, ip: ctx.ip });
  return getExamDetail(exam._id, actor);
}

/**
 * Releases results to students. Allowed only after the exam window plus the
 * grace period has ended, so nobody still writing can learn results early.
 * Any attempt still open is auto-submitted first.
 */
async function publishResults(id, actor, ctx = {}) {
  const exam = await getManagedExam(id, actor);
  if (exam.status !== EXAM_STATUS.PUBLISHED) {
    throw AppError.conflict('Results can only be published for a published exam', 'INVALID_EXAM_STATE');
  }
  if (exam.resultsPublished) {
    throw AppError.conflict('Results are already published', 'RESULTS_ALREADY_PUBLISHED');
  }
  const settings = await Setting.getSettings();
  const releasableAt = new Date(exam.endTime.getTime() + settings.submissionGraceSeconds * 1000);
  if (new Date() < releasableAt) {
    throw AppError.conflict(
      `Results can be published after the exam ends (${releasableAt.toISOString()})`,
      'EXAM_NOT_ENDED'
    );
  }

  await attemptService.sweepExpiredAttempts({ examId: exam._id });

  exam.resultsPublished = true;
  exam.resultsPublishedAt = new Date();
  await exam.save();

  const studentIds = (await Attempt.distinct('student', { exam: exam._id, status: { $in: FINAL_ATTEMPT_STATUSES } })).map(String);
  eventBus.emit(EVENTS.RESULTS_PUBLISHED, { exam, actor, studentIds, ip: ctx.ip });
  return getExamDetail(exam._id, actor);
}

module.exports = {
  assertManager,
  getManagedExam,
  createExam,
  listExams,
  getExamDetail,
  updateExam,
  deleteExam,
  publishExam,
  archiveExam,
  publishResults,
};
