const { Joi, objectId, pagination, idParam } = require('./common');
const { EXAM_PHASE } = require('../constants');

const answer = Joi.object({
  questionId: objectId.required(),
  optionId: objectId.allow(null).required(), // null clears a previously saved answer
});

const answers = Joi.array().items(answer).unique('questionId').max(500).messages({
  'array.unique': 'Each question may appear only once per request',
});

const listStudentExams = {
  query: Joi.object({
    ...pagination,
    phase: Joi.string().valid(...Object.values(EXAM_PHASE)),
  }),
};

const examIdParam = { params: idParam('examId') };
const attemptIdParam = { params: idParam('attemptId') };

const saveAnswers = {
  params: idParam('attemptId'),
  body: Joi.object({ answers: answers.min(1).required() }),
};

// Only optional final answers are accepted. A client-sent "score",
// "marks" or "status" is an unknown key and the request is rejected.
const submitAttempt = {
  params: idParam('attemptId'),
  body: Joi.object({ answers }),
};

module.exports = { listStudentExams, examIdParam, attemptIdParam, saveAnswers, submitAttempt };
