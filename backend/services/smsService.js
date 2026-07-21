const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · TRANSACTIONAL SMS (Twilio)
   Mirrors the fault-tolerant behaviour of emailService.js:
   - up to 3 attempts with a 1s backoff
   - NEVER throws — always returns a { success } result object so an SMS outage
     can never crash or short-circuit the surrounding backend flow.

   Uses Twilio's Programmable Messaging REST API:
     POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
   Docs: https://www.twilio.com/docs/sms/api/message-resource

   Required env vars:
     TWILIO_ACCOUNT_SID   — Account SID (starts with "AC...")
     TWILIO_AUTH_TOKEN    — Auth token
     TWILIO_FROM_NUMBER   — Your Twilio phone number in E.164, e.g. +15551234567
   Optional:
     TWILIO_MESSAGING_SERVICE_SID — Messaging Service SID ("MG...").
       If set, it takes precedence over TWILIO_FROM_NUMBER.
     SMS_DEFAULT_COUNTRY_CODE     — Country code for bare 10-digit numbers
       (defaults to 91 / India).
   ────────────────────────────────────────────────────────────────────────── */

const MAX_SMS_ATTEMPTS = 3;
const SMS_RETRY_DELAY_MS = 1000;
// Default country code used when a bare number is supplied (India).
const DEFAULT_COUNTRY_CODE = process.env.SMS_DEFAULT_COUNTRY_CODE || '91';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalize a phone number to E.164 format WITH the leading '+'.
 * Twilio requires E.164 recipients, e.g. "+919876543210".
 * Handles inputs like "+91 98765 43210", "098765-43210", etc.
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
    return `+${digits}`;
  }
  // A leading 0 is the domestic trunk prefix — drop it before prefixing CC.
  digits = digits.replace(/^0+/, '');
  // A 10-digit Indian mobile → prefix the default country code.
  if (digits.length === 10) return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  // 11–12 digits that already start with the country code → use as-is.
  return `+${digits}`;
};

/**
 * Send a transactional SMS via Twilio.
 * @param {Object}  opts
 * @param {string}  opts.recipient  Phone number (any human format).
 * @param {string}  opts.content    Message body (kept as plain text).
 * @param {string} [opts.sender]    Override the "From" number / Messaging Service SID.
 * @returns {Promise<{success:boolean, messageId?:string, attempts?:number, error?:string}>}
 */
const sendSms = async ({ recipient, content, sender } = {}) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || null;
  const fromNumber = sender || process.env.TWILIO_FROM_NUMBER || null;

  if (!accountSid || !authToken) {
    logger.error('[SMS] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — cannot send SMS.');
    return { success: false, error: 'Twilio credentials not configured' };
  }
  if (!messagingServiceSid && !fromNumber) {
    logger.error('[SMS] Neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_FROM_NUMBER is set.');
    return { success: false, error: 'Twilio sender not configured' };
  }

  const to = normalizeRecipient(recipient);
  if (!to) {
    logger.error(`[SMS] Invalid recipient phone number: "${recipient}"`);
    return { success: false, error: 'Invalid recipient phone number' };
  }
  if (!content || !String(content).trim()) {
    return { success: false, error: 'Empty SMS content' };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;

  // Twilio's API expects application/x-www-form-urlencoded bodies.
  const params = new URLSearchParams();
  params.append('To', to);
  params.append('Body', String(content).trim());
  if (messagingServiceSid) {
    params.append('MessagingServiceSid', messagingServiceSid);
  } else {
    params.append('From', fromNumber);
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_SMS_ATTEMPTS; attempt += 1) {
    try {
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: params.toString(),
      });

      if (resp.ok) {
        let messageId = null;
        try {
          const data = await resp.json();
          messageId = data?.sid || null;
        } catch { /* body may be empty on 2xx — that's fine */ }
        logger.info(`[SMS] Sent to ${to} (attempt ${attempt}/${MAX_SMS_ATTEMPTS})${messageId ? `: ${messageId}` : ''}`);
        return { success: true, messageId, attempts: attempt };
      }

      // Non-2xx → capture the error body for diagnostics and retry.
      const errText = await resp.text().catch(() => '');
      lastError = `HTTP ${resp.status} ${errText}`.trim();
      logger.error(`[SMS] Attempt ${attempt}/${MAX_SMS_ATTEMPTS} to ${to} failed: ${lastError}`);

      // 4xx errors (bad number, unverified recipient, auth) won't succeed on
      // retry — bail out early to avoid pointless attempts.
      if (resp.status >= 400 && resp.status < 500) {
        break;
      }
    } catch (err) {
      lastError = err.message;
      logger.error(`[SMS] Attempt ${attempt}/${MAX_SMS_ATTEMPTS} to ${to} threw: ${err.message}`);
    }

    if (attempt < MAX_SMS_ATTEMPTS) {
      await delay(SMS_RETRY_DELAY_MS);
    }
  }

  console.error(`[SMS] Twilio send to ${to} failed. Last error:`, lastError);
  return { success: false, error: lastError, attempts: MAX_SMS_ATTEMPTS };
};

module.exports = { sendSms, normalizeRecipient };
