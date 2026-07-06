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
    await initAppStorage();
  } catch {
    /* storage init failure → user simply logs in again */
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

boot();
