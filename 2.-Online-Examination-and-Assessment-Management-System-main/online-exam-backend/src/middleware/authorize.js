/**
 * Role-based access control. Usage: router.post('/', authenticate, authorize('admin', 'faculty'), handler)
 * Must run after authenticate. Ownership rules (e.g. "only the exam's creator")
 * are checked in the services, because they need the database record.
 */
const AppError = require('../utils/AppError');

module.exports = (...allowedRoles) =>
  function authorize(req, res, next) {
    if (!req.user) return next(AppError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        AppError.forbidden(`This action requires one of these roles: ${allowedRoles.join(', ')}`, 'INSUFFICIENT_ROLE')
      );
    }
    return next();
  };
