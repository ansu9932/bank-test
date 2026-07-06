/**
 * Mobile-app auth client — onboarding steps + MPIN quick login.
 *
 * Device identity: a random UUID minted once per install, kept in secure
 * storage (Android Keystore on native). The 30-day appDeviceToken issued by
 * the server is bound to this ID; MPIN login requires both.
 */
import api from '../../services/api';
import appStorage from '../../services/appStorage';

export function getDeviceId() {
  let id = appStorage.getItem('appDeviceId');
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    appStorage.setItem('appDeviceId', id);
  }
  return id;
}

/** True when this install holds a (possibly expired) device registration. */
export function hasDeviceRegistration() {
  return !!appStorage.getItem('appDeviceToken');
}

export function getLockScreenIdentity() {
  return {
    firstName: appStorage.getItem('appUserFirstName') || '',
    customerId: appStorage.getItem('appCustomerId') || '',
  };
}

function persistSession(data) {
  if (data?.token) appStorage.setItem('token', data.token);
  if (data?.refreshToken) appStorage.setItem('refreshToken', data.refreshToken);
  if (data?.user) {
    appStorage.setItem('user', JSON.stringify(data.user));
    appStorage.setItem('appUserFirstName', data.user.firstName || '');
    appStorage.setItem('appCustomerId', data.user.customerId || '');
  }
  if (data?.deviceToken) appStorage.setItem('appDeviceToken', data.deviceToken);
  // A fresh login is activity — reset the 10-minute inactivity lock clock.
  appStorage.setItem('appLastActiveAt', String(Date.now()));
}

export function clearDeviceRegistration() {
  appStorage.removeItem('appDeviceToken');
  appStorage.removeItem('appUserFirstName');
  appStorage.removeItem('appCustomerId');
  appStorage.removeItem('appBiometricMpin');
}

// ─── Onboarding steps ────────────────────────────────────────────────────────
export async function verifyCustomer(customerId, dob) {
  const { data } = await api.post('/app/verify-customer', { customerId, dob });
  return data.data; // { onboardingToken, accountName, accountLast6, maskedEmail }
}

/** Confirm the previewed identity + accept T&Cs → server sends the OTP. */
export async function confirmIdentity(onboardingToken) {
  const { data } = await api.post('/app/confirm-identity', {
    onboardingToken,
    acceptTerms: true,
  });
  return data.data; // { onboardingToken, maskedEmail }
}

export async function verifyOtp(otp, onboardingToken) {
  const { data } = await api.post('/app/verify-otp', { otp, onboardingToken });
  return data.data; // { onboardingToken } (next step)
}

export async function resendOtp(onboardingToken) {
  const { data } = await api.post('/app/resend-otp', { onboardingToken });
  return data;
}

export async function verifyPassword(password, onboardingToken) {
  const { data } = await api.post('/app/verify-password', { password, onboardingToken });
  return data.data; // { onboardingToken } (next step)
}

export async function setupMpin(mpin, onboardingToken) {
  const { data } = await api.post('/app/setup-mpin', {
    mpin,
    deviceId: getDeviceId(),
    onboardingToken,
  });
  // Remember the digit count (4-6) so the lock screen shows the right number
  // of dots and auto-submits at the correct length.
  appStorage.setItem('appMpinLength', String(String(mpin).length));
  persistSession(data.data);
  return data.data;
}

/** Digit count of the user's MPIN (4-6); defaults to 4 if unknown. */
export function getMpinLength() {
  const n = Number(appStorage.getItem('appMpinLength'));
  return n >= 4 && n <= 6 ? n : 4;
}

// ─── Returning-user quick login ──────────────────────────────────────────────
// Throws { code: 'REVERIFY_REQUIRED' } when the 30-day registration expired.
export async function mpinLogin(mpin) {
  const deviceToken = appStorage.getItem('appDeviceToken');
  try {
    const { data } = await api.post('/app/mpin-login', {
      mpin,
      deviceId: getDeviceId(),
      deviceToken,
    });
    persistSession(data.data);
    return data.data;
  } catch (err) {
    if (err.response?.data?.code === 'REVERIFY_REQUIRED') {
      clearDeviceRegistration();
      const e = new Error(err.response.data.message || 'Please verify again.');
      e.code = 'REVERIFY_REQUIRED';
      throw e;
    }
    throw err;
  }
}

export async function logoutDevice() {
  try {
    await api.post('/app/logout-device');
  } catch {
    /* best-effort — clear local state regardless */
  }
  appStorage.removeItem('token');
  appStorage.removeItem('refreshToken');
  appStorage.removeItem('user');
  clearDeviceRegistration();
}

/**
 * Normal logout — ends the server session (so the website unblocks) but keeps
 * the device registered: next open only asks for the MPIN, not full onboarding.
 */
export async function logoutSession() {
  try {
    await api.post('/app/logout-session');
  } catch {
    /* best-effort — clear local state regardless */
  }
  appStorage.removeItem('token');
  appStorage.removeItem('refreshToken');
  appStorage.removeItem('user');
}

/** Lock the app (keep device registration; user re-enters MPIN). */
export function lockApp() {
  appStorage.removeItem('token');
  appStorage.removeItem('refreshToken');
}

export function isAppAuthenticated() {
  return !!appStorage.getItem('token');
}

// ─── Inactivity lock (10 min) ────────────────────────────────────────────────
// Survives cold starts: appLastActiveAt lives in secure storage, so killing
// the app from the recents screen and reopening still triggers the lock.
const INACTIVITY_LOCK_MS = 10 * 60 * 1000;

export function touchAppActivity() {
  appStorage.setItem('appLastActiveAt', String(Date.now()));
}

/** True when the app has been inactive long enough to require the MPIN. */
export function isInactivityLocked() {
  if (!isAppAuthenticated()) return false;
  const last = Number(appStorage.getItem('appLastActiveAt'));
  if (!last) return true; // unknown → fail safe, ask for MPIN
  return Date.now() - last > INACTIVITY_LOCK_MS;
}
