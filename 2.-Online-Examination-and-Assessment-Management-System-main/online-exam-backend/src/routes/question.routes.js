const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const v = require('../validators/question.validator');
const c = require('../controllers/question.controller');
const { ROLES } = require('../constants');

const router = express.Router();

// The question bank (with answer keys) is staff-only. Students get questions
// only through their attempt, via /api/attempts/:attemptId.
router.use(authenticate, authorize(ROLES.FACULTY, ROLES.ADMIN));

router.get('/', validate(v.listQuestions), c.listQuestions);
router.post('/', validate(v.createQuestion), c.createQuestion);
router.get('/:id', validate(v.questionIdParam), c.getQuestion);
router.patch('/:id', validate(v.updateQuestion), c.updateQuestion);
router.delete('/:id', validate(v.questionIdParam), c.deleteQuestion);

module.exports = router;
