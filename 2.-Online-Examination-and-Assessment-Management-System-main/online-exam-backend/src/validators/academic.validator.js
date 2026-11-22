const { Joi, idArray, objectId, pagination, idParam } = require('./common');

const code = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^[A-Z0-9-]{2,20}$/)
  .messages({ 'string.pattern.base': '{{#label}} may contain letters, digits and hyphens (2-20 characters)' });

const courseBody = {
  code,
  title: Joi.string().trim().min(2).max(120),
  department: Joi.string().trim().max(80),
  description: Joi.string().trim().max(1000).allow(''),
  faculty: idArray,
};

const createCourse = {
  body: Joi.object({ ...courseBody, code: code.required(), title: courseBody.title.required() }),
};
const updateCourse = { params: idParam(), body: Joi.object(courseBody).min(1) };
const listCourses = {
  query: Joi.object({
    ...pagination,
    search: Joi.string().trim().max(100),
    department: Joi.string().trim().max(80),
    mine: Joi.boolean(),
  }),
};

const sectionBody = {
  code,
  name: Joi.string().trim().min(2).max(120),
  department: Joi.string().trim().max(80),
  academicYear: Joi.string()
    .trim()
    .pattern(/^\d{4}-\d{2}$/)
    .messages({ 'string.pattern.base': 'academicYear must look like 2026-27' }),
  courses: idArray,
};

const createSection = {
  body: Joi.object({ ...sectionBody, code: code.required(), name: sectionBody.name.required() }),
};
const updateSection = { params: idParam(), body: Joi.object(sectionBody).min(1) };
const listSections = {
  query: Joi.object({
    ...pagination,
    search: Joi.string().trim().max(100),
    department: Joi.string().trim().max(80),
    course: objectId,
  }),
};

const idOnly = { params: idParam() };

module.exports = {
  createCourse,
  updateCourse,
  listCourses,
  createSection,
  updateSection,
  listSections,
  idOnly,
};
