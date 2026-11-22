const mongoose = require('mongoose');
const { ATTEMPT_STATUS } = require('../constants');

const { ObjectId } = mongoose.Schema.Types;

// The exact paper this student received: which questions, in which order,
// with options in which order. Fixed at start time so a refresh shows the same paper.
const attemptQuestionSchema = new mongoose.Schema(
  {
    question: { type: ObjectId, ref: 'Question', required: true },
    optionOrder: [{ type: ObjectId }],
    marks: { type: Number, required: true },
  },
  { _id: false }
);

const answerSchema = new mongoose.Schema(
  {
    option: { type: ObjectId, required: true },
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const breakdownSchema = new mongoose.Schema(
  {
    question: { type: ObjectId, ref: 'Question' },
    selectedOption: { type: ObjectId, default: null },
    isCorrect: { type: Boolean },
    marksAwarded: { type: Number },
  },
  { _id: false }
);

const evaluationSchema = new mongoose.Schema(
  {
    score: Number,
    maxScore: Number,
    percentage: Number,
    correctCount: Number,
    wrongCount: Number,
    unattemptedCount: Number,
    passed: Boolean,
    evaluatedAt: Date,
    breakdown: [breakdownSchema],
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    exam: { type: ObjectId, ref: 'Exam', required: true },
    student: { type: ObjectId, ref: 'User', required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: Object.values(ATTEMPT_STATUS),
      default: ATTEMPT_STATUS.IN_PROGRESS,
    },
    startedAt: { type: Date, required: true },
    deadline: { type: Date, required: true }, // min(startedAt + duration, exam.endTime)
    submittedAt: { type: Date },
    lastSavedAt: { type: Date },
    questions: { type: [attemptQuestionSchema], default: [] },
    // Map keyed by questionId -> { option, answeredAt }. A Map lets one answer be
    // written atomically with $set: { 'answers.<questionId>': ... }, so two
    // browser tabs saving different answers cannot overwrite each other.
    answers: { type: Map, of: answerSchema, default: () => new Map() },
    // Filled by the server's evaluator. null until evaluated.
    evaluation: { type: evaluationSchema, default: null },
    clientInfo: {
      ip: String,
      userAgent: String,
    },
  },
  { timestamps: true }
);

// One row per (exam, student, attempt number): two concurrent "start" requests
// cannot both create attempt #1.
attemptSchema.index({ exam: 1, student: 1, attemptNumber: 1 }, { unique: true });
// At most ONE in-progress attempt per student per exam (partial unique index:
// only documents with status 'in_progress' are in this index).
attemptSchema.index(
  { exam: 1, student: 1 },
  { unique: true, partialFilterExpression: { status: ATTEMPT_STATUS.IN_PROGRESS }, name: 'one_active_attempt_per_student' }
);
// Auto-submit job: find in-progress attempts whose deadline has passed.
attemptSchema.index({ status: 1, deadline: 1 });
// Reports and live monitoring: all attempts of an exam by status.
attemptSchema.index({ exam: 1, status: 1 });
// Student result history.
attemptSchema.index({ student: 1, submittedAt: -1 });

module.exports = mongoose.model('Attempt', attemptSchema);
