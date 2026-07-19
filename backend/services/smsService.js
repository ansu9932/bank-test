const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · TRANSACTIONAL SMS (Brevo)
   Mirrors the fault-tolerant behaviour of emailService.js:
   - up to 3 attempts with a 1s backoff
   - NEVER throws — always returns a { success } result object so an SMS outage
     can never crash or short-circuit the surrounding backend flow.

   Uses Brevo's transactional SMS API:
     POST https://api.brevo.com/v3/transactionalSMS/send
   Docs: https://developers.brevo.com/reference/sendtransacsms
   ────────────────────────────────────────────────────────────────────────── */

const BREVO_SMS_ENDPOINT = 'https://api.brevo.com/v3/transactionalSMS/send';
const MAX_SMS_ATTEMPTS = 3;
const SMS_RETRY_DELAY_MS = 1000;
// Default country code used when a bare number is supplied (India).
const DEFAULT_COUNTRY_CODE = process.env.SMS_DEFAULT_COUNTRY_CODE || '91';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalize a phone number to E.164 digits WITHOUT the leading '+'.
 * Brevo expects the recipient as digits only (country code + number), e.g.
 * "919876543210". Handles inputs like "+91 98765 43210", "098765-43210", etc.
 */
const normalizeRecipient = (raw) => {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const hadPlus = trimmed.startsWith('+');
  // Strip everything that isn't a digit.
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hadPlus) {
    // Already international (e.g. +91..., +1...). Trust the country code.
    return digits;
  }
  // A leading 0 is the domestic trunk prefix — drop it before prefixing CC.
  digits = digits.replace(/^0+/, '');
  // A 10-digit Indian mobile → prefix the default country code.
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`;
  // 11–12 digits that already start with the country code → use as-is.
  return digits;
};

/**
 * Send a transactional SMS via Brevo.
 * @param {Object}  opts
 * @param {string}  opts.recipient  Phone number (any human format).
 * @param {string}  opts.content    Message body (kept as plain text).
 * @param {string} [opts.sender]    Override the alphanumeric sender ID.
 * @returns {Promise<{success:boolean, messageId?:string, attempts?:number, error?:string}>}
 */
const sendSms = async ({ recipient, content, sender } = {}) => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderId = (sender || process.env.BREVO_SMS_SENDER || 'ALSTER').slice(0, 11);

  if (!apiKey) {
    logger.error('[SMS] BREVO_API_KEY is not set — cannot send SMS.');
    return { success: false, error: 'BREVO_API_KEY not configured' };
  }

  const to = normalizeRecipient(recipient);
  if (!to) {
    logger.error(`[SMS] Invalid recipient phone number: "${recipient}"`);
    return { success: false, error: 'Invalid recipient phone number' };
  }
  if (!content || !String(content).trim()) {
    return { success: false, error: 'Empty SMS content' };
  }

  const body = {
    type: 'transactional',
    sender: senderId,
    recipient: to,
    content: String(content).trim(),
  };

  let lastError;
  for (let attempt = 1; attempt <= MAX_SMS_ATTEMPTS; attempt += 1) {
    try {
      const resp = await fetch(BREVO_SMS_ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (resp.ok) {
        let messageId = null;
        try {
          const data = await resp.json();
          messageId = data?.messageId || data?.reference || null;
        } catch { /* body may be empty on 2xx — that's fine */ }
        logger.info(`[SMS] Sent to ${to} (attempt ${attempt}/${MAX_SMS_ATTEMPTS})${messageId ? `: ${messageId}` : ''}`);
        return { success: true, messageId, attempts: attempt };
      }

      // Non-2xx → capture the error body for diagnostics and retry.
      const errText = await resp.text().catch(() => '');
      lastError = `HTTP ${resp.status} ${errText}`.trim();
      logger.error(`[SMS] Attempt ${attempt}/${MAX_SMS_ATTEMPTS} to ${to} failed: ${lastError}`);
    } catch (err) {
      lastError = err.message;
      logger.error(`[SMS] Attempt ${attempt}/${MAX_SMS_ATTEMPTS} to ${to} threw: ${err.message}`);
    }

    if (attempt < MAX_SMS_ATTEMPTS) {
      await delay(SMS_RETRY_DELAY_MS);
    }
  }

  console.error(`[SMS] All ${MAX_SMS_ATTEMPTS} attempts to ${to} failed. Last error:`, lastError);
  return { success: false, error: lastError, attempts: MAX_SMS_ATTEMPTS };
};

module.exports = { sendSms, normalizeRecipient };
