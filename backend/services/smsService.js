const axios = require('axios');
const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · TRANSACTIONAL SMS (multi-provider: Twilio / Brevo)
   Mirrors the fault-tolerant behaviour of emailService.js:
   - up to 3 attempts with a 1s backoff
   - NEVER throws — always returns a { success } result object so an SMS outage
     can never crash or short-circuit the surrounding backend flow.

   The ACTIVE provider is selected from the admin panel (Admin → SMS Settings)
   and stored in the app_settings table under the key 'sms_provider'
   ('twilio' | 'brevo'). Falls back to env SMS_PROVIDER, then 'twilio'.

   ── Twilio ──
   POST https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json
   Docs: https://www.twilio.com/docs/sms/api/message-resource
   Required env vars:
     TWILIO_ACCOUNT_SID   — Account SID (starts with "AC...")
     TWILIO_AUTH_TOKEN    — Auth token
     TWILIO_FROM_NUMBER   — Your Twilio phone number in E.164, e.g. +15551234567
   Optional:
     TWILIO_MESSAGING_SERVICE_SID — Messaging Service SID ("MG...").
       If set, it takes precedence over TWILIO_FROM_NUMBER.

   ── Brevo ──
   POST https://api.brevo.com/v3/transactionalSMS/sms
   Docs: https://developers.brevo.com/reference/sendtransacsms
   Required env vars:
     BREVO_API_KEY        — Brevo API v3 key (Brevo → SMTP & API → API Keys)
   Optional:
     BREVO_SMS_SENDER     — Alphanumeric sender name (max 11 chars, e.g.
       "ALSTER") or a phone number (max 15 digits). Defaults to "ALSTER".

   Common optional:
     SMS_DEFAULT_COUNTRY_CODE — Country code for bare 10-digit numbers
       (defaults to 91 / India).
   ────────────────────────────────────────────────────────────────────────── */

const MAX_SMS_ATTEMPTS = 3;
const SMS_RETRY_DELAY_MS = 1000;
// Default country code used when a bare number is supplied (India).
const DEFAULT_COUNTRY_CODE = process.env.SMS_DEFAULT_COUNTRY_CODE || '91';

const SMS_PROVIDERS = ['twilio', 'brevo'];
const SMS_PROVIDER_SETTING_KEY = 'sms_provider';
// How long a DB-read of the active provider is cached (avoids a query per SMS).
const PROVIDER_CACHE_TTL_MS = 30 * 1000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Normalize a phone number to E.164 format WITH the leading '+'.
 * e.g. "+919876543210". Handles "+91 98765 43210", "098765-43210", etc.
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

// ─── Active provider resolution (admin-panel controlled) ─────────────────────
// Cached DB lookup of app_settings.sms_provider. The require() for models is
// done lazily inside the function to avoid a circular-dependency at load time.
let providerCache = { value: null, at: 0 };

const getActiveSmsProvider = async () => {
  const now = Date.now();
  if (providerCache.value && now - providerCache.at < PROVIDER_CACHE_TTL_MS) {
    return providerCache.value;
  }
  let provider = null;
  try {
    const { AppSetting } = require('../models');
    const row = await AppSetting.findOne({ where: { key: SMS_PROVIDER_SETTING_KEY } });
    if (row && SMS_PROVIDERS.includes(String(row.value).toLowerCase())) {
      provider = String(row.value).toLowerCase();
    }
  } catch (err) {
    // DB not ready / table missing — fall through to env/default below.
    logger.error(`[SMS] Could not read sms_provider setting: ${err.message}`);
  }
  if (!provider) {
    const envProvider = String(process.env.SMS_PROVIDER || '').toLowerCase();
    provider = SMS_PROVIDERS.includes(envProvider) ? envProvider : 'twilio';
  }
  providerCache = { value: provider, at: now };
  return provider;
};

// Called by the admin controller right after the setting is updated so the
// very next SMS uses the newly-selected provider (no 30s stale window).
const invalidateSmsProviderCache = () => {
  providerCache = { value: null, at: 0 };
};

// ─── Provider request builders ───────────────────────────────────────────────
// Each returns { endpoint, fetchOptions, parseMessageId } or { error } when the
// provider's credentials are not configured.

const buildTwilioRequest = ({ to, content, sender }) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || null;
  const fromNumber = sender || process.env.TWILIO_FROM_NUMBER || null;

  if (!accountSid || !authToken) {
    logger.error('[SMS] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — cannot send SMS.');
    return { error: 'Twilio credentials not configured' };
  }
  if (!messagingServiceSid && !fromNumber) {
    logger.error('[SMS] Neither TWILIO_MESSAGING_SERVICE_SID nor TWILIO_FROM_NUMBER is set.');
    return { error: 'Twilio sender not configured' };
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;

  // Twilio's API expects application/x-www-form-urlencoded bodies.
  const params = new URLSearchParams();
  params.append('To', to);
  params.append('Body', content);
  if (messagingServiceSid) {
    params.append('MessagingServiceSid', messagingServiceSid);
  } else {
    params.append('From', fromNumber);
  }

  return {
    endpoint,
    requestOptions: {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      data: params.toString(),
    },
    parseMessageId: (data) => data?.sid || null,
  };
};

const buildBrevoRequest = ({ to, content, sender }) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    logger.error('[SMS] BREVO_API_KEY not set — cannot send SMS via Brevo.');
    return { error: 'Brevo credentials not configured' };
  }

  // Brevo sender: alphanumeric max 11 chars OR numeric max 15 digits.
  const brevoSender = (sender || process.env.BREVO_SMS_SENDER || 'ALSTER').slice(0, 15);

  return {
    endpoint: 'https://api.brevo.com/v3/transactionalSMS/sms',
    requestOptions: {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      data: {
        type: 'transactional',
        sender: brevoSender,
        recipient: to, // E.164 with leading '+' is accepted by Brevo.
        content,
      },
    },
    parseMessageId: (data) => (data?.messageId != null ? String(data.messageId) : null),
  };
};

const REQUEST_BUILDERS = { twilio: buildTwilioRequest, brevo: buildBrevoRequest };

/**
 * Send a transactional SMS via the ACTIVE provider (admin-selected).
 * @param {Object}  opts
 * @param {string}  opts.recipient  Phone number (any human format).
 * @param {string}  opts.content    Message body (kept as plain text).
 * @param {string} [opts.sender]    Override the "From" number / sender name.
 * @param {string} [opts.provider]  Force a specific provider ('twilio'|'brevo').
 * @returns {Promise<{success:boolean, provider?:string, messageId?:string, attempts?:number, error?:string}>}
 */
const sendSms = async ({ recipient, content, sender, provider } = {}) => {
  const activeProvider = SMS_PROVIDERS.includes(String(provider || '').toLowerCase())
    ? String(provider).toLowerCase()
    : await getActiveSmsProvider();

  const to = normalizeRecipient(recipient);
  if (!to) {
    logger.error(`[SMS] Invalid recipient phone number: "${recipient}"`);
    return { success: false, provider: activeProvider, error: 'Invalid recipient phone number' };
  }
  if (!content || !String(content).trim()) {
    return { success: false, provider: activeProvider, error: 'Empty SMS content' };
  }

  const request = REQUEST_BUILDERS[activeProvider]({ to, content: String(content).trim(), sender });
  if (request.error) {
    return { success: false, provider: activeProvider, error: request.error };
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_SMS_ATTEMPTS; attempt += 1) {
    try {
      // NOTE: axios (not global fetch) is used deliberately. Global fetch only
      // exists on Node 18+ — on older runtimes it threw "fetch is not defined"
      // BEFORE any network request left the server, so nothing ever reached
      // Twilio/Brevo and their dashboards showed zero events. axios is already
      // used for every other outbound HTTP call in this backend.
      // validateStatus: () => true → non-2xx never throws; we inspect status
      // manually to keep the retry / early-bail semantics identical.
      const resp = await axios({
        url: request.endpoint,
        timeout: 15000,
        validateStatus: () => true,
        ...request.requestOptions,
      });

      if (resp.status >= 200 && resp.status < 300) {
        let messageId = null;
        try {
          messageId = request.parseMessageId(resp.data);
        } catch { /* body may be empty on 2xx — that's fine */ }
        logger.info(`[SMS] Sent to ${to} via ${activeProvider} (attempt ${attempt}/${MAX_SMS_ATTEMPTS})${messageId ? `: ${messageId}` : ''}`);
        return { success: true, provider: activeProvider, messageId, attempts: attempt };
      }

      // Non-2xx → capture the error body for diagnostics and retry.
      const errText = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data || '');
      lastError = `HTTP ${resp.status} ${errText}`.trim();
      logger.error(`[SMS] ${activeProvider} attempt ${attempt}/${MAX_SMS_ATTEMPTS} to ${to} failed: ${lastError}`);

      // 4xx errors (bad number, unverified recipient, auth) won't succeed on
      // retry — bail out early to avoid pointless attempts.
      if (resp.status >= 400 && resp.status < 500) {
        break;
      }
    } catch (err) {
      lastError = err.message;
      logger.error(`[SMS] ${activeProvider} attempt ${attempt}/${MAX_SMS_ATTEMPTS} to ${to} threw: ${err.message}`);
    }

    if (attempt < MAX_SMS_ATTEMPTS) {
      await delay(SMS_RETRY_DELAY_MS);
    }
  }

  console.error(`[SMS] ${activeProvider} send to ${to} failed. Last error:`, lastError);
  return { success: false, provider: activeProvider, error: lastError, attempts: MAX_SMS_ATTEMPTS };
};

module.exports = {
  sendSms,
  normalizeRecipient,
  getActiveSmsProvider,
  invalidateSmsProviderCache,
  SMS_PROVIDERS,
  SMS_PROVIDER_SETTING_KEY,
};
