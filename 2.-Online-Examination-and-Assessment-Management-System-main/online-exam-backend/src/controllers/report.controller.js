const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const reportService = require('../services/report.service');

const examSummary = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await reportService.examSummary(req.params.examId, req.user) });
});

const sectionWise = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await reportService.sectionWise(req.params.examId, req.user) });
});

const questionWise = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await reportService.questionWise(req.params.examId, req.user) });
});

const studentWise = asyncHandler(async (req, res) => {
  const { exam, items, meta } = await reportService.studentWise(req.params.examId, req.user, req.query);
  sendSuccess(res, { data: { exam, items }, meta });
});

const studentPerformance = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await reportService.studentPerformance(req.params.studentId, req.user) });
});

module.exports = { examSummary, sectionWise, questionWise, studentWise, studentPerformance };
