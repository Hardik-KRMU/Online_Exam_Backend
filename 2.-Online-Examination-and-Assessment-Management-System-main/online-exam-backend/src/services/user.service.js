const { User, Section } = require('../models');
const AppError = require('../utils/AppError');
const { ROLES } = require('../constants');
const { getPagination, buildMeta, escapeRegex } = require('../utils/pagination');
const authService = require('./auth.service');

async function getById(userId) {
  const user = await User.findById(userId).populate('section', 'code name');
  if (!user) throw AppError.notFound('User', 'USER_NOT_FOUND');
  return user;
}

/** Users may change only their own name. Role, email, section are admin-only. */
async function updateMe(userId, { name }) {
  const user = await getById(userId);
  user.name = name;
  await user.save();
  return user;
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw AppError.notFound('User', 'USER_NOT_FOUND');
  if (!(await user.comparePassword(currentPassword))) {
    throw AppError.unauthorized('Current password is incorrect', 'INVALID_CREDENTIALS');
  }
  user.password = newPassword; // hashed by the pre-save hook
  await user.save();
  // A changed password must end every existing session.
  await authService.revokeAllSessions(user._id);
}

async function assertSectionExists(sectionId) {
  if (!sectionId) return;
  if (!(await Section.exists({ _id: sectionId }))) {
    throw AppError.badRequest('Section does not exist', 'INVALID_SECTION');
  }
}

// ---------- Administrator operations ----------

async function listUsers(query) {
  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.section) filter.section = query.section;
  if (typeof query.isActive === 'boolean') filter.isActive = query.isActive;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { rollNumber: rx }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).populate('section', 'code name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items, meta: buildMeta({ page, limit }, total) };
}

async function createUser(data) {
  if (await User.exists({ email: data.email.toLowerCase() })) {
    throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
  }
  await assertSectionExists(data.section);
  const user = await User.create(data);
  return getById(user._id);
}

async function updateUser(userId, data, actor) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw AppError.notFound('User', 'USER_NOT_FOUND');

  if (String(user._id) === actor.id && (data.role || data.isActive === false)) {
    throw AppError.badRequest('Administrators cannot change their own role or deactivate themselves', 'SELF_MODIFICATION');
  }
  if (data.email && data.email.toLowerCase() !== user.email) {
    if (await User.exists({ email: data.email.toLowerCase(), _id: { $ne: user._id } })) {
      throw AppError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    }
  }
  await assertSectionExists(data.section);

  const sessionChanging =
    (data.role && data.role !== user.role) || data.isActive === false || Boolean(data.password);

  Object.assign(user, data);
  if (user.role !== ROLES.STUDENT) {
    user.section = undefined;
    user.rollNumber = undefined;
  }
  await user.save(); // runs schema validators and the password-hashing hook

  if (sessionChanging) await authService.revokeAllSessions(user._id);
  return getById(user._id);
}

/**
 * Soft delete: the account is deactivated, not removed, because past attempts
 * and results reference it. Deactivation also kills all of the user's sessions.
 */
async function deactivateUser(userId, actor) {
  if (userId === actor.id) {
    throw AppError.badRequest('Administrators cannot deactivate themselves', 'SELF_MODIFICATION');
  }
  const user = await User.findByIdAndUpdate(userId, { isActive: false }, { new: true });
  if (!user) throw AppError.notFound('User', 'USER_NOT_FOUND');
  await authService.revokeAllSessions(user._id);
  return user;
}

module.exports = {
  getById,
  updateMe,
  changePassword,
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
};
