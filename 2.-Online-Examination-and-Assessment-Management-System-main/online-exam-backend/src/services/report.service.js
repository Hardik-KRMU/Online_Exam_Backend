/**
 * Examination analytics, computed inside MongoDB with aggregation pipelines.
 *
 * Policy: when retakes are allowed, reports use each student's BEST attempt,
 * so a student who sat twice is counted once. bestAttemptStages() implements it.
 */
const mongoose = require('mongoose');
const { Attempt, User } = require('../models');
const AppError = require('../utils/AppError');
const { ROLES, FINAL_ATTEMPT_STATUSES } = require('../constants');
const examService = require('./exam.service');
const { countEligibleStudents } = require('./eligibility.service');

const { ObjectId } = mongoose.Types;
const oid = (id) => new ObjectId(String(id));
const round = (expr) => ({ $round: [expr, 2] });

const SCORE_BANDS = [0, 20, 40, 60, 80, 100.01];
const BAND_LABELS = { 0: '0-20%', 20: '20-40%', 40: '40-60%', 60: '60-80%', 80: '80-100%' };

/** $match finalized + evaluated attempts of one exam, then keep each student's best attempt. */
function bestAttemptStages(examId) {
  return [
    {
      $match: {
        exam: oid(examId),
        status: { $in: FINAL_ATTEMPT_STATUSES },
        evaluation: { $ne: null },
      },
    },
    { $sort: { 'evaluation.score': -1, submittedAt: 1 } },
    { $group: { _id: '$student', best: { $first: '$$ROOT' }, attemptsTaken: { $sum: 1 } } },
    { $replaceRoot: { newRoot: { $mergeObjects: ['$best', { attemptsTaken: '$attemptsTaken' }] } } },
  ];
}

function examHeader(exam) {
  return {
    id: String(exam._id),
    title: exam.title,
    status: exam.status,
    startTime: exam.startTime,
    endTime: exam.endTime,
    passPercentage: exam.passPercentage,
    resultsPublished: exam.resultsPublished,
  };
}

// ---------------------------------------------------------------------------
// Pipeline 1: exam summary — average/highest/lowest, pass rate, score bands, top 5 ($facet + $bucket)
// ---------------------------------------------------------------------------
async function examSummary(examId, actor) {
  const exam = await examService.getManagedExam(examId, actor);

  const [result] = await Attempt.aggregate([
    ...bestAttemptStages(exam._id),
    {
      $facet: {
        stats: [
          {
            $group: {
              _id: null,
              studentsAttempted: { $sum: 1 },
              averageScore: { $avg: '$evaluation.score' },
              highestScore: { $max: '$evaluation.score' },
              lowestScore: { $min: '$evaluation.score' },
              averagePercentage: { $avg: '$evaluation.percentage' },
              standardDeviation: { $stdDevPop: '$evaluation.percentage' },
              passed: { $sum: { $cond: ['$evaluation.passed', 1, 0] } },
              autoSubmitted: { $sum: { $cond: [{ $eq: ['$status', 'auto_submitted'] }, 1, 0] } },
              maxScore: { $max: '$evaluation.maxScore' },
            },
          },
          {
            $project: {
              _id: 0,
              studentsAttempted: 1,
              averageScore: round('$averageScore'),
              highestScore: 1,
              lowestScore: 1,
              maxScore: 1,
              averagePercentage: round('$averagePercentage'),
              standardDeviation: round('$standardDeviation'),
              passed: 1,
              failed: { $subtract: ['$studentsAttempted', '$passed'] },
              passRate: round({ $multiply: [{ $divide: ['$passed', '$studentsAttempted'] }, 100] }),
              autoSubmitted: 1,
            },
          },
        ],
        distribution: [
          {
            $bucket: {
              groupBy: '$evaluation.percentage',
              boundaries: SCORE_BANDS,
              default: 'other',
              output: { students: { $sum: 1 } },
            },
          },
        ],
        topPerformers: [
          { $sort: { 'evaluation.score': -1, submittedAt: 1 } },
          { $limit: 5 },
          {
            $lookup: {
              from: 'users',
              localField: 'student',
              foreignField: '_id',
              as: 'student',
              pipeline: [{ $project: { name: 1, rollNumber: 1 } }],
            },
          },
          { $unwind: '$student' },
          {
            $project: {
              _id: 0,
              name: '$student.name',
              rollNumber: '$student.rollNumber',
              score: '$evaluation.score',
              percentage: '$evaluation.percentage',
            },
          },
        ],
      },
    },
  ]);

  const stats = result.stats[0] || {
    studentsAttempted: 0,
    averageScore: 0,
    highestScore: 0,
    lowestScore: 0,
    maxScore: 0,
    averagePercentage: 0,
    standardDeviation: 0,
    passed: 0,
    failed: 0,
    passRate: 0,
    autoSubmitted: 0,
  };
  const counts = new Map(result.distribution.map((b) => [b._id, b.students]));
  const distribution = SCORE_BANDS.slice(0, -1).map((lower) => ({
    band: BAND_LABELS[lower],
    students: counts.get(lower) || 0,
  }));

  const [eligibleStudents, totalAttempts] = await Promise.all([
    countEligibleStudents(exam),
    Attempt.countDocuments({ exam: exam._id, status: { $in: FINAL_ATTEMPT_STATUSES } }),
  ]);

  return {
    exam: examHeader(exam),
    participation: {
      eligibleStudents,
      studentsAttempted: stats.studentsAttempted,
      participationRate: eligibleStudents ? Math.round((stats.studentsAttempted / eligibleStudents) * 10000) / 100 : 0,
      totalSubmittedAttempts: totalAttempts,
    },
    stats,
    distribution,
    topPerformers: result.topPerformers,
  };
}

// ---------------------------------------------------------------------------
// Pipeline 2: section-wise performance ($lookup users -> $group by section -> $lookup sections)
// ---------------------------------------------------------------------------
async function sectionWise(examId, actor) {
  const exam = await examService.getManagedExam(examId, actor);

  const sections = await Attempt.aggregate([
    ...bestAttemptStages(exam._id),
    {
      $lookup: {
        from: 'users',
        localField: 'student',
        foreignField: '_id',
        as: 'studentDoc',
        pipeline: [{ $project: { section: 1 } }],
      },
    },
    { $unwind: '$studentDoc' },
    {
      $group: {
        _id: '$studentDoc.section',
        studentsAttempted: { $sum: 1 },
        averageScore: { $avg: '$evaluation.score' },
        highestScore: { $max: '$evaluation.score' },
        lowestScore: { $min: '$evaluation.score' },
        averagePercentage: { $avg: '$evaluation.percentage' },
        passed: { $sum: { $cond: ['$evaluation.passed', 1, 0] } },
      },
    },
    {
      $lookup: {
        from: 'sections',
        localField: '_id',
        foreignField: '_id',
        as: 'section',
        pipeline: [{ $project: { code: 1, name: 1 } }],
      },
    },
    { $unwind: { path: '$section', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        sectionId: { $toString: '$_id' },
        sectionCode: { $ifNull: ['$section.code', 'NO-SECTION'] },
        sectionName: '$section.name',
        studentsAttempted: 1,
        averageScore: round('$averageScore'),
        highestScore: 1,
        lowestScore: 1,
        averagePercentage: round('$averagePercentage'),
        passed: 1,
        passRate: round({ $multiply: [{ $divide: ['$passed', '$studentsAttempted'] }, 100] }),
      },
    },
    { $sort: { averagePercentage: -1 } },
  ]);

  return { exam: examHeader(exam), sections };
}

// ---------------------------------------------------------------------------
// Pipeline 3: question-wise performance / item analysis ($unwind breakdown -> $group by question)
// ---------------------------------------------------------------------------
async function questionWise(examId, actor) {
  const exam = await examService.getManagedExam(examId, actor);

  const questions = await Attempt.aggregate([
    ...bestAttemptStages(exam._id),
    { $unwind: '$evaluation.breakdown' },
    {
      $group: {
        _id: '$evaluation.breakdown.question',
        timesServed: { $sum: 1 },
        correct: { $sum: { $cond: ['$evaluation.breakdown.isCorrect', 1, 0] } },
        unattempted: {
          $sum: { $cond: [{ $eq: [{ $ifNull: ['$evaluation.breakdown.selectedOption', null] }, null] }, 1, 0] },
        },
      },
    },
    {
      $addFields: {
        wrong: { $subtract: ['$timesServed', { $add: ['$correct', '$unattempted'] }] },
        correctRate: round({ $multiply: [{ $divide: ['$correct', '$timesServed'] }, 100] }),
      },
    },
    {
      $lookup: {
        from: 'questions',
        localField: '_id',
        foreignField: '_id',
        as: 'question',
        pipeline: [{ $project: { text: 1, topic: 1, difficulty: 1 } }],
      },
    },
    { $unwind: '$question' },
    {
      $project: {
        _id: 0,
        questionId: { $toString: '$_id' },
        text: '$question.text',
        topic: '$question.topic',
        difficulty: '$question.difficulty',
        timesServed: 1,
        correct: 1,
        wrong: 1,
        unattempted: 1,
        correctRate: 1,
      },
    },
    { $sort: { correctRate: 1, timesServed: -1 } }, // hardest questions first
  ]);

  // Topic roll-up, derived from the per-question rows.
  const topics = {};
  questions.forEach((q) => {
    const t = topics[q.topic] || { topic: q.topic, timesServed: 0, correct: 0 };
    t.timesServed += q.timesServed;
    t.correct += q.correct;
    topics[q.topic] = t;
  });
  const topicSummary = Object.values(topics)
    .map((t) => ({ ...t, correctRate: t.timesServed ? Math.round((t.correct / t.timesServed) * 10000) / 100 : 0 }))
    .sort((a, b) => a.correctRate - b.correctRate);

  return { exam: examHeader(exam), questions, topicSummary };
}

// ---------------------------------------------------------------------------
// Pipeline 4: ranked student-wise results ($setWindowFields $rank + $facet pagination)
// ---------------------------------------------------------------------------
async function studentWise(examId, actor, query = {}) {
  const exam = await examService.getManagedExam(examId, actor);
  const page = query.page || 1;
  const limit = query.limit || 20;

  const pipeline = [
    ...bestAttemptStages(exam._id),
    {
      $lookup: {
        from: 'users',
        localField: 'student',
        foreignField: '_id',
        as: 'studentDoc',
        pipeline: [{ $project: { name: 1, rollNumber: 1, email: 1, section: 1 } }],
      },
    },
    { $unwind: '$studentDoc' },
  ];
  if (query.section) pipeline.push({ $match: { 'studentDoc.section': oid(query.section) } });
  pipeline.push(
    { $setWindowFields: { sortBy: { 'evaluation.score': -1 }, output: { rank: { $rank: {} } } } },
    {
      $lookup: {
        from: 'sections',
        localField: 'studentDoc.section',
        foreignField: '_id',
        as: 'sectionDoc',
        pipeline: [{ $project: { code: 1 } }],
      },
    },
    { $unwind: { path: '$sectionDoc', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        rank: 1,
        attemptId: { $toString: '$_id' },
        student: {
          id: { $toString: '$studentDoc._id' },
          name: '$studentDoc.name',
          rollNumber: '$studentDoc.rollNumber',
          email: '$studentDoc.email',
        },
        section: '$sectionDoc.code',
        attemptNumber: 1,
        attemptsTaken: 1,
        status: 1,
        submittedAt: 1,
        score: '$evaluation.score',
        maxScore: '$evaluation.maxScore',
        percentage: '$evaluation.percentage',
        passed: '$evaluation.passed',
        correctCount: '$evaluation.correctCount',
        wrongCount: '$evaluation.wrongCount',
        unattemptedCount: '$evaluation.unattemptedCount',
      },
    },
    { $sort: { rank: 1, 'student.rollNumber': 1 } },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    }
  );

  const [result] = await Attempt.aggregate(pipeline);
  const total = result.total[0] ? result.total[0].count : 0;
  return {
    exam: examHeader(exam),
    items: result.items,
    meta: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
}

// ---------------------------------------------------------------------------
// Pipeline 5: one student's performance across exams (faculty: only their exams)
// ---------------------------------------------------------------------------
async function studentPerformance(studentId, actor) {
  const student = await User.findOne({ _id: studentId, role: ROLES.STUDENT }).populate('section', 'code name');
  if (!student) throw AppError.notFound('Student', 'STUDENT_NOT_FOUND');

  const pipeline = [
    { $match: { student: oid(studentId), status: { $in: FINAL_ATTEMPT_STATUSES }, evaluation: { $ne: null } } },
    {
      $lookup: {
        from: 'exams',
        localField: 'exam',
        foreignField: '_id',
        as: 'exam',
        pipeline: [{ $project: { title: 1, createdBy: 1, course: 1, passPercentage: 1 } }],
      },
    },
    { $unwind: '$exam' },
  ];
  if (actor.role === ROLES.FACULTY) pipeline.push({ $match: { 'exam.createdBy': oid(actor.id) } });
  pipeline.push(
    {
      $project: {
        _id: 0,
        attemptId: { $toString: '$_id' },
        examId: { $toString: '$exam._id' },
        examTitle: '$exam.title',
        attemptNumber: 1,
        status: 1,
        submittedAt: 1,
        score: '$evaluation.score',
        maxScore: '$evaluation.maxScore',
        percentage: '$evaluation.percentage',
        passed: '$evaluation.passed',
      },
    },
    { $sort: { submittedAt: -1 } }
  );

  const attempts = await Attempt.aggregate(pipeline);
  const averagePercentage = attempts.length
    ? Math.round((attempts.reduce((sum, a) => sum + a.percentage, 0) / attempts.length) * 100) / 100
    : 0;

  return {
    student: {
      id: String(student._id),
      name: student.name,
      rollNumber: student.rollNumber,
      section: student.section ? student.section.code : null,
    },
    examsAttempted: new Set(attempts.map((a) => a.examId)).size,
    averagePercentage,
    attempts,
  };
}

module.exports = { examSummary, sectionWise, questionWise, studentWise, studentPerformance };
