import { Capacitor } from '@capacitor/core';

/**
 * appStorage — drop-in replacement for localStorage session keys.
 *
 * WEB (browser):    delegates directly to localStorage (zero behavior change).
 * NATIVE (Android): values live in an in-memory cache backed by
 *                   @aparajita/capacitor-secure-storage, which encrypts via
 *                   the Android Keystore. localStorage is NEVER used for
 *                   session data on native, so tokens cannot be read from the
 *                   WebView's plain storage.
 *
 * The API is synchronous (like localStorage) so the 60+ existing call sites
 * keep working: reads come from the memory cache, writes update the cache
 * immediately and persist to secure storage in the background.
 *
 * initAppStorage() MUST be awaited before the app renders (see main.jsx) so
 * the cache is hydrated and synchronous reads are correct from first paint.
 */

const isNative = Capacitor.isNativePlatform();

// Keys that are persisted to secure storage on native. Anything else written
// through this facade is memory-only on native (fine for ephemeral flags).
const PERSISTED_KEYS = [
  'token',
  'adminToken',
  'user',
  'loginTime',
  'adminInfo',
  'adminDeviceId',
  'biometricEnabled',
  'refreshToken',
  // Mobile app (/app) MPIN quick-login: 30-day device registration + the
  // lock-screen greeting. Stored in Android Keystore-backed secure storage.
  'appDeviceToken',
  'appDeviceId',
  'appUserFirstName',
  'appCustomerId',
  // MPIN replay copy for biometric unlock — only ever lives in the native
  // Keystore-backed store; wiped on logout/device de-registration.
  'appBiometricMpin',
  // Digit count of the user's MPIN (4-6) so the lock screen shows the right
  // number of dots and auto-submits at the correct length.
  'appMpinLength',
];

const cache = new Map();

// CRITICAL: never resolve a Promise directly with a Capacitor plugin proxy.
// Resolving probes `.then` on the value, and the proxy forwards that as a
// native call — crashing with "SecureStorage.then() is not implemented on
// android". Wrap the proxy in a plain object so `.then` is never probed.
let pluginWrapper = null;

async function loadPlugin() {
  if (!pluginWrapper) {
    const mod = await import('@aparajita/capacitor-secure-storage');
    pluginWrapper = { ss: mod.SecureStorage };
  }
  return pluginWrapper;
}

/** Hydrate the memory cache from Android Keystore-backed storage. */
export async function initAppStorage() {
  if (!isNative) return;
  try {
    const { ss } = await loadPlugin();
    for (const key of PERSISTED_KEYS) {
      try {
        const value = await ss.getItem(key);
        if (value !== null && value !== undefined) cache.set(key, String(value));
      } catch {
        /* key absent — skip */
      }
    }
  } catch (e) {
    // Secure storage unavailable (should not happen on a real device).
    // The app still works — the user just has to log in again.
    console.error('Secure storage init failed:', e?.message);
  }
}

const appStorage = {
  getItem(key) {
    if (!isNative) return window.localStorage.getItem(key);
    return cache.has(key) ? cache.get(key) : null;
  },

  setItem(key, value) {
    if (!isNative) return window.localStorage.setItem(key, value);
    cache.set(key, String(value));
    if (PERSISTED_KEYS.includes(key)) {
      loadPlugin()
        .then(({ ss }) => ss.setItem(key, String(value)))
        .catch(() => {});
    }
  },

  removeItem(key) {
    if (!isNative) return window.localStorage.removeItem(key);
    cache.delete(key);
    if (PERSISTED_KEYS.includes(key)) {
      loadPlugin()
        .then(({ ss }) => ss.removeItem(key))
        .catch(() => {});
    }
  },
};

export default appStorage;
