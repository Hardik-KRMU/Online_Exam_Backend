const eventBus = require('./eventBus');
const registerAuditListeners = require('./listeners/audit.listener');
const registerSocketListeners = require('./listeners/socket.listener');

let registered = false;

/** Attach all listeners exactly once (safe to call from app.js and tests). */
function registerEventListeners() {
  if (registered) return;
  registerAuditListeners(eventBus);
  registerSocketListeners(eventBus);
  registered = true;
}

module.exports = { registerEventListeners };
