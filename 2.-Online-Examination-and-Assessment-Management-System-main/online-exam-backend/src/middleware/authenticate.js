/**
 * Verifies "Authorization: Bearer <accessToken>" and attaches req.user.
 * The user is re-loaded from MongoDB on every request so a deactivated user or
 * a revoked session (tokenVersion changed) is rejected immediately, not when
 * the 15-minute token expires.
 */
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const authService = require('../services/auth.service');

module.exports = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw AppError.unauthorized('Access token missing. Send the header: Authorization: Bearer <token>', 'TOKEN_MISSING');
  }

  const { user } = await authService.authenticateAccessToken(token);
  req.user = authService.toActor(user);
  next();
});
