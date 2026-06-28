const cron = require('node-cron');
const { Op } = require('sequelize');
const { User, SecureLink, Account } = require('../models');
const { generateSecureToken, getSecureLinkExpiry, getOnboardingLinkExpiry, generateAccountNumber, generateIFSC, minimumBalanceForType } = require('../utils/helpers');
const { sendVideoKYCEmail, sendAccountApprovedEmail, sendActivationDepositEmail } = require('../services/emailService');
const { issueDepositToken } = require('../utils/depositLink');
const logger = require('../utils/logger');

/**
 * KYC Workflow Automation (~2-minute cadence between each onboarding email).
 *
 * IMPORTANT — shared-hosting reliability:
 * On Hostinger shared hosting the Node process is suspended between requests by
 * Passenger, so a once-a-minute cron cannot be relied on to fire the next
 * email. To guarantee delivery we ALSO schedule the next step with an in-process
 * 2-minute timer the moment the previous step completes (see
 * scheduleActivationDeposit / scheduleAccountSetup, called from the controllers).
 * The cron jobs below remain as a best-effort backup. Every step is idempotent
 * (atomic claim / existing-link guard) so nothing is ever sent twice.
 */

const STEP_DELAY_MS = 2 * 60 * 1000; // 2 minutes

// ─── Step logic (idempotent, reusable by both the timer and the cron) ─────────

/**
 * Promote a user who has completed Video KYC to the activation-deposit stage:
 * create their account (if missing) and email the activation-deposit link.
 * Atomic claim guarantees this runs EXACTLY ONCE per user even if the in-process
 * timer and the cron fire together.
 */
async function promoteToActivationDeposit(userId) {
  try {
    if (!userId) return;
    // Atomic claim: flip video_kyc_pending → approved only if still eligible.
    // Whoever wins (timer or cron) proceeds; the other gets claimed === 0.
    const [claimed] = await User.update(
      { kyc_status: 'approved' },
      { where: { id: userId, kyc_status: 'video_kyc_pending', video_kyc_completed: true } },
    );
    if (!claimed) return; // already promoted, or not ready yet

    const user = await User.findByPk(userId);
    if (!user) return;

    let account = await Account.findOne({ where: { user_id: userId } });
    if (!account) {
      account = await Account.create({
        user_id: userId,
        account_number: generateAccountNumber(),
        ifsc_code: generateIFSC('000001'),
        swift_code: process.env.BANK_SWIFT || 'ALSTINBB',
        account_type: user.account_type,
        balance: 0.00,
        available_balance: 0.00,
        currency: 'USD',
        status: 'active',
        minimum_balance: minimumBalanceForType(user.account_type),
      });
    }

    const { token } = issueDepositToken(userId);
    const depositLink = `${process.env.FRONTEND_URL}/activate-deposit?token=${token}`;
    await sendActivationDepositEmail(user.email, user.first_name, {
      depositLink,
      minimumBalance: parseFloat(account.minimum_balance) || minimumBalanceForType(account.account_type),
      accountNumber: account.account_number,
    });
    logger.info(`Activation deposit link sent to ${user.email}`);
  } catch (err) {
    logger.error(`promoteToActivationDeposit error (${userId}): ${err.message}`);
  }
}

/**
 * Email the account-setup link after the activation deposit. Idempotent: skips
 * if the user already completed setup or already has an unused setup link.
 */
async function sendAccountSetupLink(userId) {
  try {
    if (!userId) return;
    const user = await User.findByPk(userId);
    if (!user || user.setup_completed) return;

    const account = await Account.findOne({ where: { user_id: userId } });
    if (!account || !account.activation_deposit_done) return;

    const existingSetup = await SecureLink.findOne({
      where: {
        user_id: userId,
        purpose: 'account_setup',
        used: false,
        expires_at: { [Op.gt]: new Date() },
      },
    });
    if (existingSetup) return; // already issued — don't duplicate

    const setupToken = generateSecureToken();
    await SecureLink.create({
      user_id: userId,
      token: setupToken,
      purpose: 'account_setup',
      expires_at: getSecureLinkExpiry(60 * 24), // 24h
    });

    const setupLink = `${process.env.FRONTEND_URL}/account-setup?token=${setupToken}`;
    await sendAccountApprovedEmail(user.email, user.first_name, setupLink, account.account_number);
    logger.info(`Account setup link sent (post-deposit) to ${user.email}`);
  } catch (err) {
    logger.error(`sendAccountSetupLink error (${userId}): ${err.message}`);
  }
}

// ─── In-process schedulers (the reliable path on shared hosting) ──────────────
// Called from the controllers the moment a step completes, so the next email is
// sent ~2 minutes later from the SAME live process — no dependency on the cron.

function scheduleActivationDeposit(userId, delayMs = STEP_DELAY_MS) {
  if (!userId) return;
  const t = setTimeout(() => { promoteToActivationDeposit(userId); }, delayMs);
  if (typeof t.unref === 'function') t.unref();
  logger.info(`Scheduled activation-deposit email for user ${userId} in ${Math.round(delayMs / 1000)}s.`);
}

function scheduleAccountSetup(userId, delayMs = STEP_DELAY_MS) {
  if (!userId) return;
  const t = setTimeout(() => { sendAccountSetupLink(userId); }, delayMs);
  if (typeof t.unref === 'function') t.unref();
  logger.info(`Scheduled account-setup email for user ${userId} in ${Math.round(delayMs / 1000)}s.`);
}

// ─── Cron backup (runs when the process happens to be alive) ──────────────────

const runKYCWorkflow = () => {
  // Step 1: Auto-send Video KYC after 2 minutes of under_review.
  cron.schedule('* * * * *', async () => {
    try {
      const twoMinutesAgo = new Date(Date.now() - STEP_DELAY_MS);
      const users = await User.findAll({
        where: {
          kyc_status: 'under_review',
          updated_at: { [Op.lte]: twoMinutesAgo },
          video_kyc_completed: false,
        },
        limit: 10,
      });

      for (const user of users) {
        const existingLink = await SecureLink.findOne({
          where: {
            user_id: user.id,
            purpose: 'video_kyc',
            used: false,
            expires_at: { [Op.gt]: new Date() },
          },
        });

        if (!existingLink) {
          const token = generateSecureToken();
          const expiresAt = getOnboardingLinkExpiry(); // 24h
          await SecureLink.create({
            user_id: user.id, token, purpose: 'video_kyc', expires_at: expiresAt,
          });
          const kycLink = `${process.env.FRONTEND_URL}/video-kyc?token=${token}`;
          await sendVideoKYCEmail(user.email, user.first_name, kycLink);
          await user.update({ kyc_status: 'video_kyc_pending' });
          logger.info(`Video KYC link sent to ${user.email}`);
        }
      }
    } catch (err) {
      logger.error(`KYC Workflow Step 1 error: ${err.message}`);
    }
  });

  // Step 2 (backup): activation-deposit email ~2 min after Video KYC completed.
  cron.schedule('* * * * *', async () => {
    try {
      const twoMinutesAgo = new Date(Date.now() - STEP_DELAY_MS);
      const users = await User.findAll({
        where: {
          kyc_status: 'video_kyc_pending',
          video_kyc_completed: true,
          updated_at: { [Op.lte]: twoMinutesAgo },
        },
        limit: 10,
      });
      for (const user of users) {
        await promoteToActivationDeposit(user.id);
      }
    } catch (err) {
      logger.error(`KYC Workflow Step 2 error: ${err.message}`);
    }
  });

  // Step 3 (backup): account-setup email ~2 min after the activation deposit.
  cron.schedule('* * * * *', async () => {
    try {
      const twoMinutesAgo = new Date(Date.now() - STEP_DELAY_MS);
      const accounts = await Account.findAll({
        where: {
          activation_deposit_done: true,
          activation_deposit_at: { [Op.lte]: twoMinutesAgo },
        },
        limit: 20,
      });
      for (const account of accounts) {
        await sendAccountSetupLink(account.user_id);
      }
    } catch (err) {
      logger.error(`KYC Workflow Step 3 error: ${err.message}`);
    }
  });

  // Clean up expired OTPs and secure links every hour.
  cron.schedule('0 * * * *', async () => {
    try {
      const { OTP } = require('../models');
      await OTP.update({ used: true }, { where: { expires_at: { [Op.lt]: new Date() }, used: false } });
      await SecureLink.update({ used: true }, { where: { expires_at: { [Op.lt]: new Date() }, used: false } });
      logger.info('Expired OTPs and secure links cleaned up.');
    } catch (err) {
      logger.error(`Cleanup job error: ${err.message}`);
    }
  });

  // Daily limit reset at midnight.
  cron.schedule('0 0 * * *', async () => {
    try {
      await Account.update({ daily_transferred: 0, last_limit_reset: new Date() }, { where: {} });
      logger.info('Daily transfer limits reset.');
    } catch (err) {
      logger.error(`Daily limit reset error: ${err.message}`);
    }
  });

  logger.info('KYC workflow cron jobs initialized.');
};

module.exports = {
  runKYCWorkflow,
  promoteToActivationDeposit,
  sendAccountSetupLink,
  scheduleActivationDeposit,
  scheduleAccountSetup,
};
