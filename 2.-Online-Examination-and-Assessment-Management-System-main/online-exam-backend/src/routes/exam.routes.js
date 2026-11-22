const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const v = require('../validators/exam.validator');
const c = require('../controllers/exam.controller');
const { ROLES } = require('../constants');

const router = express.Router();

router.use(authenticate, authorize(ROLES.FACULTY, ROLES.ADMIN));

router.get('/', validate(v.listExams), c.listExams);
router.post('/', validate(v.createExam), c.createExam);
router.get('/:id', validate(v.examIdParam), c.getExam);
router.patch('/:id', validate(v.updateExam), c.updateExam);
router.delete('/:id', validate(v.examIdParam), c.deleteExam);

router.post('/:id/publish', validate(v.examIdParam), c.publishExam);
router.post('/:id/archive', validate(v.examIdParam), c.archiveExam);
router.post('/:id/results/publish', validate(v.examIdParam), c.publishResults);
router.get('/:id/live', validate(v.examIdParam), c.liveSnapshot);
router.get('/:id/audit-logs', validate(v.auditQuery), c.examAuditLogs);

module.exports = router;
