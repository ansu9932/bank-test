import axios from 'axios';
import toast from 'react-hot-toast';
import appStorage from './appStorage';

/**
 * Central Axios instance for Alister Bank.
 *
 * Request interceptor:  safely attaches the Bearer token for both
 * regular user sessions (localStorage 'token') and
 * admin sessions (localStorage 'adminToken').
 *
 * Response interceptor: handles 401 errors globally — clears ALL session
 * keys and redirects to the correct login page only
 * when the user is not already on a login page.
 */
const api = axios.create({
  // API base URL. Set VITE_API_URL (preferred, used by the Android APK build)
  // or VITE_API_BASE_URL at build time; falls back to the production API so
  // the native app ALWAYS talks to the live backend.
  baseURL:
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    'https://api.alisterbank.online/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ─── Request Interceptor ──────────────────────────────────────────────────────
// Reads both 'token' (customer sessions) and 'adminToken' (admin sessions).
// The first truthy value wins — customer token takes precedence because admin
// pages already pass their token explicitly where needed, but the interceptor
// must still cover every api.get/post call that does NOT manually set headers.
api.interceptors.request.use(
  (config) => {
    const token = appStorage.getItem('token') || appStorage.getItem('adminToken');

    if (token && typeof token === 'string' && token.trim().length > 0) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token.trim()}`;
    }

    return config;
  },
  (error) => {
    // Request could not be sent at all (network offline, bad config, etc.)
    return Promise.reject(error);
  }
);

// ─── Response Interceptor ─────────────────────────────────────────────────────
// Handles every successful response transparently (pass-through).
// On error, inspects the HTTP status code and reacts accordingly.
api.interceptors.response.use(
  // ── Success pass-through ───────────────────────────────────────────────────
  (response) => response,

  // ── Error handler ─────────────────────────────────────────────────────────
  (error) => {
    const status  = error.response?.status;
    const message = error.response?.data?.message;

    if (status === 401) {
      // ── Wipe all session storage keys completely ───────────────────────────
      // 'token'      — customer JWT
      // 'adminToken' — admin JWT
      // 'user'       — cached user object
      appStorage.removeItem('token');
      appStorage.removeItem('adminToken');
      appStorage.removeItem('user');

      // ── Redirect to the appropriate login page only when not already there ─
      // We check both '/login' and '/admin/login' to avoid infinite redirect
      // loops when the 401 fires on the login page itself (e.g. wrong password
      // response from the server still returns 401 in some configurations).
      const currentPath = window.location.pathname;
      const isOnAnyLoginPage =
        currentPath === '/login' ||
        currentPath === '/admin/login' ||
        currentPath.startsWith('/login') ||
        currentPath.startsWith('/admin/login');

      if (!isOnAnyLoginPage) {
        // Determine destination: if the user was on an /admin/* route, send
        // them to the admin login; otherwise send to the customer login.
        const isAdminRoute = currentPath.startsWith('/admin');
        window.location.href = isAdminRoute ? '/admin/login' : '/login';
      }

    } else if (status === 403) {
      toast.error(message || 'You do not have permission to perform this action.');

    } else if (status === 422) {
      // Validation errors — let the calling component handle these specifically
      // so we do NOT show a generic toast here.

    } else if (status === 429) {
      toast.error('Too many requests. Please slow down and try again.');

    } else if (status >= 500) {
      toast.error('A server error occurred. Please try again later.');
    }

    return Promise.reject(error);
  }
);

export default api;
