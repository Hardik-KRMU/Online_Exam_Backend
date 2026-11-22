const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { toUser } = require('../utils/serializers');
const userService = require('../services/user.service');

const getMe = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.user.id);
  sendSuccess(res, { data: toUser(user) });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateMe(req.user.id, req.body);
  sendSuccess(res, { message: 'Profile updated', data: toUser(user) });
});

const changePassword = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user.id, req.body);
  sendSuccess(res, { message: 'Password changed. Please log in again on all devices.' });
});

const listUsers = asyncHandler(async (req, res) => {
  const { items, meta } = await userService.listUsers(req.query);
  sendSuccess(res, { data: items.map(toUser), meta });
});

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body);
  sendSuccess(res, { statusCode: 201, message: 'User created', data: toUser(user) });
});

const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  sendSuccess(res, { data: toUser(user) });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'User updated', data: toUser(user) });
});

const deactivateUser = asyncHandler(async (req, res) => {
  const user = await userService.deactivateUser(req.params.id, req.user);
  sendSuccess(res, { message: 'User deactivated', data: toUser(user) });
});

module.exports = { getMe, updateMe, changePassword, listUsers, createUser, getUser, updateUser, deactivateUser };
