/**
 * Background job: every SWEEPER_INTERVAL_SECONDS, auto-submit attempts whose
 * deadline (+ grace) has passed, even if the student closed the browser.
 * A `running` flag prevents two sweeps from overlapping.
 *
 * Limitation: setInterval runs inside this one Node process. With several server
 * instances, each would sweep; finalizeAttempt is atomic, so this is safe but
 * redundant (a job queue or a leader lock would be the production fix).
 */
const attemptService = require('../services/attempt.service');

let timer = null;
let running = false;

async function runOnce() {
  if (running) return null;
  running = true;
  try {
    const result = await attemptService.sweepExpiredAttempts();
    if (result.autoSubmitted > 0 || result.repaired > 0) {
      console.log(`[sweeper] auto-submitted ${result.autoSubmitted}, re-evaluated ${result.repaired}`);
    }
    return result;
  } catch (err) {
    console.error(`[sweeper] failed: ${err.message}`);
    return null;
  } finally {
    running = false;
  }
}

function startAttemptSweeper(intervalMs) {
  if (timer) return;
  timer = setInterval(runOnce, intervalMs);
  timer.unref(); // do not keep the process alive just for this timer
  console.log(`[sweeper] running every ${Math.round(intervalMs / 1000)}s`);
}

function stopAttemptSweeper() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startAttemptSweeper, stopAttemptSweeper, runOnce };
