/**
 * The examination attempt workflow. Every rule here runs on the server; the
 * frontend timer and buttons are only conveniences.
 *
 *   start  -> validates assignment, window, attempt limit; builds a personal paper
 *   save   -> validates each answer against THIS attempt's questions/options, before the deadline
 *   submit -> locks the attempt atomically (exactly once), then scores it on the server
 *   expire -> attempts past their deadline are auto-submitted (lazily and by a background job)
 */
const mongoose = require('mongoose');
const { Attempt, Exam, Question, Setting } = require('../models');
const AppError = require('../utils/AppError');
const { ATTEMPT_STATUS, EXAM_STATUS, EXAM_PHASE, FINAL_ATTEMPT_STATUSES } = require('../constants');
const { getExamPhase, computeDeadline, isBeforeDeadline, remainingSeconds, resultVisibility } = require('../utils/examWindow');
const { shuffle, sample } = require('../utils/random');
const { evaluateAttempt } = require('./evaluation.service');
const { isStudentEligible, studentExamFilter } = require('./eligibility.service');
const eventBus = require('../events/eventBus');
const EVENTS = require('../events/eventNames');
const { toStudentExam } = require('../utils/serializers');

const { ObjectId } = mongoose.Types;

async function graceSeconds() {
  const settings = await Setting.getSettings();
  return settings.submissionGraceSeconds;
}

function answerFor(attempt, questionId) {
  return attempt.answers && typeof attempt.answers.get === 'function' ? attempt.answers.get(questionId) : null;
}

function answeredCount(attempt) {
  return attempt.answers ? attempt.answers.size : 0;
}

// ---------------------------------------------------------------------------
// Evaluation and finalization
// ---------------------------------------------------------------------------

/** Loads the answer key (server-only) and stores the evaluation on the attempt. */
async function evaluateAndStore(attempt) {
  const exam = await Exam.findById(attempt.exam).select('negativeMarking passPercentage');
  const questionIds = attempt.questions.map((q) => q.question);
  const keyDocs = await Question.find({ _id: { $in: questionIds } }).select('+correctOption');
  const answerKey = new Map(keyDocs.map((doc) => [String(doc._id), String(doc.correctOption)]));

  const evaluation = evaluateAttempt({
    questions: attempt.questions,
    answers: attempt.answers,
    answerKey,
    negativeMarking: exam ? exam.negativeMarking : null,
    passPercentage: exam ? exam.passPercentage : 40,
  });

  return Attempt.findByIdAndUpdate(attempt._id, { $set: { evaluation } }, { new: true });
}

/**
 * Submits an attempt exactly once.
 * Step 1 is a conditional atomic update (status must still be in_progress), so
 * if two submit requests arrive together only one matches; the other gets null.
 * Locking BEFORE scoring also freezes the answers: saves require in_progress.
 * If the process crashes between step 1 and 2, the sweeper re-evaluates it.
 */
async function finalizeAttempt(attemptId, { auto = false, reason = 'student' } = {}) {
  const locked = await Attempt.findOneAndUpdate(
    { _id: attemptId, status: ATTEMPT_STATUS.IN_PROGRESS },
    {
      $set: {
        status: auto ? ATTEMPT_STATUS.AUTO_SUBMITTED : ATTEMPT_STATUS.SUBMITTED,
        submittedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!locked) return null;

  const evaluated = await evaluateAndStore(locked);
  eventBus.emit(EVENTS.ATTEMPT_SUBMITTED, { attempt: evaluated, auto, reason });
  return evaluated;
}

/** Background job body: auto-submit expired attempts and repair unevaluated ones. */
async function sweepExpiredAttempts({ examId } = {}) {
  const cutoff = new Date(Date.now() - (await graceSeconds()) * 1000);
  const expiredFilter = { status: ATTEMPT_STATUS.IN_PROGRESS, deadline: { $lt: cutoff } };
  if (examId) expiredFilter.exam = examId;

  const expired = await Attempt.find(expiredFilter).select('_id').limit(500);
  let autoSubmitted = 0;
  for (const { _id } of expired) {
    // eslint-disable-next-line no-await-in-loop
    if (await finalizeAttempt(_id, { auto: true, reason: 'time_expired' })) autoSubmitted += 1;
  }

  const unevaluatedFilter = { status: { $in: FINAL_ATTEMPT_STATUSES }, evaluation: null };
  if (examId) unevaluatedFilter.exam = examId;
  const unevaluated = await Attempt.find(unevaluatedFilter).limit(500);
  for (const attempt of unevaluated) {
    // eslint-disable-next-line no-await-in-loop
    await evaluateAndStore(attempt);
  }

  return { autoSubmitted, repaired: unevaluated.length };
}

/** Lazy expiry: called whenever an attempt is read or written. */
async function expireIfOverdue(attempt, grace) {
  if (attempt.status === ATTEMPT_STATUS.IN_PROGRESS && !isBeforeDeadline(attempt.deadline, new Date(), grace)) {
    const finalized = await finalizeAttempt(attempt._id, { auto: true, reason: 'time_expired' });
    return finalized || Attempt.findById(attempt._id);
  }
  return attempt;
}

// ---------------------------------------------------------------------------
// Student: exam listing
// ---------------------------------------------------------------------------

function phaseFilter(phase, now) {
  if (phase === EXAM_PHASE.UPCOMING) return { startTime: { $gt: now } };
  if (phase === EXAM_PHASE.LIVE) return { startTime: { $lte: now }, endTime: { $gt: now } };
  if (phase === EXAM_PHASE.CLOSED) return { endTime: { $lte: now } };
  return {};
}

function summarizeAttempts(exam, attempts, now) {
  const mine = attempts.filter((a) => String(a.exam) === String(exam._id));
  const active = mine.find((a) => a.status === ATTEMPT_STATUS.IN_PROGRESS);
  const phase = getExamPhase(exam, now);
  return {
    used: mine.length,
    remaining: Math.max(0, exam.maxAttempts - mine.length),
    activeAttemptId: active ? String(active._id) : null,
    canStart: phase === EXAM_PHASE.LIVE && (Boolean(active) || mine.length < exam.maxAttempts),
    attempts: mine.map((a) => ({
      attemptId: String(a._id),
      attemptNumber: a.attemptNumber,
      status: a.status,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
    })),
  };
}

async function listStudentExams(student, query) {
  const now = new Date();
  const page = query.page || 1;
  const limit = query.limit || 10;
  const filter = { ...(await studentExamFilter(student)), ...phaseFilter(query.phase, now) };

  const [exams, total] = await Promise.all([
    Exam.find(filter)
      .select('-questions -assignedTo')
      .populate('course', 'code title')
      .sort({ startTime: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Exam.countDocuments(filter),
  ]);

  const attempts = await Attempt.find({ student: student.id, exam: { $in: exams.map((e) => e._id) } })
    .select('exam attemptNumber status startedAt submittedAt')
    .sort({ attemptNumber: 1 });

  return {
    items: exams.map((exam) => toStudentExam(exam, now, summarizeAttempts(exam, attempts, now))),
    meta: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
}

async function loadAssignedExam(examId, student) {
  const exam = await Exam.findOne({ _id: examId, status: EXAM_STATUS.PUBLISHED }).populate('course', 'code title');
  if (!exam) throw AppError.notFound('Exam', 'EXAM_NOT_FOUND');
  if (!(await isStudentEligible(exam, student))) {
    throw AppError.forbidden('This exam is not assigned to you', 'EXAM_NOT_ASSIGNED');
  }
  return exam;
}

async function getStudentExam(examId, student) {
  const now = new Date();
  const exam = await loadAssignedExam(examId, student);
  const attempts = await Attempt.find({ student: student.id, exam: exam._id })
    .select('exam attemptNumber status startedAt submittedAt')
    .sort({ attemptNumber: 1 });
  return toStudentExam(exam, now, summarizeAttempts(exam, attempts, now));
}

// ---------------------------------------------------------------------------
// Student: attempt lifecycle
// ---------------------------------------------------------------------------

/** Picks this attempt's questions and option order from the exam pool. */
async function buildPaper(exam) {
  const pool = exam.questions;
  let selected = exam.questionsPerAttempt < pool.length ? sample(pool, exam.questionsPerAttempt) : [...pool];
  if (exam.shuffleQuestions) {
    selected = shuffle(selected);
  } else {
    const order = new Map(pool.map((q, index) => [String(q.question), index]));
    selected.sort((a, b) => order.get(String(a.question)) - order.get(String(b.question)));
  }

  const docs = await Question.find({ _id: { $in: selected.map((q) => q.question) } }).select('options');
  const optionIds = new Map(docs.map((d) => [String(d._id), d.options.map((o) => o._id)]));

  return selected.map((q) => {
    const options = optionIds.get(String(q.question)) || [];
    return {
      question: q.question,
      marks: q.marks,
      optionOrder: exam.shuffleOptions ? shuffle(options) : options,
    };
  });
}

async function startAttempt(examId, student, ctx = {}) {
  const now = new Date();
  const exam = await loadAssignedExam(examId, student);

  const phase = getExamPhase(exam, now);
  if (phase === EXAM_PHASE.UPCOMING) {
    throw AppError.forbidden(`This exam has not started yet. It opens at ${exam.startTime.toISOString()}`, 'EXAM_NOT_STARTED');
  }
  if (phase === EXAM_PHASE.CLOSED) {
    throw AppError.forbidden('The exam window has closed', 'EXAM_CLOSED');
  }

  const grace = await graceSeconds();

  // Resume instead of failing if the student refreshes or reconnects.
  const active = await Attempt.findOne({ exam: exam._id, student: student.id, status: ATTEMPT_STATUS.IN_PROGRESS });
  if (active) {
    const current = await expireIfOverdue(active, grace);
    if (current.status === ATTEMPT_STATUS.IN_PROGRESS) return { attempt: current, exam, resumed: true };
  }

  const used = await Attempt.countDocuments({ exam: exam._id, student: student.id });
  if (used >= exam.maxAttempts) {
    throw AppError.conflict(`You have used all ${exam.maxAttempts} attempt(s) for this exam`, 'MAX_ATTEMPTS_REACHED');
  }

  const questions = await buildPaper(exam);

  try {
    const attempt = await Attempt.create({
      exam: exam._id,
      student: student.id,
      attemptNumber: used + 1,
      status: ATTEMPT_STATUS.IN_PROGRESS,
      startedAt: now,
      deadline: computeDeadline(now, exam.durationMinutes, exam.endTime),
      questions,
      clientInfo: { ip: ctx.ip, userAgent: ctx.userAgent },
    });
    eventBus.emit(EVENTS.ATTEMPT_STARTED, {
      attempt,
      exam,
      student,
      studentProfile: { id: student.id, name: student.name, rollNumber: student.rollNumber },
      ip: ctx.ip,
    });
    return { attempt, exam, resumed: false };
  } catch (err) {
    // Duplicate key = a parallel "start" request created the attempt first.
    if (err && err.code === 11000) {
      const existing = await Attempt.findOne({ exam: exam._id, student: student.id, status: ATTEMPT_STATUS.IN_PROGRESS });
      if (existing) return { attempt: existing, exam, resumed: true };
      throw AppError.conflict('Another attempt was started at the same moment. Please retry.', 'CONCURRENT_ATTEMPT');
    }
    throw err;
  }
}

/**
 * The student's question paper. Question documents are loaded WITHOUT the
 * answer key (correctOption is select:false), and only id/text/options are copied.
 */
async function buildPaperView(attempt) {
  const docs = await Question.find({ _id: { $in: attempt.questions.map((q) => q.question) } }).select('text options');
  const byId = new Map(docs.map((d) => [String(d._id), d]));

  return attempt.questions.map((item, index) => {
    const questionId = String(item.question);
    const doc = byId.get(questionId);
    const optionText = new Map((doc ? doc.options : []).map((o) => [String(o._id), o.text]));
    const saved = answerFor(attempt, questionId);
    return {
      number: index + 1,
      questionId,
      text: doc ? doc.text : '[question unavailable]',
      marks: item.marks,
      options: item.optionOrder.map((optionId) => ({ id: String(optionId), text: optionText.get(String(optionId)) })),
      selectedOptionId: saved ? String(saved.option) : null,
    };
  });
}

async function toAttemptView(attempt, exam) {
  const now = new Date();
  const view = {
    attemptId: String(attempt._id),
    exam: { id: String(exam._id), title: exam.title, instructions: exam.instructions },
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    startedAt: attempt.startedAt,
    deadline: attempt.deadline,
    serverTime: now,
    remainingSeconds: attempt.status === ATTEMPT_STATUS.IN_PROGRESS ? remainingSeconds(attempt.deadline, now) : 0,
    negativeMarking: { enabled: Boolean(exam.negativeMarking && exam.negativeMarking.enabled), fraction: exam.negativeMarking ? exam.negativeMarking.fraction : 0 },
    totalQuestions: attempt.questions.length,
    answeredCount: answeredCount(attempt),
    submittedAt: attempt.submittedAt,
  };
  if (attempt.status === ATTEMPT_STATUS.IN_PROGRESS) {
    view.questions = await buildPaperView(attempt);
  }
  return view;
}

async function getOwnAttempt(attemptId, student) {
  const attempt = await Attempt.findOne({ _id: attemptId, student: student.id });
  // 404 (not 403) for someone else's attempt: do not confirm that the id exists.
  if (!attempt) throw AppError.notFound('Attempt', 'ATTEMPT_NOT_FOUND');
  return attempt;
}

async function getAttemptForStudent(attemptId, student) {
  const grace = await graceSeconds();
  const attempt = await expireIfOverdue(await getOwnAttempt(attemptId, student), grace);
  const exam = await Exam.findById(attempt.exam).select('title instructions negativeMarking');
  return toAttemptView(attempt, exam);
}

function validateAnswers(attempt, answers) {
  const allowed = new Map(attempt.questions.map((q) => [String(q.question), new Set(q.optionOrder.map(String))]));
  const problems = [];
  answers.forEach((answer, index) => {
    const options = allowed.get(answer.questionId);
    if (!options) {
      problems.push({ location: 'body', field: `answers.${index}.questionId`, message: 'Question is not part of this attempt' });
    } else if (answer.optionId !== null && !options.has(answer.optionId)) {
      problems.push({ location: 'body', field: `answers.${index}.optionId`, message: 'Option does not belong to this question' });
    }
  });
  if (problems.length > 0) throw AppError.badRequest('One or more answers are invalid', 'INVALID_ANSWER', problems);
}

/**
 * Saves (or clears, with optionId: null) answers. Each answer is written with
 * its own $set/$unset key, and the update only matches while the attempt is
 * in progress and inside deadline + grace. A save that loses a race with
 * submission therefore fails instead of changing a submitted paper.
 */
async function saveAnswers(attemptId, student, answers) {
  const grace = await graceSeconds();
  const attempt = await getOwnAttempt(attemptId, student);

  if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
    throw AppError.conflict('This attempt has already been submitted', 'ATTEMPT_ALREADY_SUBMITTED');
  }
  const now = new Date();
  if (!isBeforeDeadline(attempt.deadline, now, grace)) {
    await finalizeAttempt(attempt._id, { auto: true, reason: 'time_expired' });
    throw AppError.forbidden('Time is up. The attempt was auto-submitted with your saved answers.', 'ATTEMPT_TIME_EXPIRED');
  }

  validateAnswers(attempt, answers);

  const $set = { lastSavedAt: now };
  const $unset = {};
  answers.forEach(({ questionId, optionId }) => {
    if (optionId) $set[`answers.${questionId}`] = { option: new ObjectId(optionId), answeredAt: now };
    else $unset[`answers.${questionId}`] = '';
  });
  const update = { $set };
  if (Object.keys($unset).length > 0) update.$unset = $unset;

  const result = await Attempt.updateOne(
    {
      _id: attempt._id,
      status: ATTEMPT_STATUS.IN_PROGRESS,
      deadline: { $gte: new Date(now.getTime() - grace * 1000) },
    },
    update
  );
  if (result.matchedCount === 0) {
    throw AppError.conflict('The attempt was submitted or expired while saving', 'ATTEMPT_ALREADY_SUBMITTED');
  }

  const fresh = await Attempt.findById(attempt._id).select('answers questions exam student deadline');
  const progress = {
    answeredCount: answeredCount(fresh),
    totalQuestions: fresh.questions.length,
  };
  eventBus.emit(EVENTS.ATTEMPT_PROGRESS, {
    examId: fresh.exam,
    attemptId: fresh._id,
    studentId: fresh.student,
    ...progress,
  });
  return { ...progress, savedAt: now, remainingSeconds: remainingSeconds(fresh.deadline, now) };
}

/** Final submission. Optional last answers are saved first if still on time. */
async function submitAttempt(attemptId, student, { answers } = {}) {
  const grace = await graceSeconds();
  const attempt = await getOwnAttempt(attemptId, student);
  if (attempt.status !== ATTEMPT_STATUS.IN_PROGRESS) {
    throw AppError.conflict('This attempt has already been submitted', 'ATTEMPT_ALREADY_SUBMITTED');
  }

  const onTime = isBeforeDeadline(attempt.deadline, new Date(), grace);
  if (onTime && Array.isArray(answers) && answers.length > 0) {
    await saveAnswers(attemptId, student, answers);
  }

  const finalized = await finalizeAttempt(attempt._id, {
    auto: !onTime,
    reason: onTime ? 'student_submitted' : 'time_expired',
  });
  if (!finalized) {
    throw AppError.conflict('This attempt has already been submitted', 'ATTEMPT_ALREADY_SUBMITTED');
  }

  const exam = await Exam.findById(finalized.exam).select('title resultRelease resultsPublished startTime endTime');
  const visibility = resultVisibility(exam);
  const response = {
    attemptId: String(finalized._id),
    status: finalized.status,
    submittedAt: finalized.submittedAt,
    answeredCount: answeredCount(finalized),
    totalQuestions: finalized.questions.length,
    late: !onTime,
    resultAvailable: visibility.score,
  };
  if (!onTime && Array.isArray(answers) && answers.length > 0) {
    response.note = 'Submitted after the deadline: answers sent with this request were not saved.';
  }
  if (visibility.score && finalized.evaluation) {
    response.score = finalized.evaluation.score;
    response.maxScore = finalized.evaluation.maxScore;
    response.percentage = finalized.evaluation.percentage;
    response.passed = finalized.evaluation.passed;
  }
  return response;
}

/** A student's own result, subject to the exam's release settings. Never includes the answer key. */
async function getResultForStudent(attemptId, student) {
  const grace = await graceSeconds();
  const attempt = await expireIfOverdue(await getOwnAttempt(attemptId, student), grace);
  if (attempt.status === ATTEMPT_STATUS.IN_PROGRESS) {
    throw AppError.conflict('Submit the attempt before requesting its result', 'ATTEMPT_IN_PROGRESS');
  }

  const exam = await Exam.findById(attempt.exam).select('title resultRelease resultsPublished startTime endTime passPercentage');
  const visibility = resultVisibility(exam);
  if (!visibility.score) {
    throw AppError.forbidden('Results for this exam have not been released yet', 'RESULTS_NOT_RELEASED');
  }
  if (!attempt.evaluation) {
    throw AppError.conflict('The result is still being processed. Try again in a few seconds.', 'RESULT_PENDING');
  }

  const ev = attempt.evaluation;
  const result = {
    attemptId: String(attempt._id),
    exam: { id: String(exam._id), title: exam.title, passPercentage: exam.passPercentage },
    attemptNumber: attempt.attemptNumber,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
    score: ev.score,
    maxScore: ev.maxScore,
    percentage: ev.percentage,
    passed: ev.passed,
    correctCount: ev.correctCount,
    wrongCount: ev.wrongCount,
    unattemptedCount: ev.unattemptedCount,
  };
  if (visibility.breakdown) {
    result.breakdown = ev.breakdown.map((b, index) => ({
      number: index + 1,
      questionId: String(b.question),
      selectedOptionId: b.selectedOption ? String(b.selectedOption) : null,
      isCorrect: b.isCorrect,
      marksAwarded: b.marksAwarded,
    }));
  } else {
    result.breakdownAvailableAfter = exam.endTime;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Faculty: live monitoring
// ---------------------------------------------------------------------------

async function getLiveSnapshot(examId) {
  const examObjectId = new ObjectId(String(examId));
  const [active, counts] = await Promise.all([
    Attempt.aggregate([
      { $match: { exam: examObjectId, status: ATTEMPT_STATUS.IN_PROGRESS } },
      {
        $lookup: {
          from: 'users',
          localField: 'student',
          foreignField: '_id',
          as: 'student',
          pipeline: [{ $project: { name: 1, rollNumber: 1, email: 1 } }],
        },
      },
      { $unwind: '$student' },
      {
        $project: {
          _id: 0,
          attemptId: '$_id',
          student: { id: '$student._id', name: '$student.name', rollNumber: '$student.rollNumber' },
          attemptNumber: 1,
          startedAt: 1,
          deadline: 1,
          lastSavedAt: 1,
          totalQuestions: { $size: '$questions' },
          answeredCount: { $size: { $objectToArray: { $ifNull: ['$answers', {}] } } },
        },
      },
      { $sort: { startedAt: 1 } },
    ]),
    Attempt.aggregate([{ $match: { exam: examObjectId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  return {
    examId: String(examId),
    serverTime: new Date(),
    counts: {
      inProgress: byStatus[ATTEMPT_STATUS.IN_PROGRESS] || 0,
      submitted: byStatus[ATTEMPT_STATUS.SUBMITTED] || 0,
      autoSubmitted: byStatus[ATTEMPT_STATUS.AUTO_SUBMITTED] || 0,
    },
    activeAttempts: active.map((a) => ({
      ...a,
      attemptId: String(a.attemptId),
      student: { ...a.student, id: String(a.student.id) },
      remainingSeconds: remainingSeconds(a.deadline),
    })),
  };
}

// ---------------------------------------------------------------------------
// Student: result history (aggregation)
// ---------------------------------------------------------------------------

async function listStudentResults(student) {
  return Attempt.aggregate([
    {
      $match: {
        student: new ObjectId(student.id),
        status: { $in: FINAL_ATTEMPT_STATUSES },
        evaluation: { $ne: null },
      },
    },
    {
      $lookup: {
        from: 'exams',
        localField: 'exam',
        foreignField: '_id',
        as: 'exam',
        pipeline: [{ $project: { title: 1, course: 1, resultRelease: 1, resultsPublished: 1, endTime: 1 } }],
      },
    },
    { $unwind: '$exam' },
    // Only results the student is allowed to see.
    { $match: { $or: [{ 'exam.resultRelease': 'immediate' }, { 'exam.resultsPublished': true }] } },
    {
      $lookup: {
        from: 'courses',
        localField: 'exam.course',
        foreignField: '_id',
        as: 'course',
        pipeline: [{ $project: { code: 1, title: 1 } }],
      },
    },
    { $unwind: { path: '$course', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        attemptId: { $toString: '$_id' },
        examId: { $toString: '$exam._id' },
        examTitle: '$exam.title',
        course: { code: '$course.code', title: '$course.title' },
        attemptNumber: 1,
        status: 1,
        submittedAt: 1,
        score: '$evaluation.score',
        maxScore: '$evaluation.maxScore',
        percentage: '$evaluation.percentage',
        passed: '$evaluation.passed',
      },
    },
    { $sort: { submittedAt: -1 } },
  ]);
}

module.exports = {
  // student
  listStudentExams,
  getStudentExam,
  startAttempt,
  toAttemptView,
  getAttemptForStudent,
  saveAnswers,
  submitAttempt,
  getResultForStudent,
  listStudentResults,
  // faculty / system
  getLiveSnapshot,
  finalizeAttempt,
  evaluateAndStore,
  sweepExpiredAttempts,
};
