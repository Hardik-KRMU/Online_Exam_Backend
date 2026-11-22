/** Student-facing endpoints. Nothing here ever loads or returns an answer key. */
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, requestContext } = require('../utils/apiResponse');
const attemptService = require('../services/attempt.service');

const listMyExams = asyncHandler(async (req, res) => {
  const { items, meta } = await attemptService.listStudentExams(req.user, req.query);
  sendSuccess(res, { data: items, meta });
});

const getMyExam = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await attemptService.getStudentExam(req.params.examId, req.user) });
});

const startAttempt = asyncHandler(async (req, res) => {
  const { attempt, exam, resumed } = await attemptService.startAttempt(req.params.examId, req.user, requestContext(req));
  const view = await attemptService.toAttemptView(attempt, exam);
  sendSuccess(res, {
    statusCode: resumed ? 200 : 201,
    message: resumed ? 'Resumed your in-progress attempt' : 'Attempt started',
    data: view,
  });
});

const getAttempt = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await attemptService.getAttemptForStudent(req.params.attemptId, req.user) });
});

const saveAnswers = asyncHandler(async (req, res) => {
  const result = await attemptService.saveAnswers(req.params.attemptId, req.user, req.body.answers);
  sendSuccess(res, { message: 'Answers saved', data: result });
});

const submitAttempt = asyncHandler(async (req, res) => {
  const result = await attemptService.submitAttempt(req.params.attemptId, req.user, req.body);
  sendSuccess(res, { message: 'Attempt submitted', data: result });
});

const getResult = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await attemptService.getResultForStudent(req.params.attemptId, req.user) });
});

const listMyResults = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await attemptService.listStudentResults(req.user) });
});

module.exports = {
  listMyExams,
  getMyExam,
  startAttempt,
  getAttempt,
  saveAnswers,
  submitAttempt,
  getResult,
  listMyResults,
};
