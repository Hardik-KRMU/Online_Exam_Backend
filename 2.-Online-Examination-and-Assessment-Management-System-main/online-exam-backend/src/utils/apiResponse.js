/**
 * Every successful response has the same shape:
 *   { success: true, message?, data, meta? }
 * Errors are shaped by middleware/errorHandler.js:
 *   { success: false, error: { code, message, details? }, requestId }
 */
function sendSuccess(res, { statusCode = 200, message, data = null, meta } = {}) {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data;
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

/** Request context passed from controllers to services (for audit logs). */
function requestContext(req) {
  return {
    ip: req.ip,
    userAgent: req.get('user-agent'),
    requestId: req.id,
  };
}

module.exports = { sendSuccess, requestContext };
