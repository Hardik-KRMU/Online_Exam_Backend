/**
 * Express 4 does not catch errors thrown inside async route handlers.
 * This wrapper forwards any rejected promise to next(err), so it reaches
 * the centralized error handler instead of crashing or hanging the request.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
