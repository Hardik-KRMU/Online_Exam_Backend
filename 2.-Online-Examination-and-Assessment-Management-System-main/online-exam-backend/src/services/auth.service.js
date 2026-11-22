const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User, Section, RefreshToken, Setting } = require('../models');
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants');
const config = require('../config/env');
const eventBus = require('../events/eventBus');
const EVENTS = require('../events/eventNames');
const tokenService = require('./token.service');

// Compared against when the email does not exist, so a wrong email takes as
// long as a wrong password (prevents discovering valid emails by timing).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

/** The minimal identity passed from controllers to services. */
function toActor(user) {
  return {
    id: String(user._id),
    role: user.role,
    name: user.name,
    email: user.email,
    rollNumber: user.rollNumber || null,
    section: user.section ? String(user.section._id || user.section) : null,
  };
}

async function issueTokens(user, { family = crypto.randomUUID(), ip, userAgent } = {}) {
  const accessToken = tokenService.signAccessToken(user);
  const { token: refreshToken, jti, expiresAt } = tokenService.signRefreshToken(user._id, family);
  await RefreshToken.create({ user: user._id, jti, family, expiresAt, createdByIp: ip, userAgent });
  return {
    tokens: {
      tokenType: 'Bearer',
      accessToken,
      accessTokenExpiresIn: config.jwt.accessExpiresIn,
      refreshToken,
      refreshTokenExpiresAt: expiresAt,
    },
    jti,
  };
}

/**
 * Student self-registration. The role is always 'student' here; the request
 * schema rejects a "role" field, so nobody can register themselves as admin.
 * Faculty and admin accounts are created by an administrator.
 */
async function register({ name, email, password, rollNumber, sectionCode }, ctx = {}) {
  const settings = await Setting.getSettings();
  if (!settings.allowStudentSelfRegistration) {
    throw AppError.forbidden('Self-registration is disabled. Contact the administrator.', 'REGISTRATION_DISABLED');
  }

  if (await User.exists({ email: email.toLowerCase() })) {
    throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }

  const section = await Section.findOne({ code: sectionCode.toUpperCase() }).select('_id code name');
  if (!section) throw AppError.badRequest(`Section '${sectionCode}' does not exist`, 'INVALID_SECTION');

  const user = await User.create({
    name,
    email,
    password,
    rollNumber,
    section: section._id,
    role: ROLES.STUDENT,
  });

  const { tokens } = await issueTokens(user, ctx);
  user.section = section;
  return { user, tokens };
}

async function login({ email, password }, ctx = {}) {
  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+password +tokenVersion')
    .populate('section', 'code name');

  const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !passwordOk) {
    eventBus.emit(EVENTS.LOGIN_FAILED, {
      email,
      userId: user ? user._id : null,
      reason: user ? 'wrong_password' : 'unknown_email',
      ip: ctx.ip,
    });
    // Same message for both cases: do not reveal whether the email exists.
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw AppError.forbidden('This account has been deactivated', 'ACCOUNT_DEACTIVATED');
  }

  user.lastLoginAt = new Date();
  await User.updateOne({ _id: user._id }, { lastLoginAt: user.lastLoginAt });

  const { tokens } = await issueTokens(user, ctx);
  eventBus.emit(EVENTS.USER_LOGGED_IN, { user, ip: ctx.ip });
  return { user, tokens };
}

/**
 * Refresh-token rotation with reuse detection:
 * 1. Verify the JWT signature/expiry, then look up its jti.
 * 2. If that jti was ALREADY used (revoked), someone is replaying an old token,
 *    so revoke the whole family (every token from that login) and refuse.
 * 3. Otherwise revoke it atomically and issue a new pair in the same family.
 */
async function refresh(refreshToken, ctx = {}) {
  const payload = tokenService.verifyRefreshToken(refreshToken);
  const stored = await RefreshToken.findOne({ jti: payload.jti });
  if (!stored) throw AppError.unauthorized('Refresh token is not recognised', 'REFRESH_TOKEN_INVALID');

  const revokeFamily = async () => {
    await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { revokedAt: new Date() });
    eventBus.emit(EVENTS.REFRESH_TOKEN_REUSED, { userId: stored.user, family: stored.family, ip: ctx.ip });
    return AppError.unauthorized(
      'Refresh token reuse detected. All sessions from this login were revoked; please log in again.',
      'REFRESH_TOKEN_REUSED'
    );
  };

  if (stored.revokedAt) throw await revokeFamily();

  const user = await User.findById(stored.user).select('+tokenVersion');
  if (!user || !user.isActive) throw AppError.unauthorized('User account is not active', 'USER_INACTIVE');

  // Atomic "use once": only one of two simultaneous refresh calls can win.
  const claimed = await RefreshToken.findOneAndUpdate(
    { _id: stored._id, revokedAt: null },
    { revokedAt: new Date() },
    { new: true }
  );
  if (!claimed) throw await revokeFamily();

  const { tokens, jti } = await issueTokens(user, { family: stored.family, ...ctx });
  await RefreshToken.updateOne({ _id: stored._id }, { replacedBy: jti });
  return tokens;
}

/** Revokes one refresh token. Always succeeds (logging out twice is not an error). */
async function logout(refreshToken) {
  let payload;
  try {
    payload = tokenService.verifyRefreshToken(refreshToken);
  } catch (err) {
    return { revoked: false };
  }
  const result = await RefreshToken.updateOne({ jti: payload.jti, revokedAt: null }, { revokedAt: new Date() });
  return { revoked: result.modifiedCount === 1 };
}

/** Ends every session of a user: refresh tokens revoked AND access tokens invalidated. */
async function revokeAllSessions(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}

/** Shared by the HTTP authenticate middleware and the Socket.IO handshake. */
async function authenticateAccessToken(token) {
  const payload = tokenService.verifyAccessToken(token);
  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || !user.isActive) {
    throw AppError.unauthorized('User account not found or deactivated', 'USER_INACTIVE');
  }
  if ((user.tokenVersion || 0) !== payload.tv) {
    throw AppError.unauthorized('This session has been revoked. Please log in again.', 'TOKEN_REVOKED');
  }
  return { user, payload };
}

module.exports = {
  toActor,
  register,
  login,
  refresh,
  logout,
  revokeAllSessions,
  authenticateAccessToken,
};
