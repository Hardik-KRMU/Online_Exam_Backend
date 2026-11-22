/** Holds the Socket.IO server instance so other modules can emit without circular imports. */
let ioInstance = null;

module.exports = {
  setIO(io) {
    ioInstance = io;
  },
  getIO() {
    return ioInstance;
  },
};
