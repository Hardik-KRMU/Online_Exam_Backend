const express = require('express');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const { authLimiter } = require('../middleware/rateLimiters');
const v = require('../validators/auth.validator');
const c = require('../controllers/auth.controller');

const router = express.Router();

router.use(authLimiter);

router.post('/register', validate(v.register), c.register);
router.post('/login', validate(v.login), c.login);
router.post('/refresh', validate(v.refreshToken), c.refresh);
router.post('/logout', validate(v.refreshToken), c.logout);
router.post('/logout-all', authenticate, c.logoutAll);

module.exports = router;
