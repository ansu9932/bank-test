const axios = require('axios');
const logger = require('./logger');

/**
 * Opfin / RazorpayX Payroll unified-API client.
 *
 * The Payroll ("Opfin") platform exposes a single unified endpoint that accepts
 * an envelope of { auth, request, data }. We use it here to register the payout
 * beneficiary as a "person" (contractor) record. Authentication is by API id +
 * key secret carried INSIDE the request body (not HTTP headers), matching the
 * Postman collection the product team supplied.
 *
 * Docs/base: https://payroll.razorpay.com/api/people
 *
 * The module degrades gracefully: if credentials are absent, isConfigured()
 * returns false and callers surface a clean 503 instead of throwing on boot.
 */

const OPFIN_PEOPLE_URL = process.env.RAZORPAYX_PAYROLL_URL
  || 'https://payroll.razorpay.com/api/people';
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Resolve the RazorpayX/Opfin credentials with a defensive fallback so the
 * module adapts to either env naming convention without code changes:
 *   • API id : RAZORPAYX_API_ID  ⟶ falls back to RAZORPAYX_PAYROLL_API_ID
 *   • secret : RAZORPAYX_API_KEY ⟶ falls back to RAZORPAYX_PAYROLL_API_KEY_SECRET
 * Resolved at call-time (not module-load) so tests/runtime env changes are
 * honoured, and so isConfigured() and buildAuth() can never drift apart.
 * @returns {{ id: (string|undefined), key: (string|undefined) }}
 */
function resolveCredentials() {
  return {
    id: process.env.RAZORPAYX_API_ID || process.env.RAZORPAYX_PAYROLL_API_ID,
    key: process.env.RAZORPAYX_API_KEY || process.env.RAZORPAYX_PAYROLL_API_KEY_SECRET,
  };
}

/**
 * Whether the Opfin payroll credentials are present (under either naming).
 * @returns {boolean}
 */
function isConfigured() {
  const { id, key } = resolveCredentials();
  return Boolean(id && key);
}

/**
 * Build the standard auth block injected into every unified request.
 * @returns {{ id: string, key: string }}
 */
function buildAuth() {
  const { id, key } = resolveCredentials();
  return { id, key };
}

/**
 * Normalize an axios/Opfin error into a single, log-safe Error.
 * @param {unknown} err
 * @param {string} label
 * @returns {Error}
 */
function normalizeError(err, label) {
  const apiMsg = err?.response?.data?.error
    || err?.response?.data?.message
    || err?.response?.data?.errors
    || err?.message
    || 'Unknown Opfin error';
  const text = typeof apiMsg === 'string' ? apiMsg : JSON.stringify(apiMsg);
  logger.error(`Opfin ${label} failed: ${text}`);
  const e = new Error(text);
  e.isOpfinError = true;
  e.status = err?.response?.status;
  return e;
}

/**
 * Dispatch a unified "people / create" request to Opfin.
 *
 * @param {object} data The `data` block for the person record. Callers map the
 *   front-end fields into this (name, email, type, bank-account-number,
 *   bank-ifsc, vpa, etc.).
 * @returns {Promise<object>} The parsed Opfin response body.
 */
async function createPerson(data) {
  if (!isConfigured()) throw new Error('OPFIN_NOT_CONFIGURED');

  const body = {
    auth: buildAuth(),
    request: {
      type: 'people',
      'sub-type': 'create',
    },
    data,
  };

  try {
    const { data: responseBody } = await axios.post(OPFIN_PEOPLE_URL, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: REQUEST_TIMEOUT_MS,
    });
    return responseBody;
  } catch (err) {
    throw normalizeError(err, 'createPerson');
  }
}

/**
 * Convenience wrapper: register a BANK-ACCOUNT payout beneficiary.
 * @param {object} p
 * @param {string} p.name
 * @param {string} p.email
 * @param {string} p.accountNumber
 * @param {string} p.ifsc
 * @returns {Promise<object>}
 */
async function createBankBeneficiary({ name, email, accountNumber, ifsc }) {
  return createPerson({
    name,
    email,
    type: 'contractor',
    'bank-account-number': String(accountNumber),
    'bank-ifsc': String(ifsc).toUpperCase(),
  });
}

/**
 * Convenience wrapper: register a UPI/VPA payout beneficiary.
 * @param {object} p
 * @param {string} p.name
 * @param {string} p.email
 * @param {string} p.vpa
 * @returns {Promise<object>}
 */
async function createUpiBeneficiary({ name, email, vpa }) {
  return createPerson({
    name,
    email,
    type: 'contractor',
    vpa: String(vpa).trim(),
  });
}

module.exports = {
  OPFIN_PEOPLE_URL,
  isConfigured,
  createPerson,
  createBankBeneficiary,
  createUpiBeneficiary,
};
