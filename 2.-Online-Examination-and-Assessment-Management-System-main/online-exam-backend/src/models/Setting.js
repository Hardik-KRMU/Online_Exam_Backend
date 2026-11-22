const mongoose = require('mongoose');

/** Platform settings managed by the administrator. A single document (key 'platform'). */
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'platform', unique: true, immutable: true },
    allowStudentSelfRegistration: { type: Boolean, default: true },
    // Extra seconds after a deadline during which a save/submit is still accepted,
    // to absorb network latency. Answers are never accepted after deadline + grace.
    submissionGraceSeconds: { type: Number, default: 30, min: 0, max: 300 },
    defaultPassPercentage: { type: Number, default: 40, min: 0, max: 100 },
  },
  { timestamps: true }
);

/** Returns the settings document, creating it with defaults on first use. */
settingSchema.statics.getSettings = function getSettings() {
  return this.findOneAndUpdate(
    { key: 'platform' },
    { $setOnInsert: { key: 'platform' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('Setting', settingSchema);
