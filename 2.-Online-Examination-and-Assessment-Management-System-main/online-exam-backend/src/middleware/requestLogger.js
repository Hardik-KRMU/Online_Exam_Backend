const morgan = require('morgan');
const config = require('../config/env');

morgan.token('id', (req) => req.id);
morgan.token('user', (req) => (req.user ? `${req.user.role}:${req.user.id}` : 'anonymous'));

const FORMAT = ':date[iso] :id :method :url :status :response-time ms :user';

// Logs one line per request, e.g.
// 2026-11-13T10:01:22.511Z 7b1c... POST /api/attempts/66.../submit 200 18.204 ms student:66...
module.exports = config.isTest ? (req, res, next) => next() : morgan(FORMAT);
