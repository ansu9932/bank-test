import { Capacitor } from '@capacitor/core';
import appStorage from './appStorage';

/**
 * Biometric login service (native Android only).
 *
 * Model: after the FIRST successful password login the user can enable
 * biometric unlock (toggle in Settings, or the post-login prompt). Enabling it
 * stores the login credentials in @aparajita/capacitor-secure-storage — which
 * encrypts with a key held in the Android Keystore — and sets the
 * 'biometricEnabled' flag. On subsequent launches the login page shows a
 * fingerprint button: a successful OS-level biometric prompt releases the
 * stored credentials and the normal /auth/login flow runs.
 *
 * The credentials NEVER touch localStorage and never leave the device.
 */

const CRED_KEY = 'biometricCredentials';

export const isNativeApp = () => Capacitor.isNativePlatform();

async function biometricPlugin() {
  const mod = await import('@aparajita/capacitor-biometric-auth');
  return mod.BiometricAuth;
}

async function securePlugin() {
  const mod = await import('@aparajita/capacitor-secure-storage');
  return mod.SecureStorage;
}

/** Is a fingerprint/face sensor available AND enrolled on this device? */
export async function isBiometricAvailable() {
  if (!isNativeApp()) return false;
  try {
    const bio = await biometricPlugin();
    const result = await bio.checkBiometry();
    return !!result.isAvailable;
  } catch {
    return false;
  }
}

/** Has the user turned biometric login on? */
export function isBiometricEnabled() {
  return appStorage.getItem('biometricEnabled') === 'true';
}

/**
 * Show the OS biometric prompt. Resolves true on success, false on
 * cancel/failure. Never throws.
 */
export async function verifyBiometric(reason = 'Unlock Alister Bank') {
  if (!isNativeApp()) return false;
  try {
    const bio = await biometricPlugin();
    await bio.authenticate({
      reason,
      cancelTitle: 'Cancel',
      allowDeviceCredential: true, // PIN/pattern fallback (still OS-secured)
      androidTitle: 'Alister Bank',
      androidSubtitle: reason,
      androidConfirmationRequired: false,
    });
    return true;
  } catch {
    return false;
  }
}

/** Enable biometric login: store credentials in Keystore-encrypted storage. */
export async function enableBiometricLogin(credentials) {
  if (!isNativeApp()) return false;
  const ok = await verifyBiometric('Confirm your identity to enable biometric login');
  if (!ok) return false;
  const ss = await securePlugin();
  await ss.setItem(CRED_KEY, JSON.stringify(credentials));
  appStorage.setItem('biometricEnabled', 'true');
  return true;
}

/** Disable biometric login and wipe the stored credentials. */
export async function disableBiometricLogin() {
  appStorage.removeItem('biometricEnabled');
  if (!isNativeApp()) return;
  try {
    const ss = await securePlugin();
    await ss.removeItem(CRED_KEY);
  } catch {
    /* already gone */
  }
}

/**
 * Biometric login: OS prompt → release stored credentials.
 * Returns the credentials object or null.
 */
export async function biometricLogin() {
  if (!isNativeApp() || !isBiometricEnabled()) return null;
  const ok = await verifyBiometric('Login to Alister Bank');
  if (!ok) return null;
  try {
    const ss = await securePlugin();
    const raw = await ss.getItem(CRED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Root detection — calls the custom RootCheck plugin registered in
 * MainActivity (backed by the RootBeer library). Rooted devices are blocked
 * from logging in because Keystore + FLAG_SECURE guarantees don't hold there.
 * Fails OPEN on web (not applicable) and CLOSED errors to "not rooted" so a
 * plugin hiccup can't lock out every user.
 */
export async function isDeviceRooted() {
  if (!isNativeApp()) return false;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const RootCheck = registerPlugin('RootCheck');
    const { rooted } = await RootCheck.isRooted();
    return !!rooted;
  } catch {
    return false;
  }
}

/**
 * Emulator detection — banking sessions must not run inside emulators
 * (Frida/instrumentation risk). Treated exactly like a rooted device by the
 * login page. Same fail-open-on-error policy as isDeviceRooted().
 */
export async function isEmulatorDevice() {
  if (!isNativeApp()) return false;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const RootCheck = registerPlugin('RootCheck');
    const { emulator } = await RootCheck.isEmulator();
    return !!emulator;
  } catch {
    return false;
  }
}

/**
 * Developer-mode detection — like other banking apps, the app refuses to run
 * while Android Developer Options (or USB debugging) is enabled, since ADB
 * allows runtime inspection and input injection. Checked on app entry and on
 * every foreground resume. Same fail-open-on-error policy as above so a
 * plugin hiccup can't brick the app for everyone.
 */
export async function isDeveloperModeEnabled() {
  if (!isNativeApp()) return false;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const RootCheck = registerPlugin('RootCheck');
    const { enabled } = await RootCheck.isDeveloperModeEnabled();
    return !!enabled;
  } catch {
    return false;
  }
}

/**
 * Stable per-install device identifier for device binding. Generated once
 * with the Web Crypto CSPRNG and persisted; sent with every login so the
 * backend can email an alert when a NEW device signs in. Not PII — a random
 * opaque token, reset by app reinstall.
 */
/**
 * Copy/cut/context-menu blocking props for sensitive inputs (passwords, PINs,
 * OTPs) in the NATIVE app. Spread onto an <input>: prevents the field's value
 * from ever reaching the Android clipboard (where any app could read it).
 * Returns {} on web so browser autofill/password managers keep working.
 */
export function secureFieldProps() {
  if (!isNativeApp()) return {};
  const block = (e) => e.preventDefault();
  return { onCopy: block, onCut: block, onContextMenu: block, autoComplete: 'off' };
}

export function getDeviceId() {
  if (!isNativeApp()) return null;
  let id = appStorage.getItem('deviceId');
  if (!id) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    appStorage.setItem('deviceId', id);
  }
  return id;
}
