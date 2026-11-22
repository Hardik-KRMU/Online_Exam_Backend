const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const AppError = require('../utils/AppError');

const passthrough = (req, res, next) => next();

/** Slows down password guessing on /api/auth/*. Disabled in automated tests. */
const authLimiter = config.isTest
  ? passthrough
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.authRateLimitMax,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      handler: (req, res, next) =>
        next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many authentication requests. Try again in 15 minutes.')),
    });

module.exports = { authLimiter };
