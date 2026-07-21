const bcrypt = require('bcryptjs');
const axios = require('axios');
const sequelize = require('../config/database');
const { Account, Transaction, User, Notification } = require('../models');
const opfin = require('../utils/opfin');
const { resolveUpiProvider, isValidVpa } = require('../utils/upiProviders');
const { generateReferenceNumber, generateOTP, hashOTP, getOTPExpiry, generateSecureToken, hashValue } = require('../utils/helpers');
const { OTP } = require('../models');
const { Op } = require('sequelize');
const { isMethodEnabled, methodBlockedMessage, normalizeTransferMethods } = require('../utils/transferMethods');
const { SWIFT_COUNTRY_CODES, SWIFT_DEMO_DISCLAIMER, isValidBic, getSwiftCountry, swiftEtaLabel } = require('../utils/swiftCountries');
const {
  sendTransferAlertEmail, sendNeftInitiatedEmail, sendNeftCompletedEmail, sendNeftFailedEmail,
  sendSwiftInitiatedEmail, sendSwiftApprovalRequestEmail, sendSwiftCompletedEmail, sendSwiftFailedEmail,
} = require('../services/emailService');
const { sendSms } = require('../services/smsService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// Razorpay's public IFSC repository (no auth required).
const IFSC_LOOKUP_BASE = 'https://ifsc.razorpay.com';
const IFSC_REGEX = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

// Supported outgoing rails. RTGS intentionally excluded per product spec.
const ALLOWED_MODES = ['IMPS', 'NEFT', 'UPI'];
// IMPS + UPI settle instantly; NEFT is batch-cleared (pending → completed).
const INSTANT_MODES = ['IMPS', 'UPI'];

// NEFT is NO LONGER auto-settled on a timer. It now requires explicit admin
// approval (Approve → completed, Reject → refunded). This human-readable ETA is
// shown to the user up-front (email + success screen) so they understand NEFT
// is not instant. Override via env if operations target a different window.
const NEFT_ETA_LABEL = process.env.NEFT_ETA_LABEL || 'within 2 hours (NEFT is processed in batches)';

// SWIFT email self-approval: the emailed one-time approval link stays valid
// for this long. Only the token's HASH (plus this expiry) is stored, inside
// the transaction's tags — no schema change.
const SWIFT_APPROVAL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const fmtINR = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// ─── Shared transfer-security helpers (idempotency + large-transfer OTP) ─────
// Applied to ALL immediate-debit rails (disburse-payout, internal-transfer,
// swift-transfer) so retries can never double-spend and big amounts always
// require a second factor beyond the PIN.

// Transfers at/above this require a fresh email OTP (env-tunable, no deploy).
const LARGE_TRANSFER_OTP_THRESHOLD = parseFloat(process.env.TRANSFER_OTP_THRESHOLD || '10000');

/**
 * Idempotency guard. If this key was already processed for this account,
 * returns the ORIGINAL transaction (caller replies with it instead of
 * executing a duplicate debit). Returns { key, existing }.
 */
async function checkIdempotency(accountId, idempotencyKey) {
  const key = typeof idempotencyKey === 'string' && idempotencyKey.length <= 100
    ? idempotencyKey : null;
  if (!key) return { key: null, existing: null };
  const existing = await Transaction.findOne({
    where: { account_id: accountId, idempotency_key: key },
  });
  return { key, existing };
}

/** Standard idempotent-replay response built from the original transaction. */
function idempotentReplay(res, txn) {
  return success(res, {
    referenceNumber: txn.reference_number,
    transactionId: txn.id,
    balanceAfter: parseFloat(txn.balance_after),
    status: txn.status,
    duplicate: true,
  }, 'Transfer already processed (idempotent replay).');
}

/**
 * Large-transfer OTP gate. Returns null when the transfer may proceed, or a
 * response (already sent) when it must stop. HTTP 428 + otpRequired:true tells
 * the client to run the OTP step first (POST /transactions/transfer-otp).
 */
async function enforceLargeTransferOTP(res, user, parsedAmount, otp, ip) {
  if (parsedAmount < LARGE_TRANSFER_OTP_THRESHOLD) return null;

  if (!otp) {
    res.status(428).json({
      success: false,
      otpRequired: true,
      threshold: LARGE_TRANSFER_OTP_THRESHOLD,
      message: `Transfers of ${fmtINR(LARGE_TRANSFER_OTP_THRESHOLD)} or more require email OTP verification.`,
    });
    return true;
  }

  const otpRecord = await OTP.findOne({
    where: {
      email: user.email,
      purpose: 'transaction',
      used: false,
      expires_at: { [Op.gt]: new Date() },
    },
    order: [['created_at', 'DESC']],
  });
  if (!otpRecord) {
    badRequest(res, 'No valid OTP found. Please request a new one.');
    return true;
  }
  if (otpRecord.attempts >= 5) {
    await otpRecord.update({ used: true });
    badRequest(res, 'Too many OTP attempts. Please request a new one.');
    return true;
  }
  if (otpRecord.otp_hash !== hashOTP(String(otp))) {
    await otpRecord.increment('attempts');
    badRequest(res, 'Incorrect OTP.');
    return true;
  }
  await otpRecord.update({ used: true });
  return null;
}

/**
 * Boot hook (kept for server.js compatibility). NEFT transfers are now held in
 * 'processing' until an admin approves/rejects them, so there are NO timers to
 * re-arm — we simply log how many are awaiting review. This intentionally
 * replaces the old auto-settlement timer so NEFT never self-completes.
 */
async function resumePendingNeftSettlements() {
  try {
    const count = await Transaction.count({
      where: { status: 'processing', transfer_mode: 'NEFT', category: 'payout' },
    });
    if (count) logger.info(`${count} NEFT transfer(s) awaiting admin approval.`);
  } catch (err) {
    logger.error(`resumePendingNeftSettlements error: ${err.message}`);
  }
}

// ─── Real-time UPI provider lookup ────────────────────────────────────────────
// POST /api/payments/lookup-upi-provider   (protected)
exports.lookupUpiProvider = async (req, res) => {
  try {
    const { vpa } = req.body;
    if (!vpa || !isValidVpa(vpa)) {
      return badRequest(res, 'Please enter a valid UPI ID (e.g. username@okaxis).');
    }
    const { provider, known } = resolveUpiProvider(vpa);
    return success(res, {
      success: true,
      verifiedProvider: known ? provider : `${provider}`,
      known,
      vpa: String(vpa).trim(),
    }, 'UPI handle resolved.');
  } catch (err) {
    logger.error(`lookup-upi-provider error: ${err.message}`);
    return error(res, 'Could not resolve the UPI provider right now.');
  }
};

// ─── Real-time IFSC branch verification ───────────────────────────────────────
// GET /api/payments/verify-ifsc/:ifscCode   (protected)
// Looks up the bank/branch from Razorpay's public IFSC repository so the client
// can confirm the routing destination in real time.
exports.verifyIfsc = async (req, res) => {
  try {
    const ifscCode = String(req.params.ifscCode || '').trim().toUpperCase();

    // Structural guard before hitting the external service.
    if (!IFSC_REGEX.test(ifscCode)) {
      return badRequest(res, 'Invalid IFSC Code structure.');
    }

    try {
      const { data } = await axios.get(`${IFSC_LOOKUP_BASE}/${ifscCode}`, {
        timeout: 8000,
        // The repo returns 404 (sometimes with an empty body) for unknown codes;
        // treat any non-2xx as "not found" rather than throwing.
        validateStatus: (s) => s >= 200 && s < 500,
      });

      // Razorpay returns the literal string "Not Found" / 404 for invalid codes.
      if (!data || typeof data !== 'object' || !data.BANK) {
        return res.status(404).json({
          success: false,
          message: 'Invalid IFSC Code. No matching bank branch found.',
        });
      }

      return success(res, {
        ifsc: ifscCode,
        bank: data.BANK,
        branch: data.BRANCH,
        city: data.CITY,
        state: data.STATE,
      }, 'IFSC verified.');
    } catch (lookupErr) {
      // Network/timeout against the public repo.
      logger.error(`IFSC lookup network error (${ifscCode}): ${lookupErr.message}`);
      return error(res, 'Could not verify the IFSC code right now. Please try again.', 502);
    }
  } catch (err) {
    logger.error(`verify-ifsc error: ${err.message}`);
    return error(res, 'Could not verify the IFSC code.');
  }
};

// ─── Disburse Payout (Opfin unified API) ──────────────────────────────────────
// POST /api/payments/disburse-payout   (protected + verifyLimits)
// verifyLimits has already: rolled the 24h window, validated the amount against
// the daily ceiling, and attached req.transferAccount + req.transferLimitSnapshot.
exports.disbursePayout = async (req, res) => {
  try {
    const {
      mode, amount, beneficiaryName, accountNumber, confirmAccountNumber,
      ifsc, vpa, email, description, securityPin, idempotencyKey, otp,
    } = req.body;

    const upperMode = String(mode || '').toUpperCase();
    if (!ALLOWED_MODES.includes(upperMode)) {
      return badRequest(res, 'Select a valid transfer mode (IMPS, NEFT, or UPI).');
    }

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return badRequest(res, 'Enter a valid transfer amount.');
    }

    const isUpi = upperMode === 'UPI';

    // ── Field validation per rail ─────────────────────────────────────────────
    if (isUpi) {
      if (!isValidVpa(vpa)) return badRequest(res, 'Enter a valid UPI ID (e.g. username@okaxis).');
    } else {
      if (!beneficiaryName) return badRequest(res, 'Beneficiary name is required.');
      if (!accountNumber) return badRequest(res, 'Account number is required.');
      if (confirmAccountNumber !== undefined && String(accountNumber) !== String(confirmAccountNumber)) {
        return badRequest(res, 'Account number and confirmation do not match.');
      }
      if (!ifsc || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(String(ifsc).trim())) {
        return badRequest(res, 'Enter a valid IFSC code.');
      }
    }

    // The verifyLimits middleware resolved + attached the account. Fall back to a
    // direct lookup so the controller is also safe if mounted without it.
    const account = req.transferAccount || await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');

    // ── Per-user transfer-method lock ─────────────────────────────────────────
    // IMPS / NEFT / UPI are disabled by default; an admin must activate the rail
    // for this user before it can be used.
    if (!isMethodEnabled(account, upperMode)) {
      return error(res, methodBlockedMessage(upperMode), 403);
    }

    // ── Idempotency: replay returns the ORIGINAL result, never a re-debit ────
    const { key: idemKey, existing: idemHit } = await checkIdempotency(account.id, idempotencyKey);
    if (idemHit) return idempotentReplay(res, idemHit);

    // ── Security PIN verification ─────────────────────────────────────────────
    const user = await User.findByPk(req.user.id);
    if (!user?.security_pin) return badRequest(res, 'No security PIN set. Please contact support.');
    const pinValid = await bcrypt.compare(String(securityPin || ''), user.security_pin);
    if (!pinValid) return badRequest(res, 'Incorrect security PIN.');

    // ── Large-transfer OTP (server-enforced second factor) ───────────────────
    if (await enforceLargeTransferOTP(res, user, parsedAmount, otp, req.ip)) return;

    // ── Sufficient balance ────────────────────────────────────────────────────
    if (parseFloat(account.available_balance) < parsedAmount) {
      return badRequest(res, 'Insufficient balance for this transfer.');
    }

    if (!opfin.isConfigured()) {
      return error(res, 'Payout gateway is not configured. Please try again later.', 503);
    }

    const beneEmail = email || user.email;
    const beneLabel = isUpi ? String(vpa).trim() : `${beneficiaryName} · ${accountNumber}`;
    const referenceNumber = generateReferenceNumber(isUpi ? 'UPI' : upperMode);

    // ── Opfin unified-API dispatch (people / create) ──────────────────────────
    let opfinResponse;
    try {
      opfinResponse = isUpi
        ? await opfin.createUpiBeneficiary({
          name: beneficiaryName || 'UPI Beneficiary',
          email: beneEmail,
          vpa: String(vpa).trim(),
        })
        : await opfin.createBankBeneficiary({
          name: beneficiaryName,
          email: beneEmail,
          accountNumber,
          ifsc,
        });
    } catch (gwErr) {
      logger.error(`Opfin dispatch error (${referenceNumber}): ${gwErr.message}`);
      const msg = gwErr.message === 'OPFIN_NOT_CONFIGURED'
        ? 'Payout gateway is not configured. Please try again later.'
        : `Payout could not be initiated: ${gwErr.message}`;
      return error(res, msg, gwErr.message === 'OPFIN_NOT_CONFIGURED' ? 503 : 502);
    }

    const opfinPersonId = opfinResponse?.data?.id
      || opfinResponse?.id
      || opfinResponse?.people?.id
      || null;

    // ── Settlement timing: instant (UPI/IMPS) vs NEFT (pending → completed) ───
    const isInstant = INSTANT_MODES.includes(upperMode);
    const txnStatus = isInstant ? 'success' : 'processing'; // 'processing' = pending_settlement

    const t = await sequelize.transaction();
    let writeResult;
    try {
      const locked = await Account.findOne({
        where: { id: account.id }, transaction: t, lock: t.LOCK.UPDATE,
      });

      const balanceBefore = parseFloat(locked.balance);
      const balanceAfter = balanceBefore - parsedAmount;
      if (balanceAfter < 0) throw new Error('Insufficient balance');

      // Debit immediately for all rails; increment the used daily limit.
      await locked.update({
        balance: balanceAfter,
        available_balance: parseFloat(locked.available_balance) - parsedAmount,
        daily_transferred: parseFloat(locked.daily_transferred || 0) + parsedAmount,
      }, { transaction: t });

      const txn = await Transaction.create({
        account_id: locked.id,
        reference_number: referenceNumber,
        transaction_type: 'debit',
        transfer_mode: isUpi ? 'IMPS' : upperMode, // enum has no 'UPI'
        amount: parsedAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: description || `Payout to ${beneLabel}`,
        narration: isUpi ? `UPI ${String(vpa).trim()}` : `${upperMode} ${accountNumber}`,
        category: 'payout',
        status: txnStatus,
        to_account_number: isUpi ? null : accountNumber,
        to_account_name: isUpi ? null : beneficiaryName,
        to_ifsc: isUpi ? null : String(ifsc).toUpperCase(),
        processed_at: isInstant ? new Date() : null,
        ip_address: req.ip,
        idempotency_key: idemKey,
        tags: {
          provider: 'opfin',
          railMode: upperMode,                 // preserves true UPI vs IMPS
          opfinPersonId,
          vpa: isUpi ? String(vpa).trim() : null,
          // NEFT now waits for admin approval (pending_approval); IMPS/UPI are instant.
          settlement: isInstant ? 'instant' : 'pending_approval',
          etaLabel: isInstant ? null : NEFT_ETA_LABEL,
        },
      }, { transaction: t });

      await Notification.create({
        user_id: locked.user_id,
        title: isInstant
          ? `${fmtINR(parsedAmount)} sent via ${upperMode}`
          : `${fmtINR(parsedAmount)} NEFT transfer initiated`,
        message: isInstant
          ? `Your ${upperMode} transfer to ${beneLabel} is complete. Ref: ${referenceNumber}`
          : `Your NEFT transfer to ${beneLabel} has been initiated and typically completes ${NEFT_ETA_LABEL}. We'll email you the moment it's done. Ref: ${referenceNumber}`,
        type: 'transaction',
        priority: 'high',
      }, { transaction: t });

      await t.commit();
      writeResult = { transactionId: txn.id, balanceAfter };
    } catch (txErr) {
      await t.rollback();
      logger.error(`Payout ledger write failed (${referenceNumber}): ${txErr.message}`);
      return error(res, 'Transfer could not be completed. Please try again.');
    }

    // ── NEFT: held in 'processing' until an admin approves/rejects it ─────────
    // (No auto-settlement timer anymore — see resumePendingNeftSettlements.)

    // Async side-effects (don't block the response).
    if (isInstant) {
      // IMPS / UPI — instant debit alert (unchanged).
      sendTransferAlertEmail(user.email, user.first_name, {
        type: 'debit',
        amount: parsedAmount.toFixed(2),
        reference: referenceNumber,
        counterparty: beneLabel,
        mode: upperMode,
        balance: writeResult.balanceAfter,
        time: new Date().toLocaleString(),
      }).catch(() => {});
    } else {
      // NEFT — "initiated, needs time" email with the processing ETA.
      sendNeftInitiatedEmail(user.email, user.first_name, {
        amount: parsedAmount.toFixed(2),
        reference: referenceNumber,
        beneficiary: beneLabel,
        accountNumber,
        ifsc: String(ifsc).toUpperCase(),
        eta: NEFT_ETA_LABEL,
        balance: writeResult.balanceAfter,
        time: new Date().toLocaleString(),
      }).catch(() => {});
    }

    createAuditLog({
      userId: req.user.id,
      action: 'PAYOUT_DISBURSED',
      entityType: 'Transaction',
      entityId: referenceNumber,
      ipAddress: req.ip,
      status: 'success',
      description: `${upperMode} payout of ${fmtINR(parsedAmount)} to ${beneLabel} (${txnStatus}).`,
    }).catch(() => {});

    const snapshot = req.transferLimitSnapshot;
    return success(res, {
      referenceNumber,
      transactionId: writeResult.transactionId,
      mode: upperMode,
      amount: parsedAmount,
      status: isInstant ? 'completed' : 'pending_settlement',
      etaLabel: isInstant ? null : NEFT_ETA_LABEL,
      balance: writeResult.balanceAfter,
      available_balance: writeResult.balanceAfter,
      remainingDailyLimit: snapshot ? snapshot.remainingAfter
        : Math.max(parseFloat(account.daily_transfer_limit) - parseFloat(account.daily_transferred || 0) - parsedAmount, 0),
    }, isInstant
      ? 'Transfer completed successfully.'
      : `NEFT transfer initiated — it typically completes ${NEFT_ETA_LABEL}.`);
  } catch (err) {
    logger.error(`disbursePayout error: ${err.message}`);
    return error(res, 'Transfer failed. Please try again.');
  }
};

// ─── Get current daily transfer-limit usage ───────────────────────────────────
// GET /api/payments/transfer-limit   (protected)
exports.getTransferLimit = async (req, res) => {
  try {
    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    // Mirror the verifyLimits 24h roll so the displayed "used" is never stale.
    const now = Date.now();
    const lastReset = account.last_limit_reset ? new Date(account.last_limit_reset).getTime() : null;
    let used = parseFloat(account.daily_transferred || 0);
    if (lastReset === null || (now - lastReset) >= 24 * 60 * 60 * 1000) {
      await account.update({ daily_transferred: 0, last_limit_reset: new Date() });
      used = 0;
    }

    const limit = parseFloat(account.daily_transfer_limit || 0);
    return success(res, {
      dailyTransferLimit: limit,
      usedDailyLimit: used,
      remaining: Math.max(limit - used, 0),
      availableBalance: parseFloat(account.available_balance),
      // Per-user transfer-method locks so the UI can disable blocked rails.
      transferMethods: normalizeTransferMethods(account.transfer_methods),
    });
  } catch (err) {
    logger.error(`getTransferLimit error: ${err.message}`);
    return error(res, 'Failed to fetch transfer limit.');
  }
};

// ─── Internal Transfer (Alister → Alister) ────────────────────────────────────
// POST /api/payments/internal-transfer   (protected + verifyLimits)
// On-us transfer between two Alister Bank accounts. No external gateway: we
// verify the recipient account exists locally, then perform a single atomic
// ledger transaction — debit the sender, credit the recipient, and write a
// matching pair of COMPLETED transaction records. The verifyLimits middleware
// has already rolled the 24h window and confirmed the daily ceiling.
exports.internalTransfer = async (req, res) => {
  try {
    const {
      amount, accountNumber, confirmAccountNumber, beneficiaryName,
      description, securityPin, idempotencyKey, otp,
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return badRequest(res, 'Enter a valid transfer amount.');
    }
    if (!accountNumber) return badRequest(res, 'Recipient Alister account number is required.');
    if (confirmAccountNumber !== undefined && String(accountNumber) !== String(confirmAccountNumber)) {
      return badRequest(res, 'Account number and confirmation do not match.');
    }

    // The verifyLimits middleware resolved + attached the sender account. Fall
    // back to a direct lookup so the controller is also safe if mounted alone.
    const senderAccount = req.transferAccount
      || await Account.findOne({ where: { user_id: req.user.id } });
    if (!senderAccount) return notFound(res, 'No active bank account found for this profile.');
    if (senderAccount.status === 'frozen') {
      return error(res, 'Your account is frozen. Contact support.', 403);
    }

    // ── Per-user transfer-method lock ─────────────────────────────────────────
    // Alister Internal is enabled by default, but an admin can still disable it.
    if (!isMethodEnabled(senderAccount, 'ALISTER')) {
      return error(res, methodBlockedMessage('ALISTER'), 403);
    }

    // Prevent self-transfer.
    if (String(senderAccount.account_number) === String(accountNumber)) {
      return badRequest(res, 'You cannot transfer to your own account.');
    }

    // ── Recipient must be a real, active Alister account ──────────────────────
    const recipientAccount = await Account.findOne({ where: { account_number: String(accountNumber).trim() } });
    if (!recipientAccount) {
      return badRequest(res, 'Recipient Alister account not found. Please verify the account number.');
    }
    if (recipientAccount.status !== 'active') {
      return badRequest(res, 'Recipient account is not active and cannot receive funds.');
    }

    // ── Idempotency: replay returns the ORIGINAL result, never a re-debit ────
    const { key: idemKey, existing: idemHit } = await checkIdempotency(senderAccount.id, idempotencyKey);
    if (idemHit) return idempotentReplay(res, idemHit);

    // ── Security PIN verification ─────────────────────────────────────────────
    const user = await User.findByPk(req.user.id);
    if (!user?.security_pin) return badRequest(res, 'No security PIN set. Please contact support.');
    const pinValid = await bcrypt.compare(String(securityPin || ''), user.security_pin);
    if (!pinValid) return badRequest(res, 'Incorrect security PIN.');

    // ── Large-transfer OTP (server-enforced second factor) ───────────────────
    if (await enforceLargeTransferOTP(res, user, parsedAmount, otp, req.ip)) return;

    // ── Sufficient balance ────────────────────────────────────────────────────
    if (parseFloat(senderAccount.available_balance) < parsedAmount) {
      return badRequest(res, 'Insufficient balance for this transfer.');
    }

    const recipientUser = await User.findByPk(recipientAccount.user_id);
    const recipientName = recipientUser
      ? `${recipientUser.first_name || ''} ${recipientUser.last_name || ''}`.trim()
      : (beneficiaryName || 'Alister Account');
    const senderName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Alister Account';
    const referenceNumber = generateReferenceNumber('ALST');

    // ── Atomic ledger transaction ─────────────────────────────────────────────
    const t = await sequelize.transaction();
    let writeResult;
    try {
      // Lock BOTH rows (lowest id first) to avoid deadlocks under concurrency.
      const [firstId, secondId] = [senderAccount.id, recipientAccount.id].sort();
      const lockedA = await Account.findOne({ where: { id: firstId }, transaction: t, lock: t.LOCK.UPDATE });
      const lockedB = await Account.findOne({ where: { id: secondId }, transaction: t, lock: t.LOCK.UPDATE });
      const lockedSender = lockedA.id === senderAccount.id ? lockedA : lockedB;
      const lockedRecipient = lockedA.id === recipientAccount.id ? lockedA : lockedB;

      const senderBalanceBefore = parseFloat(lockedSender.balance);
      const senderBalanceAfter = senderBalanceBefore - parsedAmount;
      if (senderBalanceAfter < 0) throw new Error('Insufficient balance');

      const recipientBalanceBefore = parseFloat(lockedRecipient.balance);
      const recipientBalanceAfter = recipientBalanceBefore + parsedAmount;

      // Debit sender (+ increment daily usage), credit recipient.
      await lockedSender.update({
        balance: senderBalanceAfter,
        available_balance: parseFloat(lockedSender.available_balance) - parsedAmount,
        daily_transferred: parseFloat(lockedSender.daily_transferred || 0) + parsedAmount,
      }, { transaction: t });

      await lockedRecipient.update({
        balance: recipientBalanceAfter,
        available_balance: parseFloat(lockedRecipient.available_balance) + parsedAmount,
      }, { transaction: t });

      // Sender's debit leg (completed).
      const debitTxn = await Transaction.create({
        account_id: lockedSender.id,
        reference_number: referenceNumber,
        transaction_type: 'debit',
        transfer_mode: 'INTERNAL',
        amount: parsedAmount,
        balance_before: senderBalanceBefore,
        balance_after: senderBalanceAfter,
        description: description || `Alister transfer to ${recipientName}`,
        narration: `INTERNAL ${recipientAccount.account_number}`,
        category: 'transfer',
        status: 'success',
        to_account_number: recipientAccount.account_number,
        to_account_name: recipientName,
        to_ifsc: recipientAccount.ifsc_code,
        from_account_number: lockedSender.account_number,
        from_account_name: senderName,
        processed_at: new Date(),
        ip_address: req.ip,
        idempotency_key: idemKey,
        tags: { provider: 'internal', railMode: 'ALISTER', counterpartyAccountId: lockedRecipient.id },
      }, { transaction: t });

      // Recipient's credit leg (completed). Distinct reference suffix to satisfy
      // the unique reference_number constraint while staying easy to correlate.
      await Transaction.create({
        account_id: lockedRecipient.id,
        reference_number: `${referenceNumber}-CR`,
        transaction_type: 'credit',
        transfer_mode: 'INTERNAL',
        amount: parsedAmount,
        balance_before: recipientBalanceBefore,
        balance_after: recipientBalanceAfter,
        description: description || `Alister transfer from ${senderName}`,
        narration: `INTERNAL ${lockedSender.account_number}`,
        category: 'transfer',
        status: 'success',
        to_account_number: recipientAccount.account_number,
        to_account_name: recipientName,
        from_account_number: lockedSender.account_number,
        from_account_name: senderName,
        processed_at: new Date(),
        ip_address: req.ip,
        tags: { provider: 'internal', railMode: 'ALISTER', counterpartyAccountId: lockedSender.id, linkedRef: referenceNumber },
      }, { transaction: t });

      // Notify both parties.
      await Notification.create({
        user_id: lockedSender.user_id,
        title: `${fmtINR(parsedAmount)} sent to ${recipientName}`,
        message: `Your Alister transfer to ${recipientName} is complete. Ref: ${referenceNumber}`,
        type: 'transaction',
        priority: 'high',
      }, { transaction: t });

      if (lockedRecipient.user_id) {
        await Notification.create({
          user_id: lockedRecipient.user_id,
          title: `${fmtINR(parsedAmount)} received from ${senderName}`,
          message: `You received an Alister transfer from ${senderName}. Ref: ${referenceNumber}`,
          type: 'transaction',
          priority: 'high',
        }, { transaction: t });
      }

      await t.commit();
      writeResult = { transactionId: debitTxn.id, senderBalanceAfter };
    } catch (txErr) {
      await t.rollback();
      logger.error(`Internal transfer ledger write failed (${referenceNumber}): ${txErr.message}`);
      return error(res, 'Transfer could not be completed. Please try again.');
    }

    // Async side-effects (don't block the response).
    sendTransferAlertEmail(user.email, user.first_name, {
      type: 'debit',
      amount: parsedAmount.toFixed(2),
      reference: referenceNumber,
      counterparty: `${recipientName} · ${recipientAccount.account_number}`,
      mode: 'ALISTER',
      balance: writeResult.senderBalanceAfter,
      time: new Date().toLocaleString(),
    }).catch(() => {});

    // Recipient CREDIT alert — every successful credit notifies the receiver too.
    if (recipientUser?.email) {
      sendTransferAlertEmail(recipientUser.email, recipientUser.first_name || 'Customer', {
        type: 'credit',
        amount: parsedAmount.toFixed(2),
        reference: referenceNumber,
        counterparty: `${senderName} · ${senderAccount.account_number}`,
        mode: 'ALISTER',
        balance: (parseFloat(recipientAccount.balance) + parsedAmount).toFixed(2),
        time: new Date().toLocaleString(),
      }).catch(() => {});
    }

    createAuditLog({
      userId: req.user.id,
      action: 'INTERNAL_TRANSFER',
      entityType: 'Transaction',
      entityId: referenceNumber,
      ipAddress: req.ip,
      status: 'success',
      description: `Internal Alister transfer of ${fmtINR(parsedAmount)} to ${recipientAccount.account_number}.`,
    }).catch(() => {});

    const snapshot = req.transferLimitSnapshot;
    return success(res, {
      referenceNumber,
      transactionId: writeResult.transactionId,
      mode: 'ALISTER',
      amount: parsedAmount,
      status: 'completed',
      balance: writeResult.senderBalanceAfter,
      available_balance: writeResult.senderBalanceAfter,
      recipientName,
      remainingDailyLimit: snapshot ? snapshot.remainingAfter
        : Math.max(parseFloat(senderAccount.daily_transfer_limit) - parseFloat(senderAccount.daily_transferred || 0) - parsedAmount, 0),
    }, 'Transfer completed successfully.');
  } catch (err) {
    logger.error(`internalTransfer error: ${err.message}`);
    return error(res, 'Transfer failed. Please try again.');
  }
};

// ─── Admin: list pending NEFT transfers awaiting approval ─────────────────────
// GET /api/admin/neft-requests   (adminProtect + role)
// Returns every NEFT payout still held in 'processing' (i.e. awaiting an admin
// decision), with the beneficiary account/IFSC/amount and the requesting user.
exports.adminListNeftRequests = async (req, res) => {
  try {
    const txns = await Transaction.findAll({
      where: { transfer_mode: 'NEFT', category: 'payout', status: 'processing' },
      limit: 200,
    });

    const requests = [];
    for (const txn of txns) {
      // eslint-disable-next-line no-await-in-loop
      const account = await Account.findByPk(txn.account_id);
      let user = null;
      if (account) {
        // eslint-disable-next-line no-await-in-loop
        user = await User.findByPk(account.user_id, {
          attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'customer_id'],
        });
      }
      requests.push({
        id: txn.id,
        reference: txn.reference_number,
        amount: parseFloat(txn.amount),
        beneficiaryName: txn.to_account_name,
        beneficiaryAccount: txn.to_account_number,
        ifsc: txn.to_ifsc,
        description: txn.description,
        createdAt: txn.createdAt || null,
        eta: (txn.tags && txn.tags.etaLabel) || NEFT_ETA_LABEL,
        fromAccount: account ? account.account_number : null,
        user: user ? {
          id: user.id,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          email: user.email,
          phone: user.phone,
          customerId: user.customer_id,
        } : null,
      });
    }

    // Newest first (sorted in JS to avoid any timestamp column-name coupling).
    requests.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return success(res, { requests, count: requests.length });
  } catch (err) {
    logger.error(`adminListNeftRequests error: ${err.message}`);
    return error(res, 'Failed to fetch NEFT requests.');
  }
};

// ─── Admin: approve / reject a pending NEFT transfer ──────────────────────────
// POST /api/admin/neft-requests/:id/review   Body: { decision:'approve'|'reject', reason? }
//   approve → mark the (already-debited) transfer 'success' + email the user.
//   reject  → atomically REFUND the amount, mark 'failed', and email the user
//             a failure reason (e.g. bank server down / beneficiary bank not
//             responding). IMPS/UPI/internal are never routed here.
exports.adminReviewNeftTransfer = async (req, res) => {
  try {
    const { decision, reason } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return badRequest(res, "decision must be 'approve' or 'reject'.");
    }

    const txn = await Transaction.findByPk(req.params.id);
    if (!txn || txn.transfer_mode !== 'NEFT' || txn.category !== 'payout') {
      return notFound(res, 'NEFT transfer not found.');
    }
    if (txn.status !== 'processing') {
      return badRequest(res, 'This NEFT transfer has already been processed.');
    }

    const account = await Account.findByPk(txn.account_id);
    const user = account ? await User.findByPk(account.user_id) : null;
    const beneLabel = txn.to_account_name
      ? `${txn.to_account_name} · ${txn.to_account_number}`
      : (txn.to_account_number || 'beneficiary');
    const amount = parseFloat(txn.amount);

    // ── APPROVE → complete (no balance change; it was debited at creation) ───
    if (decision === 'approve') {
      await txn.update({
        status: 'success',
        processed_at: new Date(),
        tags: { ...(txn.tags || {}), settlement: 'settled', approvedBy: req.admin?.id || null },
      });

      if (account) {
        await Notification.create({
          user_id: account.user_id,
          title: `NEFT transfer of ${fmtINR(amount)} completed`,
          message: `Your NEFT transfer to ${beneLabel} (Ref: ${txn.reference_number}) has been processed successfully.`,
          type: 'transaction',
          priority: 'high',
        }).catch(() => {});
      }

      if (user?.email) {
        sendNeftCompletedEmail(user.email, user.first_name || 'Customer', {
          amount: amount.toFixed(2),
          reference: txn.reference_number,
          beneficiary: beneLabel,
          accountNumber: txn.to_account_number,
          ifsc: txn.to_ifsc,
          balance: account ? parseFloat(account.balance).toFixed(2) : null,
          time: new Date().toLocaleString(),
        }).catch((e) => logger.error(`NEFT completed email failed: ${e.message}`));
      }

      createAuditLog({
        adminId: req.admin?.id, userId: account?.user_id, action: 'NEFT_APPROVED',
        entityType: 'Transaction', entityId: txn.reference_number, ipAddress: req.ip,
        status: 'success', description: `NEFT ${fmtINR(amount)} to ${beneLabel} approved & completed.`,
      }).catch(() => {});

      return success(res, { id: txn.id, status: 'success' }, 'NEFT transfer approved and completed.');
    }

    // ── REJECT → refund the debited amount + mark failed ─────────────────────
    const failureReason = (reason && String(reason).trim())
      || 'The beneficiary bank did not respond. Your money has been refunded.';

    if (!account) {
      await txn.update({
        status: 'failed', failure_reason: failureReason,
        tags: { ...(txn.tags || {}), settlement: 'failed' },
      });
      return success(res, { id: txn.id, status: 'failed' }, 'NEFT transfer rejected.');
    }

    const refundRef = `${txn.reference_number}-RV`;
    const t = await sequelize.transaction();
    let newBalance;
    try {
      const locked = await Account.findOne({ where: { id: account.id }, transaction: t, lock: t.LOCK.UPDATE });
      const before = parseFloat(locked.balance);
      newBalance = before + amount;

      await locked.update({
        balance: newBalance,
        available_balance: parseFloat(locked.available_balance) + amount,
        // Return the daily-limit headroom since the transfer didn't go through.
        daily_transferred: Math.max(parseFloat(locked.daily_transferred || 0) - amount, 0),
      }, { transaction: t });

      await txn.update({
        status: 'failed',
        failure_reason: failureReason,
        tags: { ...(txn.tags || {}), settlement: 'failed', rejectedBy: req.admin?.id || null },
      }, { transaction: t });

      await Transaction.create({
        account_id: locked.id,
        reference_number: refundRef,
        transaction_type: 'credit',
        transfer_mode: 'REVERSAL',
        amount,
        balance_before: before,
        balance_after: newBalance,
        description: `Refund — NEFT ${txn.reference_number} could not be completed`,
        narration: `REVERSAL ${txn.reference_number}`,
        category: 'reversal',
        status: 'success',
        processed_at: new Date(),
        reversal_reason: failureReason,
        tags: { reversalOf: txn.reference_number },
      }, { transaction: t });

      await Notification.create({
        user_id: locked.user_id,
        title: `NEFT transfer of ${fmtINR(amount)} failed — refunded`,
        message: `Your NEFT transfer to ${beneLabel} could not be completed (${failureReason}) ${fmtINR(amount)} has been refunded to your account.`,
        type: 'transaction',
        priority: 'high',
      }, { transaction: t });

      await t.commit();
    } catch (txErr) {
      await t.rollback();
      logger.error(`NEFT refund failed (${txn.reference_number}): ${txErr.message}`);
      return error(res, 'Could not process the rejection/refund. Please try again.');
    }

    if (user?.email) {
      sendNeftFailedEmail(user.email, user.first_name || 'Customer', {
        amount: amount.toFixed(2),
        reference: txn.reference_number,
        beneficiary: beneLabel,
        reason: failureReason,
        refundAmount: amount.toFixed(2),
        balance: newBalance.toFixed(2),
        time: new Date().toLocaleString(),
      }).catch((e) => logger.error(`NEFT failed email error: ${e.message}`));
    }

    createAuditLog({
      adminId: req.admin?.id, userId: account.user_id, action: 'NEFT_REJECTED_REFUNDED',
      entityType: 'Transaction', entityId: txn.reference_number, ipAddress: req.ip,
      status: 'success', description: `NEFT ${fmtINR(amount)} to ${beneLabel} rejected & refunded. Reason: ${failureReason}`,
    }).catch(() => {});

    return success(res, { id: txn.id, status: 'failed', refunded: amount }, 'NEFT transfer rejected and refunded.');
  } catch (err) {
    logger.error(`adminReviewNeftTransfer error: ${err.message}`);
    return error(res, 'Failed to process the NEFT transfer.');
  }
};

// ─── SWIFT (international) transfer — initiate ────────────────────────────────
// POST /api/payments/swift-transfer   (protect + verifyLimits)
// DEMO/simulated cross-border wire. Locked per-user (admin enables 'swift').
// Debits immediately and holds the transfer in 'processing' until an admin
// approves (complete) or rejects (refund) — same lifecycle as NEFT.
exports.swiftTransfer = async (req, res) => {
  try {
    const {
      amount, beneficiaryName, accountNumber, confirmAccountNumber,
      swiftCode, beneficiaryBank, country, description, securityPin,
      idempotencyKey, otp, notifyPhone,
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return badRequest(res, 'Enter a valid transfer amount.');
    }
    if (!beneficiaryName) return badRequest(res, 'Beneficiary name is required.');
    if (!accountNumber) return badRequest(res, 'Beneficiary account number / IBAN is required.');
    if (confirmAccountNumber !== undefined && String(accountNumber) !== String(confirmAccountNumber)) {
      return badRequest(res, 'Account number and confirmation do not match.');
    }
    const bic = String(swiftCode || '').trim().toUpperCase();
    if (!isValidBic(bic)) return badRequest(res, 'Enter a valid SWIFT/BIC code (8 or 11 characters).');

    // Beneficiary bank name is REQUIRED for SWIFT — it is used in customer
    // notifications (SMS/email) to identify the destination bank.
    const bankName = String(beneficiaryBank || '').trim();
    if (!bankName) return badRequest(res, 'Beneficiary bank name is required.');

    // Registered phone number is REQUIRED — the approval SMS goes to this number.
    const smsPhoneNumber = String(notifyPhone || '').trim();
    if (smsPhoneNumber.replace(/\D/g, '').length < 10) {
      return badRequest(res, 'Enter your account registered phone number for SMS updates.');
    }

    const countryCode = String(country || '').trim().toUpperCase();
    if (!SWIFT_COUNTRY_CODES.includes(countryCode)) {
      return badRequest(res, 'Select a supported destination country (India, Nepal, Bhutan, or Bangladesh).');
    }
    const countryInfo = getSwiftCountry(countryCode);

    const account = req.transferAccount || await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');

    // Per-user lock — SWIFT is disabled by default; an admin must enable it.
    if (!isMethodEnabled(account, 'SWIFT')) {
      return error(res, methodBlockedMessage('SWIFT'), 403);
    }

    // ── Idempotency: replay returns the ORIGINAL result, never a re-debit ────
    const { key: idemKey, existing: idemHit } = await checkIdempotency(account.id, idempotencyKey);
    if (idemHit) return idempotentReplay(res, idemHit);

    const user = await User.findByPk(req.user.id);
    if (!user?.security_pin) return badRequest(res, 'No security PIN set. Please contact support.');
    const pinValid = await bcrypt.compare(String(securityPin || ''), user.security_pin);
    if (!pinValid) return badRequest(res, 'Incorrect security PIN.');

    // ── Large-transfer OTP (server-enforced second factor) ───────────────────
    if (await enforceLargeTransferOTP(res, user, parsedAmount, otp, req.ip)) return;

    if (parseFloat(account.available_balance) < parsedAmount) {
      return badRequest(res, 'Insufficient balance for this transfer.');
    }

    // ── Email self-approval eligibility (admin-enabled per user) ─────────────
    // Eligible users receive a "payment processing" email with an "Approve
    // this transaction" link instead of waiting solely on the admin queue.
    // The one-time token is stored HASHED in the transaction tags (no schema
    // change) with a 24h expiry; the raw token exists only in the email link.
    const emailApprovalEligible = user.swift_email_approval === true;
    const approvalToken = emailApprovalEligible ? generateSecureToken(32) : null;
    const approvalTokenExpiresAt = emailApprovalEligible
      ? new Date(Date.now() + SWIFT_APPROVAL_TOKEN_TTL_MS).toISOString()
      : null;

    const referenceNumber = generateReferenceNumber('SWIFT');
    const etaLabel = swiftEtaLabel(countryCode);
    const beneLabel = `${beneficiaryName} · ${accountNumber}`;

    const t = await sequelize.transaction();
    let writeResult;
    try {
      const locked = await Account.findOne({ where: { id: account.id }, transaction: t, lock: t.LOCK.UPDATE });
      const balanceBefore = parseFloat(locked.balance);
      const balanceAfter = balanceBefore - parsedAmount;
      if (balanceAfter < 0) throw new Error('Insufficient balance');

      await locked.update({
        balance: balanceAfter,
        available_balance: parseFloat(locked.available_balance) - parsedAmount,
        daily_transferred: parseFloat(locked.daily_transferred || 0) + parsedAmount,
      }, { transaction: t });

      const txn = await Transaction.create({
        account_id: locked.id,
        reference_number: referenceNumber,
        transaction_type: 'debit',
        transfer_mode: 'SWIFT',
        amount: parsedAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: description || `SWIFT transfer to ${beneLabel} (${countryInfo.name})`,
        narration: `SWIFT ${bic} ${accountNumber}`,
        category: 'swift', // discriminator for the admin SWIFT queue
        status: 'processing',
        to_account_number: accountNumber,
        to_account_name: beneficiaryName,
        to_bank_name: bankName,
        processed_at: null,
        ip_address: req.ip,
        idempotency_key: idemKey,
        tags: {
          railMode: 'SWIFT',
          swiftCode: bic,
          country: countryCode,
          countryName: countryInfo.name,
          etaLabel,
          settlement: 'pending_approval',
          // Registered mobile number the customer wants SWIFT SMS updates on.
          // Falls back to the profile phone when the form field is left blank.
          // NOTE (revised SMS timing): no SMS is sent at submission — it goes
          // out only after approval (admin queue or email self-approval).
          notifyPhone: smsPhoneNumber,
          // Email self-approval (admin-enabled per user): the hashed one-time
          // approval token lives in tags — no schema change required.
          approvalChannel: emailApprovalEligible ? 'email' : 'manual',
          ...(emailApprovalEligible ? {
            approvalTokenHash: hashValue(approvalToken),
            approvalTokenExpiresAt,
          } : {}),
          demo: true,
        },
      }, { transaction: t });

      await Notification.create({
        user_id: locked.user_id,
        title: `${fmtINR(parsedAmount)} SWIFT transfer initiated`,
        message: `Your international SWIFT transfer to ${beneLabel} (${countryInfo.name}) has been initiated and ${etaLabel}. Ref: ${referenceNumber}.`,
        type: 'transaction',
        priority: 'high',
      }, { transaction: t });

      await t.commit();
      writeResult = { transactionId: txn.id, balanceAfter };
    } catch (txErr) {
      await t.rollback();
      logger.error(`SWIFT ledger write failed (${referenceNumber}): ${txErr.message}`);
      return error(res, 'Transfer could not be completed. Please try again.');
    }

    if (emailApprovalEligible) {
      // "Payment processing" email with the self-approval CTA. The link opens
      // the public review page (/swift-approval?token=…); an email OTP then
      // releases the transfer instantly. No SMS is sent at this stage.
      const approveLink = `${process.env.FRONTEND_URL || 'https://alisterbank.online'}/swift-approval?token=${approvalToken}`;
      sendSwiftApprovalRequestEmail(user.email, user.first_name, {
        amount: parsedAmount.toFixed(2),
        reference: referenceNumber,
        beneficiary: beneLabel,
        bank: bankName,
        swiftCode: bic,
        country: countryInfo.name,
        eta: etaLabel,
        approveLink,
        expiresIn: '24 hours',
        time: new Date().toLocaleString(),
      }).catch(() => {});
    } else {
      sendSwiftInitiatedEmail(user.email, user.first_name, {
        amount: parsedAmount.toFixed(2),
        reference: referenceNumber,
        beneficiary: beneLabel,
        bank: bankName,
        swiftCode: bic,
        country: countryInfo.name,
        eta: etaLabel,
        balance: writeResult.balanceAfter.toFixed(2),
        time: new Date().toLocaleString(),
        disclaimer: SWIFT_DEMO_DISCLAIMER,
      }).catch(() => {});
    }

    createAuditLog({
      userId: req.user.id, action: 'SWIFT_INITIATED', entityType: 'Transaction',
      entityId: referenceNumber, ipAddress: req.ip, status: 'success',
      description: `SWIFT ${fmtINR(parsedAmount)} to ${beneLabel} (${countryInfo.name}) initiated.`,
    }).catch(() => {});

    const snapshot = req.transferLimitSnapshot;
    return success(res, {
      referenceNumber,
      transactionId: writeResult.transactionId,
      mode: 'SWIFT',
      amount: parsedAmount,
      status: 'pending_settlement',
      etaLabel,
      country: countryInfo.name,
      balance: writeResult.balanceAfter,
      available_balance: writeResult.balanceAfter,
      remainingDailyLimit: snapshot ? snapshot.remainingAfter
        : Math.max(parseFloat(account.daily_transfer_limit) - parseFloat(account.daily_transferred || 0) - parsedAmount, 0),
    }, `SWIFT transfer initiated — it ${etaLabel}.`);
  } catch (err) {
    logger.error(`swiftTransfer error: ${err.message}`);
    return error(res, 'Transfer failed. Please try again.');
  }
};

// ─── Admin: list pending SWIFT transfers awaiting approval ────────────────────
// GET /api/admin/swift-requests
exports.adminListSwiftRequests = async (req, res) => {
  try {
    const txns = await Transaction.findAll({
      where: { category: 'swift', status: 'processing' },
      limit: 200,
    });

    const requests = [];
    for (const txn of txns) {
      // eslint-disable-next-line no-await-in-loop
      const account = await Account.findByPk(txn.account_id);
      let user = null;
      if (account) {
        // eslint-disable-next-line no-await-in-loop
        user = await User.findByPk(account.user_id, {
          attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'customer_id'],
        });
      }
      const tags = txn.tags || {};
      requests.push({
        id: txn.id,
        reference: txn.reference_number,
        amount: parseFloat(txn.amount),
        beneficiaryName: txn.to_account_name,
        beneficiaryAccount: txn.to_account_number,
        beneficiaryBank: txn.to_bank_name,
        swiftCode: tags.swiftCode || null,
        country: tags.countryName || tags.country || null,
        description: txn.description,
        createdAt: txn.createdAt || null,
        eta: tags.etaLabel || null,
        fromAccount: account ? account.account_number : null,
        // Recipient for the approval SMS: form-supplied number, else profile phone.
        notifyPhone: tags.notifyPhone || (user ? user.phone : null) || null,
        // 'email' → the customer can self-approve via the emailed link;
        // 'manual' → only this admin queue can release it.
        approvalChannel: tags.approvalChannel === 'email' ? 'email' : 'manual',
        user: user ? {
          id: user.id,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          email: user.email,
          phone: user.phone,
          customerId: user.customer_id,
        } : null,
      });
    }

    requests.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return success(res, { requests, count: requests.length });
  } catch (err) {
    logger.error(`adminListSwiftRequests error: ${err.message}`);
    return error(res, 'Failed to fetch SWIFT requests.');
  }
};

// ─── Shared SWIFT settlement helper ───────────────────────────────────────────
// Completes a 'processing' SWIFT transfer: marks it success, notifies the user
// (in-app + completion email) and sends the post-approval SMS to the phone
// number the customer entered on the SWIFT form. Reused by BOTH approval
// paths — the admin queue (manual approve) and the email self-approval flow —
// so settlement behaviour can never drift between them.
//
// SMS policy (revised): NO SMS is sent at submission time. The SMS goes out
// only here, after approval. For admin approvals the admin-composed message is
// used when provided (same behaviour as before); for email self-approvals a
// default confirmation is auto-sent.
async function settleSwiftTransfer(txn, {
  approvedByAdminId = null,
  channel = 'admin',            // 'admin' | 'email'
  smsMessage = null,
  smsPhone = null,
  ip = null,
} = {}) {
  const account = await Account.findByPk(txn.account_id);
  const user = account ? await User.findByPk(account.user_id) : null;
  const tags = txn.tags || {};
  const countryName = tags.countryName || tags.country || '—';
  const beneLabel = txn.to_account_name
    ? `${txn.to_account_name} · ${txn.to_account_number}`
    : (txn.to_account_number || 'beneficiary');
  const amount = parseFloat(txn.amount);

  await txn.update({
    status: 'success',
    processed_at: new Date(),
    tags: {
      ...tags,
      settlement: 'settled',
      approvedBy: approvedByAdminId,
      approvalChannel: channel,
      // Single-use: the emailed approval token can never be replayed.
      approvalTokenHash: null,
      approvalTokenExpiresAt: null,
    },
  });

  if (account) {
    await Notification.create({
      user_id: account.user_id,
      title: `SWIFT transfer of ${fmtINR(amount)} completed`,
      message: `Your international SWIFT transfer to ${beneLabel} (${countryName}) (Ref: ${txn.reference_number}) has been processed successfully.`,
      type: 'transaction',
      priority: 'high',
    }).catch(() => {});
  }

  if (user?.email) {
    sendSwiftCompletedEmail(user.email, user.first_name || 'Customer', {
      amount: amount.toFixed(2),
      reference: txn.reference_number,
      beneficiary: beneLabel,
      bank: txn.to_bank_name || '—',
      swiftCode: tags.swiftCode || '—',
      country: countryName,
      balance: account ? parseFloat(account.balance).toFixed(2) : null,
      time: new Date().toLocaleString(),
      disclaimer: SWIFT_DEMO_DISCLAIMER,
    }).catch((e) => logger.error(`SWIFT completed email failed: ${e.message}`));
  }

  // ── Post-approval SMS to the number entered on the SWIFT form ─────────────
  // Recipient priority: explicit override → the number the customer registered
  // on the SWIFT form (tags.notifyPhone) → profile phone. Admin approvals send
  // only when the admin supplied a message (as before); email self-approvals
  // auto-send a default confirmation.
  const smsRecipient = (smsPhone && String(smsPhone).trim())
    || tags.notifyPhone
    || user?.phone
    || null;
  const smsContent = (smsMessage && String(smsMessage).trim())
    || (channel === 'email'
      ? `Alister Bank: Your SWIFT transfer of ${fmtINR(amount)} to ${(txn.to_bank_name || 'the beneficiary bank').toUpperCase()} (Ref ${txn.reference_number}) has been APPROVED and is now processing for delivery. We never ask for OTP/PIN.`
      : null);
  if (smsContent && smsRecipient) {
    sendSms({ recipient: smsRecipient, content: smsContent })
      .then((r) => {
        if (r.success) {
          createAuditLog({
            adminId: approvedByAdminId, userId: account?.user_id, action: 'SWIFT_APPROVAL_SMS_SENT',
            entityType: 'Transaction', entityId: txn.reference_number, ipAddress: ip,
            status: 'success', description: `Approval SMS sent to ${smsRecipient} for SWIFT ${txn.reference_number} (${channel} approval).`,
          }).catch(() => {});
        } else {
          logger.error(`SWIFT approval SMS failed (${txn.reference_number}): ${r.error}`);
        }
      })
      .catch((e) => logger.error(`SWIFT approval SMS threw: ${e.message}`));
  }

  createAuditLog({
    adminId: approvedByAdminId, userId: account?.user_id,
    action: channel === 'email' ? 'SWIFT_EMAIL_SELF_APPROVED' : 'SWIFT_APPROVED',
    entityType: 'Transaction', entityId: txn.reference_number, ipAddress: ip,
    status: 'success',
    description: `SWIFT ${fmtINR(amount)} to ${beneLabel} (${countryName}) approved & completed via ${channel === 'email' ? 'email self-approval' : 'admin approval'}.`,
  }).catch(() => {});

  return { account, user, amount, beneLabel, countryName };
}

// ─── Admin: approve / reject a pending SWIFT transfer ─────────────────────────
// POST /api/admin/swift-requests/:id/review   Body: { decision:'approve'|'reject', reason? }
exports.adminReviewSwiftTransfer = async (req, res) => {
  try {
    const { decision, reason, smsMessage, smsPhone } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return badRequest(res, "decision must be 'approve' or 'reject'.");
    }

    const txn = await Transaction.findByPk(req.params.id);
    if (!txn || txn.category !== 'swift') {
      return notFound(res, 'SWIFT transfer not found.');
    }
    if (txn.status !== 'processing') {
      return badRequest(res, 'This SWIFT transfer has already been processed.');
    }

    const account = await Account.findByPk(txn.account_id);
    const user = account ? await User.findByPk(account.user_id) : null;
    const tags = txn.tags || {};
    const countryName = tags.countryName || tags.country || '—';
    const beneLabel = txn.to_account_name
      ? `${txn.to_account_name} · ${txn.to_account_number}`
      : (txn.to_account_number || 'beneficiary');
    const amount = parseFloat(txn.amount);

    // ── APPROVE → complete (already debited at creation) ─────────────────────
    // Settlement is delegated to the shared settleSwiftTransfer helper (also
    // used by the email self-approval flow) so both paths stay identical.
    if (decision === 'approve') {
      await settleSwiftTransfer(txn, {
        approvedByAdminId: req.admin?.id || null,
        channel: 'admin',
        smsMessage: smsMessage && String(smsMessage).trim() ? String(smsMessage).trim() : null,
        smsPhone: smsPhone && String(smsPhone).trim() ? String(smsPhone).trim() : null,
        ip: req.ip,
      });

      return success(res, { id: txn.id, status: 'success' }, 'SWIFT transfer approved and completed.');
    }

    // ── REJECT → refund + mark failed ────────────────────────────────────────
    const failureReason = (reason && String(reason).trim())
      || 'The beneficiary/correspondent bank could not process the wire. Your money has been refunded.';

    if (!account) {
      await txn.update({ status: 'failed', failure_reason: failureReason, tags: { ...tags, settlement: 'failed' } });
      return success(res, { id: txn.id, status: 'failed' }, 'SWIFT transfer rejected.');
    }

    const refundRef = `${txn.reference_number}-RV`;
    const t = await sequelize.transaction();
    let newBalance;
    try {
      const locked = await Account.findOne({ where: { id: account.id }, transaction: t, lock: t.LOCK.UPDATE });
      const before = parseFloat(locked.balance);
      newBalance = before + amount;

      await locked.update({
        balance: newBalance,
        available_balance: parseFloat(locked.available_balance) + amount,
        daily_transferred: Math.max(parseFloat(locked.daily_transferred || 0) - amount, 0),
      }, { transaction: t });

      await txn.update({
        status: 'failed',
        failure_reason: failureReason,
        tags: { ...tags, settlement: 'failed', rejectedBy: req.admin?.id || null },
      }, { transaction: t });

      await Transaction.create({
        account_id: locked.id,
        reference_number: refundRef,
        transaction_type: 'credit',
        transfer_mode: 'REVERSAL',
        amount,
        balance_before: before,
        balance_after: newBalance,
        description: `Refund — SWIFT ${txn.reference_number} could not be completed`,
        narration: `REVERSAL ${txn.reference_number}`,
        category: 'reversal',
        status: 'success',
        processed_at: new Date(),
        reversal_reason: failureReason,
        tags: { reversalOf: txn.reference_number },
      }, { transaction: t });

      await Notification.create({
        user_id: locked.user_id,
        title: `SWIFT transfer of ${fmtINR(amount)} failed — refunded`,
        message: `Your SWIFT transfer to ${beneLabel} (${countryName}) could not be completed (${failureReason}) ${fmtINR(amount)} has been refunded.`,
        type: 'transaction',
        priority: 'high',
      }, { transaction: t });

      await t.commit();
    } catch (txErr) {
      await t.rollback();
      logger.error(`SWIFT refund failed (${txn.reference_number}): ${txErr.message}`);
      return error(res, 'Could not process the rejection/refund. Please try again.');
    }

    if (user?.email) {
      sendSwiftFailedEmail(user.email, user.first_name || 'Customer', {
        amount: amount.toFixed(2),
        reference: txn.reference_number,
        beneficiary: beneLabel,
        country: countryName,
        reason: failureReason,
        refundAmount: amount.toFixed(2),
        balance: newBalance.toFixed(2),
        time: new Date().toLocaleString(),
        disclaimer: SWIFT_DEMO_DISCLAIMER,
      }).catch((e) => logger.error(`SWIFT failed email error: ${e.message}`));
    }

    createAuditLog({
      adminId: req.admin?.id, userId: account.user_id, action: 'SWIFT_REJECTED_REFUNDED',
      entityType: 'Transaction', entityId: txn.reference_number, ipAddress: req.ip,
      status: 'success', description: `SWIFT ${fmtINR(amount)} to ${beneLabel} (${countryName}) rejected & refunded. Reason: ${failureReason}`,
    }).catch(() => {});

    return success(res, { id: txn.id, status: 'failed', refunded: amount }, 'SWIFT transfer rejected and refunded.');
  } catch (err) {
    logger.error(`adminReviewSwiftTransfer error: ${err.message}`);
    return error(res, 'Failed to process the SWIFT transfer.');
  }
};

exports.resumePendingNeftSettlements = resumePendingNeftSettlements;
