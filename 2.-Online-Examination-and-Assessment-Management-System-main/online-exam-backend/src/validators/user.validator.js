const { Joi, objectId, password, email, pagination, idParam } = require('./common');
const { ROLES } = require('../constants');

const updateMe = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
  }),
};

const changePassword = {
  body: Joi.object({
    currentPassword: Joi.string().max(72).required(),
    newPassword: password
      .required()
      .invalid(Joi.ref('currentPassword'))
      .messages({ 'any.invalid': 'newPassword must be different from currentPassword' }),
  }),
};

const studentOnly = (schema) =>
  Joi.when('role', { is: ROLES.STUDENT, then: schema.required(), otherwise: Joi.forbidden() });

const createUser = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
    email: email.required(),
    password: password.required(),
    role: Joi.string()
      .valid(...Object.values(ROLES))
      .required(),
    rollNumber: studentOnly(Joi.string().trim().alphanum().min(3).max(20)),
    section: studentOnly(objectId),
    department: Joi.string().trim().max(80),
  }),
};

const updateUser = {
  params: idParam(),
  body: Joi.object({
    name: Joi.string().trim().min(2).max(80),
    email,
    password,
    role: Joi.string().valid(...Object.values(ROLES)),
    rollNumber: Joi.string().trim().alphanum().min(3).max(20),
    section: objectId,
    department: Joi.string().trim().max(80),
    isActive: Joi.boolean(),
  }).min(1),
};

const listUsers = {
  query: Joi.object({
    ...pagination,
    role: Joi.string().valid(...Object.values(ROLES)),
    section: objectId,
    isActive: Joi.boolean(),
    search: Joi.string().trim().max(100),
  }),
};

const userIdParam = { params: idParam() };

module.exports = { updateMe, changePassword, createUser, updateUser, listUsers, userIdParam };
