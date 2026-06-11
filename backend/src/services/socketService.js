let _io = null;

function initIO(io) {
  _io = io;

  io.on('connection', (socket) => {
    socket.on('join:user', (userId) => {
      if (userId) socket.join(`user:${userId}`);
    });
  });
}

function getIO() {
  return _io;
}

function emitToUser(userId, event, data) {
  if (_io && userId) {
    _io.to(`user:${userId}`).emit(event, data);
  }
}

module.exports = { initIO, getIO, emitToUser };
