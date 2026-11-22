const mongoose = require('mongoose');
const { DIFFICULTY_LEVELS } = require('../constants');

const optionSchema = new mongoose.Schema(
  {
    text: { type: String, required: [true, 'Option text is required'], trim: true, maxlength: 500 },
  },
  { _id: true } // each option gets its own ObjectId; answers reference option ids, not positions
);

const questionSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: [true, 'Course is required'] },
    text: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      minlength: [5, 'Question text must be at least 5 characters'],
      maxlength: [2000, 'Question text must be at most 2000 characters'],
    },
    type: { type: String, enum: ['mcq'], default: 'mcq' },
    options: {
      type: [optionSchema],
      validate: {
        validator: (options) => Array.isArray(options) && options.length >= 2 && options.length <= 6,
        message: 'A question must have between 2 and 6 options',
      },
    },
    // The answer key. select:false = it is NEVER loaded unless a query asks for
    // '+correctOption'. Only faculty/admin code paths and the evaluator do that.
    correctOption: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Correct option is required'],
      select: false,
    },
    marks: { type: Number, default: 1, min: [0.5, 'Marks must be at least 0.5'], max: [20, 'Marks must be at most 20'] },
    topic: { type: String, required: [true, 'Topic is required'], trim: true, lowercase: true, maxlength: 80 },
    difficulty: { type: String, enum: DIFFICULTY_LEVELS, default: 'medium' },
    tags: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// The correct option must be one of this question's own options.
questionSchema.path('correctOption').validate(function correctOptionBelongs(value) {
  if (!value || !Array.isArray(this.options)) return false;
  return this.options.some((option) => String(option._id) === String(value));
}, 'correctOption must be the id of one of the options');

// Question-bank filtering: course + topic + difficulty (equality fields first).
questionSchema.index({ course: 1, topic: 1, difficulty: 1 });
// "My questions, newest first".
questionSchema.index({ createdBy: 1, createdAt: -1 });
// Keyword search over question text and topic.
questionSchema.index({ text: 'text', topic: 'text' });

module.exports = mongoose.model('Question', questionSchema);
