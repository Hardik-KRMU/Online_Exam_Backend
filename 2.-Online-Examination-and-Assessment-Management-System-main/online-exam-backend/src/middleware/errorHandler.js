/**
 * Centralized error handler: the ONLY place that turns errors into HTTP
 * responses. Controllers and services just throw. Known error types are mapped
 * to precise status codes; anything unexpected becomes a 500 without leaking
 * internals in production.
 */
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const config = require('../config/env');

function normalizeError(err) {
  if (err instanceof AppError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      location: 'body',
      field: e.path,
      message: e.message,
    }));
    return AppError.badRequest('Data validation failed', 'VALIDATION_ERROR', details);
  }

  if (err instanceof mongoose.Error.CastError) {
    return AppError.badRequest(`Invalid value for ${err.path}: ${JSON.stringify(err.value)}`, 'INVALID_ID');
  }

  if (err && err.code === 11000) {
    const fields = Object.keys(err.keyValue || err.keyPattern || {});
    return AppError.conflict(`A record with this ${fields.join(', ') || 'value'} already exists`, 'DUPLICATE_KEY', {
      fields,
    });
  }

  if (err instanceof mongoose.Error.VersionError) {
    return AppError.conflict('The record was modified by another request. Please retry.', 'CONCURRENT_MODIFICATION');
  }

  if (err && err.type === 'entity.parse.failed') {
    return AppError.badRequest('Request body is not valid JSON', 'INVALID_JSON');
  }

  if (err && err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }

  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong on the server');
}

// Express recognizes an error handler by its four parameters, so `next` must stay.
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const error = normalizeError(err);

  if (error.statusCode >= 500) {
    console.error(`[error] ${req.id} ${req.method} ${req.originalUrl}`, err);
  }

  const body = {
    success: false,
    error: { code: error.code, message: error.message },
    requestId: req.id,
  };
  if (error.details) body.error.details = error.details;
  if (!config.isProduction && error.statusCode >= 500 && err && err.stack) {
    body.error.stack = err.stack.split('\n').slice(0, 5);
  }

  res.status(error.statusCode).json(body);
};
