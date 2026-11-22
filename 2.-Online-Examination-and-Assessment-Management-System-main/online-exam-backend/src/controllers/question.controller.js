const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const { toStaffQuestion } = require('../utils/serializers');
const questionService = require('../services/question.service');

const createQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.createQuestion(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Question created', data: toStaffQuestion(question) });
});

const listQuestions = asyncHandler(async (req, res) => {
  const { items, meta } = await questionService.listQuestions(req.query, req.user);
  sendSuccess(res, { data: items.map(toStaffQuestion), meta });
});

const getQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.getQuestion(req.params.id, req.user);
  sendSuccess(res, { data: toStaffQuestion(question) });
});

const updateQuestion = asyncHandler(async (req, res) => {
  const question = await questionService.updateQuestion(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Question updated', data: toStaffQuestion(question) });
});

const deleteQuestion = asyncHandler(async (req, res) => {
  await questionService.deleteQuestion(req.params.id, req.user);
  sendSuccess(res, { message: 'Question deleted' });
});

module.exports = { createQuestion, listQuestions, getQuestion, updateQuestion, deleteQuestion };
