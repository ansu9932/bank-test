import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';
import { initAppStorage } from './services/appStorage';

/**
 * Boot order matters on the native app:
 *   1. initAppStorage() hydrates the in-memory session cache from the
 *      Android Keystore-backed secure storage.
 *   2. ONLY THEN are the store and App imported — the Redux auth slice reads
 *      the token synchronously at module-load time, so importing it earlier
 *      would always see an empty session on native.
 * On the web, initAppStorage() is a no-op and this behaves exactly as before.
 */
async function boot() {
  try {
    // HARD TIMEOUT: Android Keystore reads can HANG (not fail) on some
    // devices. Never let storage hydration block first paint — after 4s we
    // render regardless; worst case the user logs in again.
    await Promise.race([
      initAppStorage(),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);
  } catch {
    /* storage init failure → user simply logs in again */
  }

  // NATIVE APK ONLY: boot straight into the dedicated mobile app surface.
  // Web browsers are untouched — they land on the marketing site as always.
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform() && window.location.pathname === '/') {
      window.history.replaceState(null, '', '/app');
    }
  } catch {
    /* capacitor unavailable (plain web build) — ignore */
  }

  const [{ Provider }, { store }, { default: App }] = await Promise.all([
    import('react-redux'),
    import('./store'),
    import('./App'),
  ]);

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </React.StrictMode>
  );
}

boot().catch((err) => {
  // A crash during boot previously left a permanent blank screen with no
  // clue. Surface the error so it can be reported and offer a retry.
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:#0A0A0A;color:#fff;font-family:sans-serif;padding:24px;text-align:center;">
        <p style="font-size:18px;font-weight:600;">Something went wrong while starting the app</p>
        <p style="font-size:13px;color:#999;max-width:320px;word-break:break-word;">${String(err?.message || err).replace(/</g, '&lt;')}</p>
        <button onclick="location.reload()" style="background:#CC0000;color:#fff;border:0;border-radius:10px;padding:12px 28px;font-size:15px;font-weight:600;">Try Again</button>
      </div>`;
  }
});
