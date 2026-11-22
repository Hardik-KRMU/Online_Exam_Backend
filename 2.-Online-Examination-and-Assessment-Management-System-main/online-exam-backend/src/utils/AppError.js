/**
 * An "operational" error: an expected failure (bad input, missing token,
 * forbidden action) that maps to a specific HTTP status and a stable
 * machine-readable code. The central error handler turns it into JSON.
 */
class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }

  static badRequest(message, code = 'BAD_REQUEST', details) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  static notFound(resource = 'Resource', code = 'NOT_FOUND') {
    return new AppError(404, code, `${resource} not found`);
  }

  static conflict(message, code = 'CONFLICT', details) {
    return new AppError(409, code, message, details);
  }
}

module.exports = AppError;
