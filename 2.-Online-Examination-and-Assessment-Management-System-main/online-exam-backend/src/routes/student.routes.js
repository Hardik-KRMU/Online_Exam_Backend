const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const v = require('../validators/attempt.validator');
const c = require('../controllers/student.controller');
const { ROLES } = require('../constants');

const studentOnly = [authenticate, authorize(ROLES.STUDENT)];

// /api/student
const studentRouter = express.Router();
studentRouter.use(studentOnly);
studentRouter.get('/exams', validate(v.listStudentExams), c.listMyExams);
studentRouter.get('/exams/:examId', validate(v.examIdParam), c.getMyExam);
studentRouter.post('/exams/:examId/attempts', validate(v.examIdParam), c.startAttempt);
studentRouter.get('/results', c.listMyResults);

// /api/attempts
const attemptRouter = express.Router();
attemptRouter.use(studentOnly);
attemptRouter.get('/:attemptId', validate(v.attemptIdParam), c.getAttempt);
attemptRouter.patch('/:attemptId/answers', validate(v.saveAnswers), c.saveAnswers);
attemptRouter.post('/:attemptId/submit', validate(v.submitAttempt), c.submitAttempt);
attemptRouter.get('/:attemptId/result', validate(v.attemptIdParam), c.getResult);

module.exports = { studentRouter, attemptRouter };
