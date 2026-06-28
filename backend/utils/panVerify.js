const axios = require('axios');
const { randomUUID } = require('crypto');
const logger = require('./logger');

/**
 * Cashfree Secure ID — PAN verification client (KYC name auto-fetch).
 *
 * Wires the onboarding PAN lookup to Cashfree's Verification (Secure ID) suite.
 * Credentials + environment are read from env and never leave the server:
 *
 *   CASHFREE_CLIENT_ID        Cashfree appId        → sent as `x-client-id`
 *   CASHFREE_CLIENT_SECRET    Cashfree secretKey    → sent as `x-client-secret`
 *   CASHFREE_ENV              'production' | 'sandbox' (default: 'sandbox')
 *   CASHFREE_VERIFICATION_BASE_URL  (optional) explicit base-URL override
 *
 * Endpoint: <base>/pan/advance  (POST)
 *   base = https://api.cashfree.com/verification        (production)
 *          https://sandbox.cashfree.com/verification    (sandbox)
 *
 * Design notes:
 *   • No fabricated results. There is NO mock and NO "verify during review"
 *     auto-pass — a verification only succeeds when Cashfree returns a valid
 *     PAN + registered_name.
 *   • "PAN not found / invalid" is a normal API outcome and resolves to
 *     { verified:false } (HTTP 200 upstream) so the client can prompt a re-check.
 *   • Genuine faults (missing config, network/timeout, upstream 4xx/5xx) THROW a
 *     structured error so the controller can return an honest 5xx instead of
 *     silently passing the user through.
 */

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const REQUEST_TIMEOUT_MS = 15000;
// Cashfree synchronous PAN verify endpoint. Base is '.../verification', so the
// default resource '/pan' yields the documented '/verification/pan' URL
// (https://www.cashfree.com/docs/api-reference/vrs/v2/pan/verify-pan-sync).
// Override via env if your account uses a different product (e.g. '/pan/advance').
const PAN_RESOURCE_PATH = process.env.CASHFREE_PAN_RESOURCE_PATH || '/pan';
// The sync API's schema REQUIRES a `name` alongside `pan` (it computes a
// name-match score). We're doing an identity LOOKUP, not a match, so when the
// caller supplies no real name we inject a neutral placeholder purely to satisfy
// schema validation — the gateway still returns the true `registered_name`.
const NAME_PLACEHOLDER = process.env.CASHFREE_PAN_NAME_PLACEHOLDER || 'Alister Bank Customer';
// Cashfree requires a date-based API version header. Newer accounts expect a
// current-era version (Cashfree's own Postman docs reference e.g. 2025-01-01);
// an outdated value can itself trigger a 400 schema rejection. Override via env
// to match your dashboard; the raw-body logging below reveals the required value.
const DEFAULT_API_VERSION = '2025-01-01';

/** JSON.stringify that never throws (handles circular / odd payloads). */
function safeStringify(value) {
  try {
    return typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Describe the SHAPE of a payload (top-level keys / type) without dumping the
 * values — used for diagnostics so we can see Cashfree's dictionary structure
 * in prod logs WITHOUT logging identity PII (names, DOB, etc.).
 */
function describeShape(value) {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value !== 'object') return typeof value;
  return `{ ${Object.keys(value).join(', ')} }`;
}

/** Resolve the Cashfree Verification base URL from the environment switch. */
function baseUrl() {
  if (process.env.CASHFREE_VERIFICATION_BASE_URL) {
    return process.env.CASHFREE_VERIFICATION_BASE_URL.replace(/\/+$/, '');
  }
  const env = String(process.env.CASHFREE_ENV || 'sandbox').toLowerCase();
  return env === 'production' || env === 'prod'
    ? 'https://api.cashfree.com/verification'
    : 'https://sandbox.cashfree.com/verification';
}

/** True only when both Cashfree credentials are present. */
function isConfigured() {
  return Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET);
}

/** Structural PAN validation (ABCDE1234F). @returns {boolean} */
function isValidPanFormat(pan) {
  return PAN_RE.test(String(pan || '').toUpperCase().trim());
}

/** Build a structured, classifiable error for the controller to map to a status. */
function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

/**
 * Verify a PAN with Cashfree and extract the registered legal name.
 *
 * @param {string} pan 10-char PAN (case-insensitive; upper-cased internally).
 * @param {string} [name] Optional applicant name. The sync API requires a
 *   `name` field; when none is provided we inject NAME_PLACEHOLDER so schema
 *   validation passes while the gateway still returns the true registered_name.
 * @returns {Promise<{verified:boolean, name:string|null, status:string, message:string, verificationId:string|null}>}
 *   Resolves for both "valid" and "invalid PAN" (a normal upstream outcome).
 * @throws {Error} with `.code` of CASHFREE_NOT_CONFIGURED | CASHFREE_UPSTREAM
 *   for config/network/upstream faults — never fabricate a pass on failure.
 */
async function verifyPan(pan, name) {
  const normalized = String(pan || '').toUpperCase().trim();

  if (!isValidPanFormat(normalized)) {
    return { verified: false, name: null, status: 'INVALID_FORMAT', message: 'Invalid PAN format.', verificationId: null };
  }

  if (!isConfigured()) {
    throw makeError('CASHFREE_NOT_CONFIGURED', 'Cashfree verification credentials are not configured.');
  }

  // Unique, traceable id Cashfree echoes back and logs against this request.
  // MUST be ALPHANUMERIC ONLY — Cashfree's verification_id rejects hyphens/
  // special chars (every doc example is plain alphanumeric, e.g. "test001"),
  // and a hyphenated id is a likely cause of a 400 "invalid request" rejection.
  const verificationId = `ALBPAN${randomUUID().replace(/-/g, '').slice(0, 24)}`;

  // Satisfy the sync schema's required `name`. Real applicant name if supplied,
  // otherwise a neutral placeholder (we want the registry's name, not a match).
  const requestName = (typeof name === 'string' && name.trim()) ? name.trim() : NAME_PLACEHOLDER;

  let response;
  try {
    response = await axios.post(
      `${baseUrl()}${PAN_RESOURCE_PATH}`,
      { pan: normalized, name: requestName, verification_id: verificationId },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': process.env.CASHFREE_CLIENT_ID,
          'x-client-secret': process.env.CASHFREE_CLIENT_SECRET,
          // Cashfree verification APIs require a version header; omitting it is a
          // common cause of blanket non-2xx rejections (→ the reported 502).
          'x-api-version': process.env.CASHFREE_API_VERSION || DEFAULT_API_VERSION,
        },
        timeout: REQUEST_TIMEOUT_MS,
        // Resolve (don't throw) for any status < 500 so we can inspect 4xx bodies
        // and classify them (e.g. a "PAN not found" 422 is a NORMAL outcome, not
        // a server fault). Only true upstream 5xx / network errors reject.
        validateStatus: (s) => s < 500,
      },
    );
  } catch (err) {
    // Network-layer faults only (4xx no longer lands here thanks to validateStatus).
    // axios surfaces socket resets / timeouts / DNS failures as a rejected promise
    // — this catch is the promise-based equivalent of a stream '.on("error")'
    // listener, so a dropped Cashfree socket can never reach the process as an
    // unhandled rejection. We classify the common transport codes for clearer
    // ops logs, then throw a structured fault → controller returns clean JSON.
    const status = err?.response?.status;
    const transient = ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE'];
    const kind = err.code && transient.includes(err.code) ? `socket/${err.code}` : (err.code || 'unknown');
    logger.error(
      `[cashfree:pan] ${verificationId} transport failure (${kind})`
      + `${status ? ` [status=${status}]` : ''}: ${err.message}`
      + ` | body=${safeStringify(err?.response?.data)}`,
    );
    throw makeError('CASHFREE_UPSTREAM', 'PAN verification service is currently unavailable.');
  }

  const { status, data } = response;

  // ── Insulated response-processing boundary ──────────────────────────────────
  // axios has already buffered the socket and JSON-parsed the body by this point
  // (there is no manual stream / JSON.parse to wrap — this is the promise-based
  // equivalent of insulating the ".on('end')" parse+map callback). This local
  // try/catch is belt-and-suspenders: even if some future field-mapping change
  // throws on a malformed payload, it is converted into a structured, catchable
  // CASHFREE_UPSTREAM error — never an unhandled throw that could kill the thread.
  try {
    // ── Defensive extraction (flat root layout first) ─────────────────────────
    // Cashfree's live PAN response is FLAT: registered_name lives at the ROOT.
    // We read root first, then fall back to a nested envelope for older/other
    // products. Optional chaining + ?? mean a missing/null parent at ANY level
    // drops safely to the empty-string/null fallback instead of a type error.
    const root = (data && typeof data === 'object') ? data : {};
    const inner = (root.data && typeof root.data === 'object') ? root.data : {};
    const registeredName =
      root.registered_name ?? inner.registered_name ?? root.name ?? inner.name ?? '';
    const validityRaw =
      root.valid ?? inner.valid ?? root.status ?? inner.status ?? '';
    const isValid =
      validityRaw === true || String(validityRaw).toUpperCase() === 'VALID';

    // ── 4xx: a structured client/validation response from Cashfree ────────────
    // Treat a clearly "PAN not valid/not found" body as a normal { verified:false }
    // outcome; treat auth/version/quota problems (no name, error-ish body) as a
    // diagnosable upstream fault so we don't pretend the lookup ran.
    if (status >= 400) {
      logger.error(
        `[cashfree:pan] ${verificationId} non-2xx response`
        + ` [status=${status}] shape=${describeShape(data)} body=${safeStringify(data)}`,
      );
      const looksLikePanRejection =
        !registeredName
        && /not\s*(found|valid)|invalid\s*pan|no\s*record/i.test(safeStringify(data));
      if (looksLikePanRejection) {
        return {
          verified: false,
          name: null,
          status: String(root.status ?? inner.status ?? 'NOT_FOUND').toUpperCase(),
          message: 'This PAN could not be verified with the income tax registry. Please re-check the number.',
          verificationId,
        };
      }
      // Auth/version/quota/etc. — surface as a coded upstream fault. The controller
      // logs the body above and returns a clean 400 JSON (per ops preference), so
      // the load balancer never sees an opaque 502 and the thread stays alive.
      throw makeError('CASHFREE_UPSTREAM', `PAN verification rejected by gateway (status ${status}).`);
    }

    if (isValid && registeredName) {
      return {
        verified: true,
        name: String(registeredName).trim(),
        status: 'VALID',
        message: 'PAN verified with the income tax registry.',
        verificationId,
      };
    }

    // 2xx but not valid / no name — a normal "PAN not found" outcome.
    return {
      verified: false,
      name: null,
      status: String(root.status ?? inner.status ?? 'INVALID').toUpperCase(),
      message: 'This PAN could not be verified with the income tax registry. Please re-check the number.',
      verificationId,
    };
  } catch (mapErr) {
    // A coded error we intentionally threw above (e.g. CASHFREE_UPSTREAM) — let
    // it propagate unchanged to the controller's catch.
    if (mapErr.code) throw mapErr;
    // Any genuinely unexpected mapping failure: log the shape (no PII values) and
    // convert to a structured upstream fault so the thread survives and the
    // controller returns clean JSON.
    logger.error(
      `[cashfree:pan] ${verificationId} response-mapping failure: ${mapErr.message}`
      + ` | status=${status} shape=${describeShape(data)}`,
    );
    throw makeError('CASHFREE_UPSTREAM', 'Unexpected verification response format.');
  }
}

module.exports = { isConfigured, isValidPanFormat, verifyPan };
