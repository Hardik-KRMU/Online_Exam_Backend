const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Course code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z0-9-]{2,20}$/, 'Course code may contain letters, digits and hyphens (2-20 chars)'],
    },
    title: { type: String, required: [true, 'Course title is required'], trim: true, maxlength: 120 },
    department: { type: String, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 1000 },
    // Faculty members who teach this course. Only they (and admins) may create
    // questions and exams for it.
    faculty: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// "Which courses does this faculty member teach?" is asked on almost every faculty request.
courseSchema.index({ faculty: 1 });

module.exports = mongoose.model('Course', courseSchema);
