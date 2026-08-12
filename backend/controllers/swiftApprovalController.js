const { Op } = require('sequelize');
const { Account, Transaction, User, OTP } = require('../models');
const { settleSwiftTransfer } = require('./payoutController');
const { hashValue, hashOTP, generateOTP, getOTPExpiry, displayName } = require('../utils/helpers');
const { sendOTPEmail, sendSwiftBeneficiaryEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { checkOtpFlood } = require('../utils/otpGuard');

/* ──────────────────────────────────────────────────────────────────────────
   SWIFT EMAIL SELF-APPROVAL (public, token-gated)

   Flow: an eligible user (users.swift_email_approval = true) submits a SWIFT
   transfer → they receive a "payment processing" email with an "Approve this
   transaction" button → /swift-approval?token=… (public review page) → an
   OTP is sent to the registered email → OTP verified → the transfer settles
   instantly via the SAME settleSwiftTransfer helper the admin queue uses
   (completion email + post-approval SMS included).

   Security model:
   - The raw token is emailed once and NEVER stored; only its SHA-256 hash
     lives in the transaction's tags (no schema change).
   - Tokens are single-use (cleared on settlement) and expire after 24h.
   - Every endpoint is rate-limited (see routes/swiftApproval.js) and unknown
     tokens get one uniform "invalid or expired" error so nothing can be
     enumerated.
   ────────────────────────────────────────────────────────────────────────── */

const INVALID_LINK_MSG = 'This approval link is invalid, expired, or has already been used.';

// Mask helpers so the PUBLIC review page never leaks full PII.
const maskEmail = (email) => {
  const [local = '', domain = ''] = String(email || '').split('@');
  if (!domain) return '•••@•••';
  return `${local.slice(0, 2)}${'•'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
};

const maskAccount = (acc) => {
  const s = String(acc || '');
  return s.length <= 4 ? s : `••••${s.slice(-4)}`;
};

/**
 * Resolve a pending SWIFT transaction from a raw approval token.
 * Returns { txn } on success, or { errorMessage } when the token is
 * unknown / expired / already settled — callers respond uniformly with 410.
 */
async function findPendingByToken(rawToken) {
  const token = String(rawToken || '').trim();
  // Structural guard: tokens are hex from generateSecureToken (64 chars).
  if (!/^[a-f0-9]{32,128}$/i.test(token)) {
    console.log('[v0] swift-approval: token failed structural guard', { length: token.length });
    return { errorMessage: INVALID_LINK_MSG };
  }

  const tokenHash = hashValue(token);
  // The pending SWIFT queue is small (same bound the admin list uses).
  // Newest-first ordering guarantees a fresh transfer can NEVER be pushed
  // outside the 200-row window by older backlog rows.
  const candidates = await Transaction.findAll({
    where: { category: 'swift', status: 'processing' },
    order: [['created_at', 'DESC']],
    limit: 200,
  });
  console.log('[v0] swift-approval: lookup', {
    computedHash: `${tokenHash.slice(0, 12)}…`,
    pendingCandidates: candidates.length,
    tagsTypes: candidates.slice(0, 5).map((t) => typeof t.tags),
    storedHashes: candidates.slice(0, 5).map((t) => (t.tags?.approvalTokenHash ? `${t.tags.approvalTokenHash.slice(0, 12)}…` : null)),
  });
  const txn = candidates.find((t) => t.tags && t.tags.approvalTokenHash === tokenHash);
  if (!txn) {
    // Distinguish "already approved" from a truly unknown/expired token so the
    // page can show an accurate message. On settlement the hash moves to
    // approvalTokenUsedHash and status becomes 'success' (see settleSwiftTransfer).
    const settled = await Transaction.findAll({
      where: { category: 'swift', status: 'success' },
      order: [['updated_at', 'DESC']],
      limit: 200,
    });
    const done = settled.find((t) => t.tags && t.tags.approvalTokenUsedHash === tokenHash);
    if (done) {
      console.log('[v0] swift-approval: token matches an already-settled transfer', { reference: done.reference_number });
      return { errorMessage: `This transfer (Ref ${done.reference_number}) has already been approved and completed. No further action is needed.` };
    }
    console.log('[v0] swift-approval: no pending or settled transaction matched the token hash');
    return { errorMessage: INVALID_LINK_MSG };
  }

  // 24h auto-expiry. Comparison is Date-vs-Date in absolute time (the stored
  // value is an ISO-8601 UTC string), so timezones cannot skew it. A missing
  // or unparseable expiry is treated as "not expired" so a fresh, unused link
  // can never be rejected by a malformed timestamp.
  const expiresAt = txn.tags.approvalTokenExpiresAt ? new Date(txn.tags.approvalTokenExpiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt < new Date()) {
    console.log('[v0] swift-approval: token expired', { reference: txn.reference_number, expiresAt: expiresAt.toISOString(), now: new Date().toISOString() });
    return { errorMessage: INVALID_LINK_MSG };
  }
  console.log('[v0] swift-approval: token accepted', { reference: txn.reference_number, expiresAt: expiresAt ? expiresAt.toISOString() : null });
  return { txn };
}

/** Resolve the owning account + user for a SWIFT transaction. */
async function resolveOwner(txn) {
  const account = await Account.findByPk(txn.account_id);
  const user = account ? await User.findByPk(account.user_id) : null;
  return { account, user };
}

// ─── Public: review the pending transfer ─────────────────────────────────────
// GET /api/swift-approval/review?token=…
exports.review = async (req, res) => {
  try {
    const { txn, errorMessage } = await findPendingByToken(req.query.token);
    if (!txn) return error(res, errorMessage, 410);

    const { user } = await resolveOwner(txn);
    const tags = txn.tags || {};
    return success(res, {
      reference: txn.reference_number,
      amount: parseFloat(txn.amount),
      currency: 'USD',
      beneficiaryName: txn.to_account_name,
      beneficiaryAccount: maskAccount(txn.to_account_number),
      beneficiaryBank: txn.to_bank_name,
      swiftCode: tags.swiftCode || null,
      country: tags.countryName || tags.country || null,
      eta: tags.etaLabel || null,
      requestedAt: txn.createdAt || null,
      maskedEmail: maskEmail(user?.email),
      status: 'awaiting_approval',
    });
  } catch (err) {
    logger.error(`swift-approval review error: ${err.message}`);
    return error(res, 'Could not load this approval request. Please try again.');
  }
};

// ─── Public: send the approval OTP to the registered email ───────────────────
// POST /api/swift-approval/send-otp   Body: { token }
exports.sendOtp = async (req, res) => {
  try {
    const { txn, errorMessage } = await findPendingByToken(req.body.token);
    if (!txn) return error(res, errorMessage, 410);

    const { user } = await resolveOwner(txn);
    if (!user?.email) return error(res, 'No registered email found for this transfer.', 410);

    // Anti-OTP-bombing: per-email cooldown + hourly/daily caps.
    const gate = await checkOtpFlood(OTP, user.email, { purpose: 'transaction' });
    if (!gate.allowed) {
      return error(res, gate.message, 429);
    }

    const otp = generateOTP();
    await OTP.create({
      email: user.email,
      otp_hash: hashOTP(otp),
      purpose: 'transaction',
      expires_at: getOTPExpiry(5),
      ip_address: req.ip,
    });

    await sendOTPEmail(user.email, otp, `approving your SWIFT transfer (Ref ${txn.reference_number})`);

    createAuditLog({
      userId: user.id,
      action: 'SWIFT_APPROVAL_OTP_SENT',
      entityType: 'Transaction',
      entityId: txn.reference_number,
      ipAddress: req.ip,
      status: 'success',
      description: `Self-approval OTP emailed to ${maskEmail(user.email)}.`,
    }).catch(() => {});

    return success(res, { maskedEmail: maskEmail(user.email) },
      `A verification code has been sent to ${maskEmail(user.email)}. It expires in 5 minutes.`);
  } catch (err) {
    logger.error(`swift-approval send-otp error: ${err.message}`);
    return error(res, 'Could not send the verification code. Please try again.');
  }
};

// ─── Public: verify the OTP and settle the transfer instantly ────────────────
// POST /api/swift-approval/verify   Body: { token, otp }
exports.verify = async (req, res) => {
  try {
    const { txn, errorMessage } = await findPendingByToken(req.body.token);
    if (!txn) return error(res, errorMessage, 410);

    const otp = String(req.body.otp || '').trim();
    if (!/^\d{6}$/.test(otp)) return badRequest(res, 'Enter the 6-digit verification code.');

    const { user } = await resolveOwner(txn);
    if (!user?.email) return error(res, 'No registered email found for this transfer.', 410);

    const otpRecord = await OTP.findOne({
      where: {
        email: user.email,
        purpose: 'transaction',
        used: false,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [['created_at', 'DESC']],
    });
    if (!otpRecord) return badRequest(res, 'No valid code found. Please request a new one.');
    if (otpRecord.attempts >= 5) {
      await otpRecord.update({ used: true });
      return badRequest(res, 'Too many attempts. Please request a new code.');
    }
    if (otpRecord.otp_hash !== hashOTP(otp)) {
      await otpRecord.increment('attempts');
      return badRequest(res, 'Incorrect verification code.');
    }
    await otpRecord.update({ used: true });

    // Settle via the SAME helper the admin approval queue uses — completion
    // email + in-app notification + the post-approval SMS all fire from there.
    await settleSwiftTransfer(txn, { channel: 'email', ip: req.ip });

    return success(res, {
      reference: txn.reference_number,
      status: 'completed',
      // Optional one-time beneficiary confirmation email — the sender may
      // enter the beneficiary's email within this window (enforced server-side
      // in notifyBeneficiary; this just tells the UI to show the form).
      beneficiaryNotify: {
        available: true,
        expiresInSeconds: BENEFICIARY_NOTIFY_WINDOW_MS / 1000,
      },
    }, 'Transfer approved — your SWIFT transfer has been completed.');
  } catch (err) {
    logger.error(`swift-approval verify error: ${err.message}`);
    return error(res, 'Could not complete the approval. Please try again.');
  }
};

// ─── Public: one-time beneficiary confirmation email ─────────────────────────
// POST /api/swift-approval/notify-beneficiary   Body: { token, beneficiaryEmail }
//
// After the OTP approval settles the transfer, the sender gets ONE optional
// chance to email a confirmation (with the transfer details) to the
// beneficiary. Constraints enforced here, server-side:
//   - Single-use: tags.beneficiaryEmailSentAt is set atomically on first send.
//   - 5-minute window: only available within 5 minutes of settlement
//     (txn.processed_at) — after that the option silently expires.
//   - Token-gated: resolved via the SAME settled-token hash the "already
//     approved" lookup uses, so only the person holding the approval link
//     (who also passed the OTP) can trigger it.
const BENEFICIARY_NOTIFY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

exports.notifyBeneficiary = async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    if (!/^[a-f0-9]{32,128}$/i.test(token)) {
      return error(res, INVALID_LINK_MSG, 410);
    }

    const beneficiaryEmail = String(req.body.beneficiaryEmail || '').trim().toLowerCase();
    if (!EMAIL_REGEX.test(beneficiaryEmail) || beneficiaryEmail.length > 254) {
      return badRequest(res, 'Enter a valid beneficiary email address.');
    }

    // The transfer is already settled at this point, so look it up by the
    // "used" token hash (moved there by settleSwiftTransfer).
    const tokenHash = hashValue(token);
    const settled = await Transaction.findAll({
      where: { category: 'swift', status: 'success' },
      order: [['updated_at', 'DESC']],
      limit: 200,
    });
    const txn = settled.find((t) => t.tags && t.tags.approvalTokenUsedHash === tokenHash);
    if (!txn) return error(res, INVALID_LINK_MSG, 410);

    const tags = txn.tags || {};

    // One-time only.
    if (tags.beneficiaryEmailSentAt) {
      return error(res, 'A confirmation email has already been sent to the beneficiary for this transfer.', 410);
    }

    // 5-minute expiry from settlement.
    const settledAt = txn.processed_at ? new Date(txn.processed_at) : null;
    if (!settledAt || Number.isNaN(settledAt.getTime())
      || (Date.now() - settledAt.getTime()) > BENEFICIARY_NOTIFY_WINDOW_MS) {
      return error(res, 'The beneficiary notification window has expired. This option is only available for 5 minutes after the transfer is completed.', 410);
    }

    const { user } = await resolveOwner(txn);
    // Business Elite accounts are held in the COMPANY's name — the beneficiary
    // sees the registered business name, never the applicant's personal name.
    const senderName = displayName(user);

    // Mark as used BEFORE dispatching so a rapid double-submit can never
    // produce two beneficiary emails (send failures are logged, not retried
    // via this endpoint — it stays strictly one-shot).
    await txn.update({
      tags: {
        ...tags,
        beneficiaryEmailSentAt: new Date().toISOString(),
        beneficiaryEmailMasked: maskEmail(beneficiaryEmail),
      },
    });

    const result = await sendSwiftBeneficiaryEmail(beneficiaryEmail, {
      beneficiaryName: txn.to_account_name,
      beneficiaryAccount: txn.to_account_number,
      beneficiaryBank: txn.to_bank_name,
      senderName,
      amount: parseFloat(txn.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      reference: txn.reference_number,
      time: settledAt.toLocaleString('en-US'),
      eta: tags.etaLabel || null,
    });

    createAuditLog({
      userId: user?.id,
      action: 'SWIFT_BENEFICIARY_EMAIL_SENT',
      entityType: 'Transaction',
      entityId: txn.reference_number,
      ipAddress: req.ip,
      status: result.success ? 'success' : 'failed',
      description: `Beneficiary confirmation email ${result.success ? 'sent' : 'FAILED'} to ${maskEmail(beneficiaryEmail)} for SWIFT ${txn.reference_number}.`,
    }).catch(() => {});

    if (!result.success) {
      return error(res, 'The confirmation email could not be delivered. Please share the reference number with the beneficiary directly.');
    }

    return success(res, {
      reference: txn.reference_number,
      sentTo: maskEmail(beneficiaryEmail),
    }, `Confirmation email sent to ${maskEmail(beneficiaryEmail)}.`);
  } catch (err) {
    logger.error(`swift-approval notify-beneficiary error: ${err.message}`);
    return error(res, 'Could not send the beneficiary confirmation. Please try again.');
  }
};
