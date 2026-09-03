import api from '../services/api';
import appStorage from '../services/appStorage';

/**
 * Unified logout logic for web + mobile + admin surfaces.
 * Clears all auth state, makes server call if authorized, and redirects appropriately.
 *
 * SECURITY: Always wipes local state even if server call fails (network error).
 * Never leave partially-authenticated state.
 */
export async function performLogout(isAdmin = false) {
  const token = isAdmin ? appStorage.getItem('adminToken') : appStorage.getItem('token');

  // Always wipe local state first (fail-closed: assume logout succeeded locally)
  appStorage.removeItem('token');
  appStorage.removeItem('refreshToken');
  appStorage.removeItem('user');
  appStorage.removeItem('loginTime');
  appStorage.removeItem('adminToken');
  appStorage.removeItem('adminInfo');
  appStorage.removeItem('adminDeviceId');

  // On native: also clear Keystore biometric credentials
  if (isNativeApp()) {
    appStorage.removeItem('biometricEnabled');
    appStorage.removeItem('biometricCredentials');
  }

  // Make best-effort server call to invalidate session (if we have a token)
  if (token) {
    try {
      await api.post('/auth/logout', {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 3000, // 3s timeout — don't hang the logout
      });
    } catch (e) {
      // Server unreachable or error — but local state is already cleared,
      // so the user is effectively logged out
      console.warn('⚠️ Logout server call failed (session may persist server-side):', e.message);
    }
  }

  // Redirect based on surface
  if (isAdmin) {
    window.location.replace('/admin/login');
  } else if (isNativeApp()) {
    window.location.replace('/app/lock');
  } else {
    window.location.replace('/login');
  }
}

function isNativeApp() {
  const { Capacitor } = require('@capacitor/core');
  return Capacitor.isNativePlatform();
}
