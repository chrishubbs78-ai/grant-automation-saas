import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:4006';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(BACKEND_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling']
    });
  }
  return socket;
}

export function connectSocket(userId) {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
    s.once('connect', () => {
      if (userId) s.emit('join:user', userId);
    });
  } else if (userId) {
    s.emit('join:user', userId);
  }
  return s;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getUserIdFromToken() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId || null;
  } catch {
    return null;
  }
}
