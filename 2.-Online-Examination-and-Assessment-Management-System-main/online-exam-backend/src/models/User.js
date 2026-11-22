const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const { ROLES } = require('../constants');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must be at most 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true, // creates a unique index
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email is invalid'],
    },
    // Stores the bcrypt HASH, never the plain password. select:false keeps it
    // out of every query result unless explicitly requested with .select('+password').
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.STUDENT,
      required: true,
    },
    rollNumber: {
      type: String,
      trim: true,
      uppercase: true,
      required: [
        function requiredForStudents() {
          return this.role === ROLES.STUDENT;
        },
        'Roll number is required for students',
      ],
    },
    section: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
      required: [
        function requiredForStudents() {
          return this.role === ROLES.STUDENT;
        },
        'Section is required for students',
      ],
    },
    department: { type: String, trim: true, maxlength: 80 },
    isActive: { type: Boolean, default: true },
    // Incremented on "logout everywhere", password change or deactivation.
    // Every access token carries the version it was issued with; a mismatch = revoked.
    tokenVersion: { type: Number, default: 0, select: false },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.tokenVersion;
        return ret;
      },
    },
  }
);

// Roll numbers are unique, but only students have one (partial index ignores missing values).
userSchema.index(
  { rollNumber: 1 },
  { unique: true, partialFilterExpression: { rollNumber: { $type: 'string' } } }
);
// Supports "list students of section X" and "count eligible students" queries.
userSchema.index({ role: 1, section: 1 });

// Hash the password whenever it is set or changed (document.save() only;
// findOneAndUpdate bypasses this hook, so password changes always use save()).
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, config.bcryptSaltRounds);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
