// Single source of truth for the backend URL.
// For local use the default is fine; for a deployed backend set VITE_API_URL
// in frontend/.env (e.g. VITE_API_URL=https://your-backend.onrender.com).
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4006';
