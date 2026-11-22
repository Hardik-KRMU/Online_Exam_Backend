const { Joi, objectId, idArray, pagination, idParam } = require('./common');
const { DIFFICULTY_LEVELS, EXAM_STATUS, EXAM_PHASE, RESULT_RELEASE } = require('../constants');

const assignedTo = Joi.object({
  sections: idArray,
  courses: idArray,
  students: idArray,
});

const autoSelect = Joi.object({
  count: Joi.number().integer().min(1).max(200).required(),
  topics: Joi.array().items(Joi.string().trim().max(80)).max(20),
  difficulty: Joi.string().valid(...DIFFICULTY_LEVELS),
});

const fields = {
  title: Joi.string().trim().min(3).max(150),
  instructions: Joi.string().trim().max(3000).allow(''),
  durationMinutes: Joi.number().integer().min(1).max(600),
  startTime: Joi.date().iso(),
  endTime: Joi.date().iso(),
  questionIds: Joi.array().items(objectId).unique().min(1).max(500),
  autoSelect,
  questionsPerAttempt: Joi.number().integer().min(1).max(500),
  shuffleQuestions: Joi.boolean(),
  shuffleOptions: Joi.boolean(),
  negativeMarking: Joi.object({
    enabled: Joi.boolean(),
    fraction: Joi.number().min(0).max(1),
  }),
  passPercentage: Joi.number().min(0).max(100),
  maxAttempts: Joi.number().integer().min(1).max(5),
  resultRelease: Joi.string().valid(...Object.values(RESULT_RELEASE)),
  assignedTo,
};

// A pool comes from explicit questionIds OR random autoSelect, not both.
const createExam = {
  body: Joi.object({
    ...fields,
    course: objectId.required(),
    title: fields.title.required(),
    durationMinutes: fields.durationMinutes.required(),
    startTime: fields.startTime.required(),
    endTime: fields.endTime.greater(Joi.ref('startTime')).required().messages({
      'date.greater': 'endTime must be after startTime',
    }),
  }).oxor('questionIds', 'autoSelect'),
};

const updateExam = {
  params: idParam(),
  body: Joi.object(fields).min(1).oxor('questionIds', 'autoSelect'),
};

const listExams = {
  query: Joi.object({
    ...pagination,
    status: Joi.string().valid(...Object.values(EXAM_STATUS)),
    phase: Joi.string().valid(...Object.values(EXAM_PHASE)),
    course: objectId,
    search: Joi.string().trim().max(100),
  }),
};

const examIdParam = { params: idParam() };

const auditQuery = {
  params: idParam(),
  query: Joi.object({ ...pagination }),
};

module.exports = { createExam, updateExam, listExams, examIdParam, auditQuery };
