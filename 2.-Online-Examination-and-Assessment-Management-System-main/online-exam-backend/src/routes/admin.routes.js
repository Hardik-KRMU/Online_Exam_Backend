const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const v = require('../validators/misc.validator');
const c = require('../controllers/admin.controller');
const { ROLES } = require('../constants');

const adminOnly = [authenticate, authorize(ROLES.ADMIN)];

// /api/audit-logs
const auditRouter = express.Router();
auditRouter.get('/', adminOnly, validate(v.listAuditLogs), c.listAuditLogs);

// /api/settings
const settingRouter = express.Router();
settingRouter.get('/', adminOnly, c.getSettings);
settingRouter.patch('/', adminOnly, validate(v.updateSettings), c.updateSettings);

module.exports = { auditRouter, settingRouter };
