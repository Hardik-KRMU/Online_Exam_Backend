/**
 * Application-wide event bus built on Node's core EventEmitter.
 *
 * Why: services announce WHAT happened ("attempt submitted") without knowing
 * WHO cares. Listeners in ./listeners decide what to do with it: write an audit
 * record, push a Socket.IO notification. The attempt service never imports
 * Socket.IO or the AuditLog model, so each concern can change on its own.
 *
 * Note: emit() is synchronous and does not await async listeners, so every
 * listener catches its own errors (an unhandled rejection would otherwise escape).
 */
const { EventEmitter } = require('events');

class AppEventBus extends EventEmitter {}

const eventBus = new AppEventBus();
eventBus.setMaxListeners(30);

module.exports = eventBus;
