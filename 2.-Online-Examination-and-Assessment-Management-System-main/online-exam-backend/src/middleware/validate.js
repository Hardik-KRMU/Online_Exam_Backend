/**
 * Validates req.params, req.query and req.body against Joi schemas.
 * - Unknown fields are rejected (e.g. a student sending "score" or "role").
 * - Valid values replace the originals, so controllers receive converted types
 *   (numbers, booleans, Date objects, defaults applied).
 * - All problems are reported at once (abortEarly: false) with their location.
 */
const AppError = require('../utils/AppError');

const LOCATIONS = ['params', 'query', 'body'];

module.exports = (schemas) =>
  function validate(req, res, next) {
    const details = [];

    LOCATIONS.forEach((location) => {
      const schema = schemas[location];
      if (!schema) return;
      const { value, error } = schema.validate(req[location] || {}, {
        abortEarly: false,
        convert: true,
      });
      if (error) {
        error.details.forEach((d) => {
          details.push({
            location,
            field: d.path.join('.'),
            message: d.message.replace(/"/g, ''),
          });
        });
      } else {
        req[location] = value;
      }
    });

    if (details.length > 0) {
      return next(AppError.badRequest('Request validation failed', 'VALIDATION_ERROR', details));
    }
    return next();
  };
