const { Op } = require('sequelize');
const { Account, Transaction, User, OTP } = require('../models');
const { settleSwiftTransfer } = require('./payoutController');
const { hashValue, hashOTP, generateOTP, getOTPExpiry } = require('../utils/helpers');
const { sendOTPEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest } = require('../utils/apiResponse');
const logger = require('../utils/logger');

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
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return { errorMessage: INVALID_LINK_MSG };

  const tokenHash = hashValue(token);
  // The pending SWIFT queue is small (same bound the admin list uses).
  const candidates = await Transaction.findAll({
    where: { category: 'swift', status: 'processing' },
    limit: 200,
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
      return { errorMessage: `This transfer (Ref ${done.reference_number}) has already been approved and completed. No further action is needed.` };
    }
    return { errorMessage: INVALID_LINK_MSG };
  }

  const expiresAt = txn.tags.approvalTokenExpiresAt ? new Date(txn.tags.approvalTokenExpiresAt) : null;
  if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt < new Date()) {
    return { errorMessage: INVALID_LINK_MSG };
  }
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
    }, 'Transfer approved — your SWIFT transfer has been completed.');
  } catch (err) {
    logger.error(`swift-approval verify error: ${err.message}`);
    return error(res, 'Could not complete the approval. Please try again.');
  }
};
