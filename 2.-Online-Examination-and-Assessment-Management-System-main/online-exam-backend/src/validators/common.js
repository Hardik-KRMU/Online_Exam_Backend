const Joi = require('joi');

const objectId = Joi.string()
  .trim()
  .hex()
  .length(24)
  .messages({
    'string.hex': '{{#label}} must be a valid 24-character id',
    'string.length': '{{#label}} must be a valid 24-character id',
  });

const idArray = Joi.array().items(objectId).unique().max(500);

// bcrypt only uses the first 72 bytes of a password, so longer passwords are rejected.
const password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/[A-Z]/, 'uppercase')
  .pattern(/[a-z]/, 'lowercase')
  .pattern(/[0-9]/, 'digit')
  .messages({ 'string.pattern.name': '{{#label}} must contain at least one {{#name}} character' });

const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(120);

const pagination = {
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
};

const idParam = (name = 'id') => Joi.object({ [name]: objectId.required() });

module.exports = { Joi, objectId, idArray, password, email, pagination, idParam };
