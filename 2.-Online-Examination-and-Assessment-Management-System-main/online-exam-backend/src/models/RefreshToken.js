const mongoose = require('mongoose');

/**
 * Server-side record of every refresh token issued. The token itself is a JWT
 * signed with JWT_REFRESH_SECRET; this record lets the server revoke it
 * (logout), rotate it (one-time use) and detect reuse of a stolen token.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jti: { type: String, required: true, unique: true }, // JWT ID claim
    family: { type: String, required: true }, // all tokens descended from one login
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null }, // jti of the token issued on rotation
    createdByIp: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

// TTL index: MongoDB deletes the record automatically once expiresAt passes.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ user: 1 });
refreshTokenSchema.index({ family: 1 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
