/**
 * Entry point: connect to MongoDB, create the HTTP server (Node core 'http'
 * module), attach Socket.IO, start the auto-submit job, and shut down cleanly
 * on Ctrl+C / SIGTERM using the process object.
 */
const http = require('http');
const config = require('./config/env');
const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const { initSocket } = require('./sockets');
const { startAttemptSweeper, stopAttemptSweeper } = require('./jobs/attemptSweeper');

async function start() {
  await connectDB(config.mongoUri);

  const server = http.createServer(app);
  const io = initSocket(server);
  startAttemptSweeper(config.sweeperIntervalMs);

  server.listen(config.port, () => {
    console.log(`[server] ${config.env} server listening on http://localhost:${config.port} (pid ${process.pid})`);
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);
    stopAttemptSweeper();
    // io.close() also closes the underlying HTTP server.
    io.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled promise rejection:', reason);
});

start().catch((err) => {
  console.error('[server] failed to start:', err.message);
  process.exit(1);
});
