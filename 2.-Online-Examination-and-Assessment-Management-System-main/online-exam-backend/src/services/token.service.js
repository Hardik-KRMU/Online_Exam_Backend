/**
 * JWT helpers.
 * - Access token: short-lived (15m), sent on every request, stateless.
 *   Payload: { sub: userId, role, tv: tokenVersion }.
 * - Refresh token: long-lived (7d), only sent to /api/auth/refresh and /logout,
 *   signed with a DIFFERENT secret and tracked in MongoDB by its jti so it can be
 *   revoked and rotated.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config/env');
const AppError = require('../utils/AppError');

const ALGORITHM = 'HS256';

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, tv: user.tokenVersion || 0 },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn, algorithm: ALGORITHM }
  );
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwt.accessSecret, { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Access token has expired. Call POST /api/auth/refresh', 'TOKEN_EXPIRED');
    }
    throw AppError.unauthorized('Access token is invalid', 'TOKEN_INVALID');
  }
}

function signRefreshToken(userId, family) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: String(userId), jti, fam: family }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
    algorithm: ALGORITHM,
  });
  const { exp } = jwt.decode(token);
  return { token, jti, expiresAt: new Date(exp * 1000) };
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, config.jwt.refreshSecret, { algorithms: [ALGORITHM] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Refresh token has expired. Please log in again.', 'REFRESH_TOKEN_EXPIRED');
    }
    throw AppError.unauthorized('Refresh token is invalid', 'REFRESH_TOKEN_INVALID');
  }
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
};
