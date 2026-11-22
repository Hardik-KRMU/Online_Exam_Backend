const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const { courseRouter, sectionRouter } = require('./academic.routes');
const questionRoutes = require('./question.routes');
const examRoutes = require('./exam.routes');
const { studentRouter, attemptRouter } = require('./student.routes');
const reportRoutes = require('./report.routes');
const { auditRouter, settingRouter } = require('./admin.routes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: { status: 'ok', uptimeSeconds: Math.round(process.uptime()), serverTime: new Date().toISOString() },
  });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/courses', courseRouter);
router.use('/sections', sectionRouter);
router.use('/questions', questionRoutes);
router.use('/exams', examRoutes);
router.use('/student', studentRouter);
router.use('/attempts', attemptRouter);
router.use('/reports', reportRoutes);
router.use('/audit-logs', auditRouter);
router.use('/settings', settingRouter);

module.exports = router;
