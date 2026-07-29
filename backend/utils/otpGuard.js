/**
 * otpGuard — anti-OTP-bombing protection, applied at EVERY endpoint that
 * emails a one-time code.
 *
 * The IP-based express-rate-limit middleware (otpLimiter) is kept, but it is
 * NOT sufficient on its own: an attacker can flood a single victim's inbox
 * from many IPs (distributed bombing), or drip requests just under the IP
 * limit for hours. This guard limits sends PER DESTINATION EMAIL, backed by
 * the OTP tables themselves (created_at timestamps), so it works across
 * server instances with no extra infrastructure.
 *
 * Policy (per email address):
 *   - COOLDOWN: at least 60s must pass between two sends (per purpose).
 *   - HOURLY CAP: max 5 codes per rolling hour (all purposes combined).
 *   - DAILY CAP:  max 12 codes per rolling 24h (all purposes combined).
 *
 * Usage:
 *   const gate = await checkOtpFlood(OTP, email, { purpose: '2fa' });
 *   if (!gate.allowed) → reject (or silently skip for anti-enumeration flows)
 */
const { Op, fn, col, where: sqlWhere } = require('sequelize');
const logger = require('./logger');

const COOLDOWN_MS = 60 * 1000;        // 60s between sends (same purpose)
const HOURLY_MAX = 5;                 // codes per email per rolling hour
const DAILY_MAX = 12;                 // codes per email per rolling 24h

/**
 * @param {Model} OtpModel  Sequelize model with email + created_at (OTP or ChatOTP)
 * @param {string} email    Destination email address
 * @param {object} [opts]
 * @param {string} [opts.purpose]  Narrow the cooldown check to one purpose
 *                                 (hour/day caps always span all purposes).
 * @returns {{allowed: boolean, reason?: string, retryAfterSeconds?: number, message?: string}}
 */
async function checkOtpFlood(OtpModel, email, opts = {}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) return { allowed: true };

  const now = Date.now();
  const hasPurpose = opts.purpose && OtpModel.rawAttributes && OtpModel.rawAttributes.purpose;

  // Case-insensitive email match — otherwise per-email caps could be bypassed
  // by re-requesting with varied casing (Victim@x.com, vICTIM@x.com, ...).
  const emailMatch = sqlWhere(fn('LOWER', col('email')), cleanEmail);

  // 1. Cooldown — most recent send for this email (+purpose when available).
  const cooldownWhere = { [Op.and]: [emailMatch] };
  if (hasPurpose) cooldownWhere.purpose = opts.purpose;
  const last = await OtpModel.findOne({
    where: cooldownWhere,
    order: [['created_at', 'DESC']],
    attributes: ['id', 'createdAt'],
  });
  if (last) {
    const lastAt = new Date(last.get('createdAt')).getTime();
    const elapsed = now - lastAt;
    if (elapsed >= 0 && elapsed < COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      return {
        allowed: false,
        reason: 'cooldown',
        retryAfterSeconds,
        message: `Please wait ${retryAfterSeconds}s before requesting another code.`,
      };
    }
  }

  // 2. Hourly cap — all purposes combined (bombing hurts the inbox regardless
  //    of which flow generated the email).
  const hourCount = await OtpModel.count({
    where: { [Op.and]: [emailMatch], createdAt: { [Op.gte]: new Date(now - 60 * 60 * 1000) } },
  });
  if (hourCount >= HOURLY_MAX) {
    logger.warn(`OTP flood blocked (hourly cap) for ${cleanEmail.slice(0, 2)}***`);
    return {
      allowed: false,
      reason: 'hourly_cap',
      retryAfterSeconds: 3600,
      message: 'Too many verification codes requested. Please try again in about an hour.',
    };
  }

  // 3. Daily cap.
  const dayCount = await OtpModel.count({
    where: { [Op.and]: [emailMatch], createdAt: { [Op.gte]: new Date(now - 24 * 60 * 60 * 1000) } },
  });
  if (dayCount >= DAILY_MAX) {
    logger.warn(`OTP flood blocked (daily cap) for ${cleanEmail.slice(0, 2)}***`);
    return {
      allowed: false,
      reason: 'daily_cap',
      retryAfterSeconds: 24 * 3600,
      message: 'Daily verification code limit reached. Please try again tomorrow or contact support.',
    };
  }

  return { allowed: true };
}

module.exports = { checkOtpFlood, COOLDOWN_MS, HOURLY_MAX, DAILY_MAX };
