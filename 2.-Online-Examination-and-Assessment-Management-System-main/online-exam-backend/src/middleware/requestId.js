const crypto = require('crypto');

/** Gives every request a unique id, returned in the X-Request-Id header and in error bodies. */
module.exports = function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
};
