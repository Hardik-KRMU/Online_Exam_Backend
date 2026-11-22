const { Joi, objectId, pagination, idParam } = require('./common');
const { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } = require('../constants');

const reportExamParam = { params: idParam('examId') };

const studentWiseReport = {
  params: idParam('examId'),
  query: Joi.object({
    page: pagination.page,
    limit: Joi.number().integer().min(1).max(100).default(20),
    section: objectId,
  }),
};

const studentReportParam = { params: idParam('studentId') };

const listAuditLogs = {
  query: Joi.object({
    ...pagination,
    action: Joi.string().valid(...Object.values(AUDIT_ACTIONS)),
    entityType: Joi.string().valid(...AUDIT_ENTITY_TYPES),
    entityId: objectId,
    actor: objectId,
    from: Joi.date().iso(),
    to: Joi.date().iso(),
  }),
};

const updateSettings = {
  body: Joi.object({
    allowStudentSelfRegistration: Joi.boolean(),
    submissionGraceSeconds: Joi.number().integer().min(0).max(300),
    defaultPassPercentage: Joi.number().min(0).max(100),
  }).min(1),
};

module.exports = { reportExamParam, studentWiseReport, studentReportParam, listAuditLogs, updateSettings };
