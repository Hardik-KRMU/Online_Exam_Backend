const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const v = require('../validators/misc.validator');
const c = require('../controllers/report.controller');
const { ROLES } = require('../constants');

const router = express.Router();

router.use(authenticate, authorize(ROLES.FACULTY, ROLES.ADMIN));

router.get('/exams/:examId/summary', validate(v.reportExamParam), c.examSummary);
router.get('/exams/:examId/sections', validate(v.reportExamParam), c.sectionWise);
router.get('/exams/:examId/questions', validate(v.reportExamParam), c.questionWise);
router.get('/exams/:examId/students', validate(v.studentWiseReport), c.studentWise);
router.get('/students/:studentId', validate(v.studentReportParam), c.studentPerformance);

module.exports = router;
