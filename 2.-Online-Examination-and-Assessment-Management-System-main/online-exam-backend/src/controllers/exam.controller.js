const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, requestContext } = require('../utils/apiResponse');
const { toStaffExam } = require('../utils/serializers');
const examService = require('../services/exam.service');
const attemptService = require('../services/attempt.service');
const auditService = require('../services/audit.service');

const createExam = asyncHandler(async (req, res) => {
  const exam = await examService.createExam(req.body, req.user, requestContext(req));
  sendSuccess(res, { statusCode: 201, message: 'Exam created as draft', data: toStaffExam(exam) });
});

const listExams = asyncHandler(async (req, res) => {
  const { items, meta } = await examService.listExams(req.query, req.user);
  // List view: omit the question pool to keep the payload small.
  const data = items.map((exam) => {
    const view = toStaffExam(exam);
    delete view.questionPool;
    return view;
  });
  sendSuccess(res, { data, meta });
});

const getExam = asyncHandler(async (req, res) => {
  const exam = await examService.getExamDetail(req.params.id, req.user);
  sendSuccess(res, { data: toStaffExam(exam) });
});

const updateExam = asyncHandler(async (req, res) => {
  const exam = await examService.updateExam(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Exam updated', data: toStaffExam(exam) });
});

const deleteExam = asyncHandler(async (req, res) => {
  await examService.deleteExam(req.params.id, req.user, requestContext(req));
  sendSuccess(res, { message: 'Exam deleted' });
});

const publishExam = asyncHandler(async (req, res) => {
  const exam = await examService.publishExam(req.params.id, req.user, requestContext(req));
  sendSuccess(res, { message: 'Exam published and students notified', data: toStaffExam(exam) });
});

const archiveExam = asyncHandler(async (req, res) => {
  const exam = await examService.archiveExam(req.params.id, req.user, requestContext(req));
  sendSuccess(res, { message: 'Exam archived', data: toStaffExam(exam) });
});

const publishResults = asyncHandler(async (req, res) => {
  const exam = await examService.publishResults(req.params.id, req.user, requestContext(req));
  sendSuccess(res, { message: 'Results published and students notified', data: toStaffExam(exam) });
});

const liveSnapshot = asyncHandler(async (req, res) => {
  await examService.getManagedExam(req.params.id, req.user);
  sendSuccess(res, { data: await attemptService.getLiveSnapshot(req.params.id) });
});

const examAuditLogs = asyncHandler(async (req, res) => {
  const exam = await examService.getManagedExam(req.params.id, req.user);
  const { items, meta } = await auditService.listAuditLogs(req.query, { entityType: 'Exam', entityId: exam._id });
  sendSuccess(res, { data: items, meta });
});

module.exports = {
  createExam,
  listExams,
  getExam,
  updateExam,
  deleteExam,
  publishExam,
  archiveExam,
  publishResults,
  liveSnapshot,
  examAuditLogs,
};
