const axios = require('axios');
const logger = require('./logger');

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Cloudflare Turnstile CAPTCHA token server-side.
 *
 * Graceful local-dev behaviour: if TURNSTILE_SECRET_KEY is not configured we
 * SKIP verification (returning success with `skipped: true`) and log a warning,
 * so local development isn't blocked when the bot-protection keys are absent.
 *
 * @param {string} token    the `captchaToken` returned by the Turnstile widget
 * @param {string} [ip]     the remote IP, forwarded to Cloudflare for scoring
 * @returns {Promise<{ success: boolean, skipped?: boolean }>}
 */
const verifyTurnstile = async (token, ip) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // No secret configured → skip gracefully (local dev) instead of breaking.
  if (!secret) {
    logger.warn('TURNSTILE_SECRET_KEY not set — skipping CAPTCHA verification.');
    return { success: true, skipped: true };
  }

  // Secret IS configured but the client sent no token → reject.
  if (!token) {
    return { success: false };
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', token);
    if (ip) params.append('remoteip', ip);

    const { data } = await axios.post(TURNSTILE_VERIFY_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });

    if (!data || data.success !== true) {
      logger.warn(`Turnstile verification failed: ${JSON.stringify(data?.['error-codes'] || data)}`);
      return { success: false };
    }

    return { success: true };
  } catch (err) {
    logger.error(`Turnstile verification request error: ${err.message}`);
    return { success: false };
  }
};

module.exports = { verifyTurnstile };
