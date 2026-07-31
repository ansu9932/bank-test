import api from '../services/api';

/**
 * Shared PAN-verification cache — every Cashfree lookup COSTS MONEY, so a PAN
 * must only ever be verified ONCE per session, no matter how many times the
 * user navigates Back/Next through the wizard (which unmounts and remounts the
 * step components and wipes their local state).
 *
 * Three layers of protection against duplicate paid API calls:
 *   1. In-flight dedup  — concurrent triggers for the same PAN await the SAME
 *      promise (a debounce firing during an active request can't double-call).
 *   2. Module-level Map — definitive results (VALID or NOT_FOUND) survive step
 *      unmount/remount, so going Back → Next never re-verifies.
 *   3. sessionStorage   — definitive results also survive a full page reload
 *      within the same tab. Cleared automatically when the tab closes; never
 *      persisted to localStorage (identity data stays session-scoped).
 *
 * Transient failures (network/5xx) are NEVER cached — the user can retry.
 */

const STORAGE_KEY = 'alb_pan_verify_cache_v1';

// pan → definitive result object
const resultCache = new Map();
// pan → in-flight Promise
const inflight = new Map();

// ── sessionStorage hydration (survives reloads within the tab) ──────────────
try {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw) {
    Object.entries(JSON.parse(raw)).forEach(([pan, result]) => resultCache.set(pan, result));
  }
} catch { /* storage unavailable (private mode etc.) — in-memory cache still works */ }

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(resultCache)));
  } catch { /* best-effort */ }
}

/** True if we already hold a definitive result for this PAN (no API call needed). */
export function getCachedPanResult(pan) {
  return resultCache.get(String(pan || '').toUpperCase().trim()) || null;
}

/**
 * Verify a PAN, hitting the paid Cashfree endpoint AT MOST ONCE per PAN per
 * session. Returns { verified, name, status, message } and rejects only on
 * transient faults (which are not cached, so a retry is allowed).
 */
export async function verifyPanCached(pan) {
  const key = String(pan || '').toUpperCase().trim();

  // 1. Definitive answer already known — return it without any network call.
  const cached = resultCache.get(key);
  if (cached) return cached;

  // 2. A request for this PAN is already in flight — share its promise.
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    const { data } = await api.post('/kyc/verify-pan', { pan: key });
    const result = data?.data || {};
    const normalized = {
      verified: !!(result.verified && result.name),
      name: result.verified ? result.name : null,
      status: result.status || (result.verified ? 'VALID' : 'INVALID'),
      message: result.message || '',
    };
    // 3. Cache DEFINITIVE outcomes only: a verified PAN, or a registry-level
    //    "not found / invalid" answer. Both are stable facts — re-calling the
    //    paid API for them is pure waste. (Transient errors throw and skip this.)
    resultCache.set(key, normalized);
    persist();
    return normalized;
  })().finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}
