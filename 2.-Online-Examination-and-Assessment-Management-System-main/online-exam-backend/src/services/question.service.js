const { Question, Exam } = require('../models');
const AppError = require('../utils/AppError');
const { ROLES, EXAM_STATUS } = require('../constants');
const { getPagination, buildMeta } = require('../utils/pagination');
const courseService = require('./course.service');

// Faculty/admin queries opt in to the answer key explicitly.
const WITH_KEY = '+correctOption';

function assertOwnerOrAdmin(question, actor) {
  if (actor.role === ROLES.ADMIN) return;
  if (String(question.createdBy._id || question.createdBy) !== actor.id) {
    throw AppError.forbidden('Only the faculty member who created this question can change it', 'NOT_QUESTION_OWNER');
  }
}

async function createQuestion(data, actor) {
  await courseService.assertCanAuthorForCourse(data.course, actor);

  const question = new Question({
    course: data.course,
    text: data.text,
    options: data.options.map((o) => ({ text: o.text })),
    marks: data.marks,
    topic: data.topic,
    difficulty: data.difficulty,
    tags: data.tags,
    createdBy: actor.id,
  });
  // Options get their ObjectIds when the document is constructed; the client
  // sends the index of the correct option and the server stores its id.
  question.correctOption = question.options[data.correctOptionIndex]._id;
  await question.save();
  return getQuestion(question._id, actor);
}

/**
 * Faculty see questions of every course they teach (so colleagues can reuse
 * each other's questions); they may edit only their own. Admins see all.
 */
async function listQuestions(query, actor) {
  const { page, limit, skip } = getPagination(query);
  const filter = {};

  if (actor.role === ROLES.FACULTY) {
    const taught = (await courseService.taughtCourseIds(actor.id)).map(String);
    if (query.course) {
      if (!taught.includes(String(query.course))) {
        throw AppError.forbidden('You are not assigned to teach this course', 'COURSE_NOT_ASSIGNED');
      }
      filter.course = query.course;
    } else {
      filter.course = { $in: taught };
    }
  } else if (query.course) {
    filter.course = query.course;
  }

  if (!query.includeArchived) filter.isArchived = false;
  if (query.topic) filter.topic = query.topic.toLowerCase();
  if (query.difficulty) filter.difficulty = query.difficulty;
  if (query.mine) filter.createdBy = actor.id;
  if (query.search) filter.$text = { $search: query.search };

  const sort = query.search ? { score: { $meta: 'textScore' } } : { createdAt: -1 };

  const [items, total] = await Promise.all([
    Question.find(filter)
      .select(WITH_KEY)
      .populate('course', 'code title')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Question.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit }, total) };
}

async function getQuestion(id, actor) {
  const question = await Question.findById(id)
    .select(WITH_KEY)
    .populate('course', 'code title faculty')
    .populate('createdBy', 'name email');
  if (!question) throw AppError.notFound('Question', 'QUESTION_NOT_FOUND');
  if (actor.role === ROLES.FACULTY && !question.course.faculty.some((f) => String(f) === actor.id)) {
    throw AppError.forbidden('You are not assigned to teach this question\'s course', 'COURSE_NOT_ASSIGNED');
  }
  return question;
}

/**
 * Once a question is part of a published exam, changing its text, options,
 * answer or marks would change results that students already earned, so those
 * fields are locked. Archiving (hiding it from the bank) is still allowed.
 */
async function updateQuestion(id, data, actor) {
  const question = await Question.findById(id).select(WITH_KEY);
  if (!question) throw AppError.notFound('Question', 'QUESTION_NOT_FOUND');
  assertOwnerOrAdmin(question, actor);

  const contentKeys = Object.keys(data).filter((key) => key !== 'isArchived');
  if (contentKeys.length > 0) {
    const usedInPublishedExam = await Exam.exists({
      'questions.question': question._id,
      status: { $in: [EXAM_STATUS.PUBLISHED, EXAM_STATUS.ARCHIVED] },
    });
    if (usedInPublishedExam) {
      throw AppError.conflict(
        'This question is used in a published exam. Archive it and create a new version instead.',
        'QUESTION_LOCKED'
      );
    }
  }

  ['text', 'marks', 'topic', 'difficulty', 'tags', 'isArchived'].forEach((key) => {
    if (data[key] !== undefined) question[key] = data[key];
  });

  if (data.options) {
    question.options = data.options.map((o) => ({ text: o.text }));
    question.correctOption = question.options[data.correctOptionIndex]._id;
  } else if (data.correctOptionIndex !== undefined) {
    const option = question.options[data.correctOptionIndex];
    if (!option) {
      throw AppError.badRequest(
        `correctOptionIndex must be between 0 and ${question.options.length - 1}`,
        'VALIDATION_ERROR'
      );
    }
    question.correctOption = option._id;
  }

  await question.save();
  return getQuestion(question._id, actor);
}

async function deleteQuestion(id, actor) {
  const question = await Question.findById(id);
  if (!question) throw AppError.notFound('Question', 'QUESTION_NOT_FOUND');
  assertOwnerOrAdmin(question, actor);
  if (await Exam.exists({ 'questions.question': question._id })) {
    throw AppError.conflict(
      'This question is used in an exam and cannot be deleted. Archive it instead (PATCH isArchived: true).',
      'QUESTION_IN_USE'
    );
  }
  await question.deleteOne();
}

module.exports = { createQuestion, listQuestions, getQuestion, updateQuestion, deleteQuestion };
