const { Joi, password, email } = require('./common');

// No "role" key: unknown keys are rejected, so self-registration can only create students.
const register = {
  body: Joi.object({
    name: Joi.string().trim().min(2).max(80).required(),
    email: email.required(),
    password: password.required(),
    rollNumber: Joi.string().trim().alphanum().min(3).max(20).required(),
    sectionCode: Joi.string().trim().min(2).max(20).required(),
  }),
};

const login = {
  body: Joi.object({
    email: email.required(),
    password: Joi.string().max(72).required(),
  }),
};

const refreshToken = {
  body: Joi.object({
    refreshToken: Joi.string().trim().required(),
  }),
};

module.exports = { register, login, refreshToken };
