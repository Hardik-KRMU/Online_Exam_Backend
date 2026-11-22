const mongoose = require('mongoose');

/**
 * An academic group (class/section) such as "CSE-3A". Students belong to exactly
 * one section; a section studies several courses.
 */
const sectionSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Section code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9-]{2,20}$/, 'Section code may contain letters, digits and hyphens (2-20 chars)'],
    },
    name: { type: String, required: [true, 'Section name is required'], trim: true, maxlength: 120 },
    department: { type: String, trim: true, maxlength: 80 },
    academicYear: {
      type: String,
      trim: true,
      match: [/^\d{4}-\d{2}$/, 'Academic year must look like 2026-27'],
    },
    courses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  },
  { timestamps: true }
);

// Resolves "exam assigned to course X" into the sections that study course X.
sectionSchema.index({ courses: 1 });

module.exports = mongoose.model('Section', sectionSchema);
