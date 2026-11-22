const mongoose = require('mongoose');
const { EXAM_STATUS, RESULT_RELEASE } = require('../constants');

const { ObjectId } = mongoose.Schema.Types;

// A question in the exam's pool. Marks are copied from the question when it is
// added, so later edits to the bank cannot silently change an exam's marking.
const examQuestionSchema = new mongoose.Schema(
  {
    question: { type: ObjectId, ref: 'Question', required: true },
    marks: { type: Number, required: true, min: 0.5 },
  },
  { _id: false }
);

const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, minlength: 3, maxlength: 150 },
    instructions: { type: String, trim: true, maxlength: 3000, default: '' },
    course: { type: ObjectId, ref: 'Course', required: [true, 'Course is required'] },
    createdBy: { type: ObjectId, ref: 'User', required: true },

    durationMinutes: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be at least 1 minute'],
      max: [600, 'Duration must be at most 600 minutes'],
    },
    startTime: { type: Date, required: [true, 'Start time is required'] },
    endTime: { type: Date, required: [true, 'End time is required'] },

    questions: { type: [examQuestionSchema], default: [] }, // the pool
    questionsPerAttempt: { type: Number, min: 1 }, // each attempt gets this many, drawn from the pool
    shuffleQuestions: { type: Boolean, default: true },
    shuffleOptions: { type: Boolean, default: true },
    negativeMarking: {
      enabled: { type: Boolean, default: false },
      fraction: { type: Number, default: 0.25, min: 0, max: 1 }, // share of the question's marks deducted
    },
    passPercentage: { type: Number, default: 40, min: 0, max: 100 },
    maxAttempts: { type: Number, default: 1, min: 1, max: 5 },

    resultRelease: { type: String, enum: Object.values(RESULT_RELEASE), default: RESULT_RELEASE.MANUAL },
    resultsPublished: { type: Boolean, default: false },
    resultsPublishedAt: { type: Date },

    assignedTo: {
      sections: [{ type: ObjectId, ref: 'Section' }],
      courses: [{ type: ObjectId, ref: 'Course' }],
      students: [{ type: ObjectId, ref: 'User' }],
    },

    status: { type: String, enum: Object.values(EXAM_STATUS), default: EXAM_STATUS.DRAFT },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

// Cross-field rules that a single field validator cannot express.
examSchema.pre('validate', function validateTiming() {
  if (this.startTime && this.endTime) {
    if (this.endTime <= this.startTime) {
      this.invalidate('endTime', 'endTime must be after startTime');
    } else if (this.durationMinutes) {
      const windowMinutes = (this.endTime - this.startTime) / 60000;
      if (this.durationMinutes > windowMinutes) {
        this.invalidate(
          'durationMinutes',
          `durationMinutes (${this.durationMinutes}) cannot exceed the exam window (${Math.floor(windowMinutes)} minutes)`
        );
      }
    }
  }
  if (this.questions.length > 0) {
    if (!this.questionsPerAttempt) this.questionsPerAttempt = this.questions.length;
    if (this.questionsPerAttempt > this.questions.length) {
      this.invalidate(
        'questionsPerAttempt',
        `questionsPerAttempt (${this.questionsPerAttempt}) cannot exceed the question pool size (${this.questions.length})`
      );
    }
  }
});

// Student exam listing: published exams assigned to my section / course / me.
// Multikey indexes (one array field each) with status as a second key.
examSchema.index({ 'assignedTo.sections': 1, status: 1 });
examSchema.index({ 'assignedTo.courses': 1, status: 1 });
examSchema.index({ 'assignedTo.students': 1, status: 1 });
// Faculty dashboard: "my exams, newest first".
examSchema.index({ createdBy: 1, createdAt: -1 });
// Upcoming / live listings ordered by start time.
examSchema.index({ status: 1, startTime: 1 });
// Prevents deleting a question that an exam still uses.
examSchema.index({ 'questions.question': 1 });

module.exports = mongoose.model('Exam', examSchema);
