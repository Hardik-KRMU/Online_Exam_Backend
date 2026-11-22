const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const auditService = require('../services/audit.service');
const settingService = require('../services/setting.service');

const toSettings = (s) => ({
  allowStudentSelfRegistration: s.allowStudentSelfRegistration,
  submissionGraceSeconds: s.submissionGraceSeconds,
  defaultPassPercentage: s.defaultPassPercentage,
  updatedAt: s.updatedAt,
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const { items, meta } = await auditService.listAuditLogs(req.query);
  sendSuccess(res, { data: items, meta });
});

const getSettings = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: toSettings(await settingService.getSettings()) });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingService.updateSettings(req.body);
  sendSuccess(res, { message: 'Settings updated', data: toSettings(settings) });
});

module.exports = { listAuditLogs, getSettings, updateSettings };
