const { Joi, objectId, pagination, idParam } = require('./common');
const { DIFFICULTY_LEVELS } = require('../constants');

const option = Joi.object({ text: Joi.string().trim().min(1).max(500).required() });

const options = Joi.array()
  .items(option)
  .min(2)
  .max(6)
  .unique((a, b) => a.text.trim().toLowerCase() === b.text.trim().toLowerCase())
  .messages({ 'array.unique': 'Options must not repeat' });

// correctOptionIndex must point inside the options array when options are sent.
const correctOptionIndex = Joi.number()
  .integer()
  .min(0)
  .when('options', {
    is: Joi.exist(),
    then: Joi.number().max(Joi.ref('options', { adjust: (opts) => (Array.isArray(opts) ? opts.length - 1 : 0) })),
  });

const fields = {
  text: Joi.string().trim().min(5).max(2000),
  options,
  correctOptionIndex,
  marks: Joi.number().min(0.5).max(20).precision(2),
  topic: Joi.string().trim().min(1).max(80),
  difficulty: Joi.string().valid(...DIFFICULTY_LEVELS),
  tags: Joi.array().items(Joi.string().trim().max(30)).max(10),
};

const createQuestion = {
  body: Joi.object({
    course: objectId.required(),
    text: fields.text.required(),
    options: fields.options.required(),
    correctOptionIndex: fields.correctOptionIndex.required(),
    marks: fields.marks.default(1),
    topic: fields.topic.required(),
    difficulty: fields.difficulty.default('medium'),
    tags: fields.tags,
  }),
};

// course cannot change after creation; options must come with a new correctOptionIndex.
const updateQuestion = {
  params: idParam(),
  body: Joi.object({ ...fields, isArchived: Joi.boolean() })
    .min(1)
    .with('options', 'correctOptionIndex'),
};

const listQuestions = {
  query: Joi.object({
    ...pagination,
    course: objectId,
    topic: Joi.string().trim().max(80),
    difficulty: Joi.string().valid(...DIFFICULTY_LEVELS),
    search: Joi.string().trim().max(100),
    mine: Joi.boolean(),
    includeArchived: Joi.boolean(),
  }),
};

const questionIdParam = { params: idParam() };

module.exports = { createQuestion, updateQuestion, listQuestions, questionIdParam };
