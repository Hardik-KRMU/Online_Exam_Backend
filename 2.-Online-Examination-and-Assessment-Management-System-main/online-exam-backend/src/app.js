/**
 * Builds the Express application (no network listening here, so tests can use
 * it with supertest). Middleware order matters:
 *   request id -> security headers -> CORS -> JSON body -> logging -> routes -> 404 -> error handler
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config/env');
const requestId = require('./middleware/requestId');
const requestLogger = require('./middleware/requestLogger');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');
const { registerEventListeners } = require('./events');

registerEventListeners();

const app = express();

app.use(requestId);
app.use(helmet());
app.use(cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '100kb' }));
app.use(requestLogger);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
