/**
 * Controllers are thin: read the (already validated) request, call a service,
 * shape the response. Business rules live in services; errors are thrown and
 * handled centrally.
 */
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, requestContext } = require('../utils/apiResponse');
const { toUser } = require('../utils/serializers');
const authService = require('../services/auth.service');

const register = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.register(req.body, requestContext(req));
  sendSuccess(res, { statusCode: 201, message: 'Registration successful', data: { user: toUser(user), ...tokens } });
});

const login = asyncHandler(async (req, res) => {
  const { user, tokens } = await authService.login(req.body, requestContext(req));
  sendSuccess(res, { message: 'Login successful', data: { user: toUser(user), ...tokens } });
});

const refresh = asyncHandler(async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken, requestContext(req));
  sendSuccess(res, { message: 'Tokens refreshed', data: tokens });
});

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  sendSuccess(res, { message: 'Logged out' });
});

const logoutAll = asyncHandler(async (req, res) => {
  await authService.revokeAllSessions(req.user.id);
  sendSuccess(res, { message: 'All sessions revoked. Every device must log in again.' });
});

module.exports = { register, login, refresh, logout, logoutAll };
