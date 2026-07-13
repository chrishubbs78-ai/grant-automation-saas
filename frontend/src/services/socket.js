import { API_BASE } from '../config';
import { io } from 'socket.io-client';

const BACKEND_URL = `${API_BASE}`;

let socket = null;

export function getSocket() {
  if (!socket) {
    const token = localStorage.getItem('token');
    socket = io(BACKEND_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      // HIGH-3: send JWT in handshake so the server authenticates the connection
      // before the socket can receive any events from user rooms
      auth: { token }
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) {
    // Refresh the token in auth in case it was obtained after the socket was created
    s.auth = { token: localStorage.getItem('token') };
    s.connect();
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
