/**
 * Socket.IO server.
 *
 * Authentication: the handshake must carry a valid ACCESS token (same checks
 * as HTTP: signature, expiry, active user, tokenVersion). Unauthenticated
 * connections are refused before 'connection' fires.
 *
 * Rooms (joined by the SERVER, never chosen freely by the client):
 *   user:<userId>             every user; personal notifications
 *   section:<sectionId>       students; "exam published" announcements
 *   exam:<examId>:monitor     faculty/admin who manage that exam; live attempt status
 */
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const config = require('../config/env');
const { setIO } = require('./io');
const { ROLES, ROOMS } = require('../constants');
const authService = require('../services/auth.service');
const examService = require('../services/exam.service');
const attemptService = require('../services/attempt.service');

function extractToken(handshake) {
  if (handshake.auth && handshake.auth.token) return handshake.auth.token;
  const header = handshake.headers && handshake.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  // Query-string token is accepted for API tools that cannot set auth/headers.
  if (handshake.query && handshake.query.token) return handshake.query.token;
  return null;
}

function socketError(code, message) {
  const err = new Error(message);
  err.data = { code };
  return err;
}

async function socketAuth(socket, next) {
  try {
    const token = extractToken(socket.handshake);
    if (!token) return next(socketError('TOKEN_MISSING', 'Authentication token is required'));
    const { user, payload } = await authService.authenticateAccessToken(token);
    socket.data.user = authService.toActor(user);
    socket.data.tokenExpiresAt = payload.exp * 1000;
    return next();
  } catch (err) {
    return next(socketError(err.code || 'UNAUTHORIZED', err.isOperational ? err.message : 'Authentication failed'));
  }
}

const reply = (ack) => (typeof ack === 'function' ? ack : () => {});

function toAckError(err) {
  return {
    ok: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: err.isOperational ? err.message : 'Something went wrong',
    },
  };
}

function registerHandlers(socket) {
  const { user } = socket.data;

  // A socket outlives its access token. Every incoming event re-checks expiry;
  // an expired socket is told why and disconnected (client refreshes and reconnects).
  socket.use((packet, next) => {
    if (Date.now() >= socket.data.tokenExpiresAt) {
      socket.emit('auth:expired', { message: 'Access token expired. Refresh the token and reconnect.' });
      socket.disconnect(true);
      return undefined;
    }
    return next();
  });

  // Server clock for exam timers (the server deadline is authoritative).
  socket.on('time:sync', (ack) => {
    reply(ack)({ ok: true, data: { serverTime: new Date().toISOString() } });
  });

  // Faculty/admin start watching an exam they manage.
  socket.on('monitor:join', async (payload, ack) => {
    const respond = reply(ack);
    try {
      if (![ROLES.FACULTY, ROLES.ADMIN].includes(user.role)) {
        return respond({ ok: false, error: { code: 'INSUFFICIENT_ROLE', message: 'Only faculty or admin can monitor exams' } });
      }
      const examId = payload && payload.examId;
      if (!mongoose.isValidObjectId(examId)) {
        return respond({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'examId must be a valid id' } });
      }
      await examService.getManagedExam(examId, user); // throws 404 / 403
      socket.join(ROOMS.examMonitor(examId));
      const snapshot = await attemptService.getLiveSnapshot(examId);
      return respond({ ok: true, data: snapshot });
    } catch (err) {
      return respond(toAckError(err));
    }
  });

  socket.on('monitor:leave', (payload, ack) => {
    if (payload && payload.examId) socket.leave(ROOMS.examMonitor(payload.examId));
    reply(ack)({ ok: true });
  });
}

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((o) => o.trim()) },
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(ROOMS.user(user.id));
    if (user.role === ROLES.STUDENT && user.section) socket.join(ROOMS.section(user.section));

    socket.emit('connected', {
      userId: user.id,
      role: user.role,
      rooms: [...socket.rooms].filter((room) => room !== socket.id),
      serverTime: new Date().toISOString(),
    });

    registerHandlers(socket);

    if (!config.isTest) console.log(`[socket] ${user.role}:${user.id} connected (${socket.id})`);
    socket.on('disconnect', (reason) => {
      if (!config.isTest) console.log(`[socket] ${user.role}:${user.id} disconnected (${reason})`);
    });
  });

  setIO(io);
  return io;
}

module.exports = { initSocket };
