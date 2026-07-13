const jwt = require('jsonwebtoken');

let _io = null;

function initIO(io) {
  _io = io;

  // Authenticate every socket connection via the JWT passed in handshake auth (HIGH-3).
  // Unauthenticated connections are rejected before they can join any room.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return next(new Error('Invalid token'));
      socket.userId = decoded.userId;
      next();
    });
  });

  io.on('connection', (socket) => {
    // Server-side room assignment — client never controls which room it joins
    socket.join(`user:${socket.userId}`);
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
