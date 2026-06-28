/**
 * Crash-proof date formatting utilities for Alister Bank.
 *
 * These wrappers prevent the fatal "RangeError: Invalid time value" that kills
 * the entire React component tree when format() receives a null, undefined,
 * empty string, or unparseable timestamp from the API.
 *
 * USAGE: import { safeFormat, safeRelative } from '../../utils/dateHelpers';
 *        safeFormat(tx.created_at, 'dd MMM yyyy')       → "12 Nov 2024" or "N/A"
 *        safeRelative(notification.created_at)          → "3 minutes ago" or "Recently"
 */
import { format, formatDistanceToNow } from 'date-fns';

/**
 * Safely format a raw timestamp string into a display string.
 * Returns `fallback` instead of throwing when the date is invalid.
 *
 * @param {string|Date|null|undefined} value  — raw timestamp from the API
 * @param {string} pattern                    — date-fns format pattern
 * @param {string} [fallback='N/A']           — returned when the date is invalid
 * @returns {string}
 */
export function safeFormat(value, pattern, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return format(d, pattern);
  } catch {
    return fallback;
  }
}

/**
 * Safely produce a relative-time string ("3 minutes ago") from a timestamp.
 * Returns `fallback` when the value is invalid.
 *
 * @param {string|Date|null|undefined} value
 * @param {string} [fallback='Recently']
 * @returns {string}
 */
export function safeRelative(value, fallback = 'Recently') {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return fallback;
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return fallback;
  }
}

/**
 * Safely parse a numeric value for currency display.
 * Returns '0' if the value is NaN/null/undefined.
 *
 * @param {*} value
 * @returns {string}  — formatted Indian locale number (e.g. "1,25,000")
 */
export function safeCurrency(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}
