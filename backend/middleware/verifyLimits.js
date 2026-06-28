const { Account } = require('../models');
const { badRequest, notFound, forbidden } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Daily transfer-limit guard for outgoing payouts.
 *
 * Schema mapping note: the live `accounts` table already carries the three
 * fields described in the spec (DB sync is locked to alter:false, so we REUSE
 * them rather than adding duplicate columns):
 *   - daily_transfer_limit  → spec "dailyTransferLimit" (default $500,000)
 *   - daily_transferred     → spec "usedDailyLimit"
 *   - last_limit_reset      → spec "lastLimitResetTimestamp"
 *
 * Behaviour:
 *   1. Roll the window: if ≥ 24h have elapsed since last_limit_reset (or it was
 *      never set), reset daily_transferred to 0 and stamp last_limit_reset now.
 *   2. Enforce the ceiling: if (incoming amount + daily_transferred) exceeds
 *      daily_transfer_limit, block instantly with a 400 and the exact message
 *      "Daily transfer limit exceeded. Remaining allowance: $<remaining>".
 *
 * The resolved account (post-reset) is attached to req.transferAccount so the
 * downstream controller can debit + increment usage without re-querying.
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const verifyLimits = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return forbidden(res, 'Authentication required for transfers.');
    }

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');
    if (account.status === 'frozen') return forbidden(res, 'Your account is frozen. Contact support.');

    // ── 1. Roll the 24-hour window if elapsed ────────────────────────────────
    const now = Date.now();
    const lastReset = account.last_limit_reset ? new Date(account.last_limit_reset).getTime() : null;
    if (lastReset === null || (now - lastReset) >= TWENTY_FOUR_HOURS_MS) {
      await account.update({ daily_transferred: 0, last_limit_reset: new Date() });
      logger.info(`Daily transfer window reset for account ${account.id}.`);
    }

    // ── 2. Validate the requested amount against the remaining allowance ──────
    const amount = parseFloat(req.body.amount);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return badRequest(res, 'Enter a valid transfer amount.');
    }

    const dailyLimit = parseFloat(account.daily_transfer_limit || 0);
    const usedToday = parseFloat(account.daily_transferred || 0);

    if (usedToday + amount > dailyLimit) {
      const remaining = Math.max(dailyLimit - usedToday, 0);
      return badRequest(
        res,
        `Daily transfer limit exceeded. Remaining allowance: $${remaining.toLocaleString('en-US')}`
      );
    }

    // Hand the freshly-evaluated account to the controller.
    req.transferAccount = account;
    req.transferLimitSnapshot = {
      dailyLimit,
      usedToday,
      remaining: Math.max(dailyLimit - usedToday, 0),
      remainingAfter: Math.max(dailyLimit - usedToday - amount, 0),
    };

    return next();
  } catch (err) {
    logger.error(`verifyLimits middleware error: ${err.message}`);
    return res.status(500).json({ success: false, message: 'Failed to verify transfer limits.' });
  }
};

module.exports = verifyLimits;
module.exports.verifyLimits = verifyLimits;
module.exports.TWENTY_FOUR_HOURS_MS = TWENTY_FOUR_HOURS_MS;
