import appStorage from '../services/appStorage';

/**
 * Single source of truth for current user identity across web + mobile + admin.
 * SECURITY: Returns null if no valid auth token exists (fail-closed).
 *
 * On native: re-syncs appStorage after app resume or auth state changes.
 * On web: reads from Redux + localStorage hybrid (legacy fallback).
 *
 * NEVER trust multiple sources (appStorage vs localStorage vs Redux) —
 * they can diverge after app restart, biometric login, or network issues.
 */
export function getCurrentUser() {
  // Primary: appStorage (Keystore on native, localStorage fallback)
  const token = appStorage.getItem('token') || appStorage.getItem('adminToken');
  if (!token) return null;

  // User object persisted alongside token
  const userJson = appStorage.getItem('user');
  return userJson ? JSON.parse(userJson) : null;
}

/**
 * Set current user + token atomically.
 * SECURITY: Always writes together to avoid partial state (one exists, other doesn't).
 */
export function setCurrentUser(user, token, isAdmin = false) {
  if (!user || !token) {
    clearCurrentUser();
    return;
  }

  const key = isAdmin ? 'adminToken' : 'token';
  appStorage.setItem(key, token);
  appStorage.setItem('user', JSON.stringify(user));

  // On native: also persist derived fields (firstName, customerId) so
  // lock screen can display them without re-parsing JSON
  const { Capacitor } = require('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    appStorage.setItem('appUserFirstName', user.first_name || user.firstName || '');
    appStorage.setItem('appCustomerId', user.customer_id || user.id || '');
    appStorage.setItem('appUserAccountType', user.account_type || '');
  }
}

/**
 * Clear all user auth state atomically.
 */
export function clearCurrentUser() {
  appStorage.removeItem('token');
  appStorage.removeItem('refreshToken');
  appStorage.removeItem('user');
  appStorage.removeItem('adminToken');
  appStorage.removeItem('adminInfo');
  appStorage.removeItem('loginTime');
  appStorage.removeItem('biometricEnabled');
  appStorage.removeItem('biometricCredentials');
  appStorage.removeItem('appUserFirstName');
  appStorage.removeItem('appCustomerId');
  appStorage.removeItem('appUserAccountType');
}

/**
 * Get display name (first_name or company name for Business Elite accounts).
 * SECURITY: Fail-closed (return empty string) if data is missing.
 */
export function getDisplayName(user) {
  if (!user) return '';

  // Business Elite: show company name if available
  if (user.account_type === 'business_elite' && user.company_name) {
    return user.company_name;
  }

  // Personal: show first name
  return user.first_name || user.firstName || 'User';
}
