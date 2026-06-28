const sequelize = require('../config/database');
const { User, Account, Transaction, Notification, ApprovedCard } = require('../models');
const { verifyDepositToken } = require('../utils/depositLink');
const {
  isLuhnValid, detectCardNetwork, maskCardNumber, hashValue, generateReferenceNumber, minimumBalanceForType,
} = require('../utils/helpers');
const { sendSimulatedDepositCreditEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound } = require('../utils/apiResponse');
const { scheduleAccountSetup } = require('../jobs/kycWorkflow');
const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · ACTIVATION DEPOSIT
   Onboarding step after Video KYC approval. The user is emailed a signed link
   to this flow to deposit the minimum balance and activate their account.
   A deposit is only accepted when the entered card matches the admin-managed
   approved cards list (ApprovedCard). On success the account balance is
   credited, a deposit confirmation email is sent, and the cron worker emails
   the account-setup link ~2 minutes later.
   ────────────────────────────────────────────────────────────────────────── */

// ─── GET /api/account/activation-deposit/verify/:token ────────────────────────
// Resolves the account number + holder name + required minimum from the token
// so the public deposit page can render the "which account is being funded".
exports.verifyLink = async (req, res) => {
  try {
    const { token } = req.params;
    const check = verifyDepositToken(token);
    if (!check.valid) {
      const msg = check.reason === 'expired'
        ? 'This activation link has expired. Please contact support for a new one.'
        : 'This activation link is invalid.';
      return badRequest(res, msg);
    }

    const user = await User.findByPk(check.userId, {
      attributes: ['id', 'first_name', 'last_name', 'email', 'customer_id'],
    });
    if (!user) return notFound(res, 'Account not found.');

    const account = await Account.findOne({ where: { user_id: user.id } });
    if (!account) return notFound(res, 'No account is associated with this link yet.');

    const holderName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Account Holder';

    return success(res, {
      valid: true,
      accountNumber: account.account_number,
      holderName,
      minimumDeposit: parseFloat(account.minimum_balance) || minimumBalanceForType(account.account_type),
      alreadyDeposited: Boolean(account.activation_deposit_done),
      sandbox: true,
    }, 'Link is valid.');
  } catch (err) {
    logger.error(`Activation deposit verify error: ${err.message}`);
    return error(res, 'Failed to verify the activation link.');
  }
};

// ─── POST /api/account/activation-deposit/submit ──────────────────────────────
// Body: { token, cardNumber, cardHolder, expiry, cvv, amount }
exports.submitDeposit = async (req, res) => {
  try {
    const { token, cardNumber, cardHolder, expiry, amount } = req.body;

    const check = verifyDepositToken(token);
    if (!check.valid) {
      return badRequest(res, 'Your activation link is invalid or has expired.');
    }

    const user = await User.findByPk(check.userId);
    if (!user) return notFound(res, 'Account not found.');

    const account = await Account.findOne({ where: { user_id: user.id } });
    if (!account) return notFound(res, 'No account is associated with this link.');

    // Idempotency: if already activated, don't double-credit.
    if (account.activation_deposit_done) {
      return success(res, { alreadyDeposited: true }, 'Your activation deposit has already been received.');
    }

    const minimum = parseFloat(account.minimum_balance) || minimumBalanceForType(account.account_type);
    const depositAmount = parseFloat(amount);
    if (!depositAmount || Number.isNaN(depositAmount) || depositAmount <= 0) {
      return badRequest(res, 'Please enter a valid deposit amount.');
    }
    if (depositAmount < minimum) {
      return badRequest(res, `The minimum activation deposit is $${minimum.toLocaleString('en-US')}.`);
    }

    // ── Card validation (sandbox) ──────────────────────────────────────────
    const digits = String(cardNumber || '').replace(/\D/g, '');
    if (digits.length < 12 || !isLuhnValid(digits)) {
      return badRequest(res, 'Please enter a valid card number.');
    }
    if (!cardHolder || !String(cardHolder).trim()) {
      return badRequest(res, 'Cardholder name is required.');
    }

    // Match against the admin-managed sandbox allow-list.
    const cardHash = hashValue(digits);
    const approved = await ApprovedCard.findOne({ where: { card_number_hash: cardHash, is_active: true } });
    if (!approved) {
      logger.warn(`Activation deposit rejected — card not in sandbox allow-list (user ${user.id}).`);
      return badRequest(res, 'This card could not be processed. Please use an authorised sandbox test card or contact support.');
    }

    const last4 = digits.slice(-4);
    const network = detectCardNetwork(digits);
    const reference = generateReferenceNumber('DEP');

    // ── Credit the (sandbox) ledger atomically ─────────────────────────────
    const t = await sequelize.transaction();
    let balanceAfter;
    try {
      const locked = await Account.findOne({
        where: { id: account.id }, transaction: t, lock: t.LOCK.UPDATE,
      });
      const balanceBefore = parseFloat(locked.balance);
      balanceAfter = balanceBefore + depositAmount;

      await locked.update({
        balance: balanceAfter,
        available_balance: parseFloat(locked.available_balance) + depositAmount,
        activation_deposit_done: true,
        activation_deposit_at: new Date(),
      }, { transaction: t });

      await Transaction.create({
        account_id: locked.id,
        reference_number: reference,
        transaction_type: 'credit',
        transfer_mode: 'SYSTEM',
        amount: depositAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: 'Activation deposit (Credit Card) — sandbox simulation',
        narration: `Simulated activation deposit · Credit Card ending ${last4}`,
        category: 'activation_deposit',
        status: 'success',
        from_account_name: 'Activation Deposit (Simulated)',
        processed_at: new Date(),
        tags: { simulated: true, mode: 'credit_card', last4, network, cardId: approved.id },
      }, { transaction: t });

      await Notification.create({
        user_id: locked.user_id,
        title: `$${depositAmount.toLocaleString('en-US')} activation deposit received`,
        message: 'Your activation deposit was received (simulated). Your account setup link will arrive shortly.',
        type: 'transaction',
        priority: 'high',
      }, { transaction: t });

      await t.commit();
    } catch (txErr) {
      await t.rollback();
      logger.error(`Activation deposit credit failed (user ${user.id}): ${txErr.message}`);
      return error(res, 'Could not complete your activation deposit. Please try again.');
    }

    createAuditLog({
      userId: user.id,
      action: 'ACTIVATION_DEPOSIT_SIMULATED',
      entityType: 'Account',
      entityId: account.id,
      ipAddress: req.ip,
      status: 'success',
      description: `Simulated activation deposit of $${depositAmount} via Credit Card ending ${last4}.`,
    }).catch(() => {});

    // Reliably send the account-setup email ~2 minutes from now (in-process
    // timer, independent of the minute-cron which is unreliable on shared hosting).
    scheduleAccountSetup(user.id);

    // Simulated credit confirmation email (mode "Credit Card", no bank name).
    sendSimulatedDepositCreditEmail(user.email, user.first_name || 'Customer', {
      amount: depositAmount.toFixed(2),
      last4,
      cardHolder: String(cardHolder).trim(),
      balance: balanceAfter.toFixed(2),
      reference,
      time: new Date().toLocaleString('en-US'),
    }).catch((e) => logger.error(`Activation deposit credit email failed: ${e.message}`));

    return success(res, {
      credited: depositAmount,
      balance: balanceAfter,
      maskedCard: maskCardNumber(digits),
      reference,
      sandbox: true,
    }, 'Activation deposit received. Your account setup link will arrive shortly.');
  } catch (err) {
    logger.error(`Activation deposit submit error: ${err.message}`);
    return error(res, 'Failed to process your activation deposit.');
  }
};
