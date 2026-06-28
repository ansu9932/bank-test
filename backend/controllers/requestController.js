const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const { CardRequest, User, Account, Transaction, Notification } = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');
const {
  sendServiceRequestEmail,
  sendCardIssuedEmail,
  sendCardRejectedEmail,
  sendCheckbookRejectedEmail,
  sendCardControlAlertEmail,
} = require('../services/emailService');
const {
  generateReferenceNumber,
  generateCardNumber,
  generateCVV,
  generateCardExpiry,
  maskCardNumber,
  isLuhnValid,
} = require('../utils/helpers');
const { success, created, error, badRequest, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · PREMIUM DEBIT CARD & CHEQUE BOOK PIPELINE
   - Debit-card requests carry a network (Visa/Mastercard) + tier (Gold/
     Platinum/Business). An upfront issuance fee is debited atomically at
     submission (balance-gated). On admin approval a Luhn-valid 16-digit card
     number is generated and the card goes 'active'; on rejection the fee is
     refunded. Cheque-book requests are free. Card controls are PIN-gated.
   ────────────────────────────────────────────────────────────────────────── */

const TYPE_DEBIT_CARD = 'debit_card';
const TYPE_CHEQUE_BOOK = 'cheque_book';
// Open statuses that block a duplicate submission OR represent a live card.
const ACTIVE_STATUSES = ['pending', 'processing', 'active'];

const LABELS = { [TYPE_DEBIT_CARD]: 'Debit Card', [TYPE_CHEQUE_BOOK]: 'Cheque Book' };

// Tier catalogue: issuance fee + headline benefit (kept server-authoritative so
// the client can never spoof a cheaper fee).
const TIERS = {
  Gold:     { fee: 500,  benefit: 'Standard cashback privileges' },
  Platinum: { fee: 1000, benefit: 'Airport lounge access + enhanced transfer limits' },
  Business: { fee: 2500, benefit: 'Zero cross-border markup + premium accounting tools' },
};
const NETWORKS = ['Visa', 'Mastercard'];

const DEFAULT_CONTROLS = {
  frozen: false,
  atm_enabled: true,
  domestic_enabled: true,
  international_enabled: false,
  domestic_limit: 100000,
  international_limit: 0,
};

const fmtINR = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// ─── Cheque Book request (free) ───────────────────────────────────────────────
// POST /api/requests/checkbook   (protect + requireActiveAccount)
exports.requestCheckbook = async (req, res) => {
  try {
    const existing = await CardRequest.findOne({
      where: { user_id: req.user.id, request_type: TYPE_CHEQUE_BOOK, status: { [Op.in]: ['pending', 'processing'] } },
    });
    if (existing) {
      return badRequest(res, `You already have a Cheque Book request in progress (status: ${existing.status}).`);
    }

    const cardReq = await CardRequest.create({
      user_id: req.user.id,
      request_type: TYPE_CHEQUE_BOOK,
      status: 'pending',
      delivery_address: req.body.deliveryAddress || req.user.address_line1 || null,
    });

    await Notification.create({
      user_id: req.user.id,
      title: 'Cheque Book Request Received',
      message: `Your Cheque Book request is under review. Reference: ${cardReq.id}.`,
      type: 'system',
      priority: 'medium',
    }).catch((e) => logger.error(`Checkbook notification failed: ${e.message}`));

    sendServiceRequestEmail(req.user.email, req.user.first_name || 'Customer', {
      serviceLabel: 'Cheque Book', requestId: cardReq.id, createdAt: cardReq.createdAt,
    }).catch((e) => logger.error(`Checkbook email failed: ${e.message}`));

    createAuditLog({
      userId: req.user.id, action: 'SERVICE_REQUEST_CREATED', entityType: 'CardRequest',
      entityId: cardReq.id, ipAddress: req.ip, status: 'success',
      description: 'Cheque Book request submitted.',
    }).catch(() => {});

    return created(res, { requestId: cardReq.id, requestType: TYPE_CHEQUE_BOOK, status: cardReq.status },
      "Cheque Book request received. We'll email you once it's processed.");
  } catch (err) {
    logger.error(`requestCheckbook error: ${err.message}`);
    return error(res, 'Could not submit your request. Please try again.');
  }
};

// ─── Premium Debit Card request (issuance-fee gated) ──────────────────────────
// POST /api/requests/debit-card   (protect + requireActiveAccount)
// Body: { network: 'Visa'|'Mastercard', tier: 'Gold'|'Platinum'|'Business' }
exports.requestDebitCard = async (req, res) => {
  try {
    const network = String(req.body.network || '').trim();
    const tier = String(req.body.tier || '').trim();

    // ── Validate network + tier against the server-authoritative catalogue ──
    if (!NETWORKS.includes(network)) {
      return badRequest(res, 'Select a valid card network: Visa or Mastercard.');
    }
    const tierSpec = TIERS[tier];
    if (!tierSpec) {
      return badRequest(res, 'Select a valid card tier: Gold, Platinum, or Business.');
    }
    const fee = tierSpec.fee;

    // ── Duplicate gate: one open/active debit card per user ─────────────────
    const existing = await CardRequest.findOne({
      where: { user_id: req.user.id, request_type: TYPE_DEBIT_CARD, status: { [Op.in]: ACTIVE_STATUSES } },
    });
    if (existing) {
      return badRequest(res, `You already have a ${existing.status === 'active' ? 'active' : 'pending'} debit card. Only one card is allowed at a time.`);
    }

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');
    if (account.status === 'frozen') {
      return error(res, 'Your account is frozen. Please contact support.', 403);
    }

    // ── Balance gate ────────────────────────────────────────────────────────
    if (parseFloat(account.available_balance) < fee) {
      return badRequest(res, `Insufficient balance for the ${tier} card issuance fee of ${fmtINR(fee)}. Available: ${fmtINR(account.available_balance)}.`);
    }

    const feeReference = generateReferenceNumber('CARDFEE');

    // ── Atomic: debit fee + create the pending card application together ─────
    let cardReqId;
    const t = await sequelize.transaction();
    try {
      const locked = await Account.findOne({ where: { id: account.id }, transaction: t, lock: t.LOCK.UPDATE });
      const balanceBefore = parseFloat(locked.balance);
      const balanceAfter = balanceBefore - fee;
      if (balanceAfter < 0) throw new Error('Insufficient balance');

      await locked.update({
        balance: balanceAfter,
        available_balance: parseFloat(locked.available_balance) - fee,
      }, { transaction: t });

      await Transaction.create({
        account_id: locked.id,
        reference_number: feeReference,
        transaction_type: 'debit',
        transfer_mode: 'CHARGE',
        amount: fee,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `${tier} ${network} debit card issuance fee`,
        narration: `CARD ISSUANCE FEE · ${tier}`,
        category: 'card_fee',
        status: 'success',
        processed_at: new Date(),
        ip_address: req.ip,
        tags: { kind: 'card_issuance_fee', tier, network },
      }, { transaction: t });

      const cardReq = await CardRequest.create({
        user_id: req.user.id,
        request_type: TYPE_DEBIT_CARD,
        status: 'pending',
        card_network: network,
        card_tier: tier,
        controls: { ...DEFAULT_CONTROLS },
        issuance_fee: fee,
        fee_status: 'charged',
        fee_reference: feeReference,
        delivery_address: req.body.deliveryAddress || req.user.address_line1 || null,
      }, { transaction: t });

      cardReqId = cardReq.id;
      await t.commit();
    } catch (txErr) {
      await t.rollback();
      logger.error(`Debit-card fee debit failed (${feeReference}): ${txErr.message}`);
      return error(res, 'Could not process the issuance fee. Please try again.');
    }

    await Notification.create({
      user_id: req.user.id,
      title: `${tier} Debit Card Application Received`,
      message: `Your ${tier} ${network} card application is under review. An issuance fee of ${fmtINR(fee)} has been debited. Reference: ${cardReqId}.`,
      type: 'system',
      priority: 'medium',
    }).catch((e) => logger.error(`Card notification failed: ${e.message}`));

    sendServiceRequestEmail(req.user.email, req.user.first_name || 'Customer', {
      serviceLabel: `${tier} ${network} Debit Card`, requestId: cardReqId, createdAt: new Date(),
    }).catch((e) => logger.error(`Card request email failed: ${e.message}`));

    createAuditLog({
      userId: req.user.id, action: 'CARD_REQUEST_CREATED', entityType: 'CardRequest',
      entityId: cardReqId, ipAddress: req.ip, status: 'success',
      description: `${tier} ${network} debit card requested; ${fmtINR(fee)} issuance fee charged (${feeReference}).`,
    }).catch(() => {});

    return created(res, {
      requestId: cardReqId, requestType: TYPE_DEBIT_CARD, status: 'pending',
      network, tier, issuanceFee: fee, feeReference,
    }, `${tier} ${network} card application received. ${fmtINR(fee)} issuance fee charged.`);
  } catch (err) {
    logger.error(`requestDebitCard error: ${err.message}`);
    return error(res, 'Could not submit your card request. Please try again.');
  }
};

// ─── My card (active card + controls) ─────────────────────────────────────────
// GET /api/requests/my-card   (protect)
exports.getMyCard = async (req, res) => {
  try {
    // Most recent non-cancelled debit-card application.
    const card = await CardRequest.findOne({
      where: { user_id: req.user.id, request_type: TYPE_DEBIT_CARD, status: { [Op.ne]: 'cancelled' } },
      order: [['createdAt', 'DESC']],
    });
    if (!card) return success(res, { card: null });

    return success(res, {
      card: {
        id: card.id,
        status: card.status,
        network: card.card_network,
        tier: card.card_tier,
        // Never expose the full PAN/CVV/expiry here; mask the number and hide
        // CVV + expiry entirely. The full details are only served by the
        // PIN-gated POST /card/:id/reveal endpoint.
        maskedNumber: card.card_number ? maskCardNumber(card.card_number) : null,
        controls: card.controls || DEFAULT_CONTROLS,
        issuanceFee: parseFloat(card.issuance_fee || 0),
        createdAt: card.createdAt,
      },
    });
  } catch (err) {
    logger.error(`getMyCard error: ${err.message}`);
    return error(res, 'Could not fetch your card.');
  }
};

// ─── My requests list ─────────────────────────────────────────────────────────
// GET /api/requests/mine   (protect)
exports.getMyRequests = async (req, res) => {
  try {
    const requests = await CardRequest.findAll({
      where: { user_id: req.user.id }, order: [['createdAt', 'DESC']], limit: 50,
    });
    return success(res, { requests, count: requests.length });
  } catch (err) {
    logger.error(`getMyRequests error: ${err.message}`);
    return error(res, 'Could not fetch your requests.');
  }
};

// ─── Update card controls (PIN-gated) ─────────────────────────────────────────
// PATCH /api/requests/card/:id/controls   (protect)
// Body: { securityPin, controls: { frozen?, atm_enabled?, domestic_enabled?,
//         international_enabled?, domestic_limit?, international_limit? } }
const CONTROL_LABELS = {
  frozen: 'Card freeze',
  atm_enabled: 'ATM withdrawals',
  domestic_enabled: 'Domestic usage',
  international_enabled: 'International usage',
  domestic_limit: 'Domestic limit',
  international_limit: 'International limit',
};

exports.updateCardControls = async (req, res) => {
  try {
    const { securityPin, controls } = req.body;

    if (!securityPin || String(securityPin).length < 4) {
      return badRequest(res, 'Enter your 4-digit transaction security PIN.');
    }
    if (!controls || typeof controls !== 'object' || Array.isArray(controls)) {
      return badRequest(res, 'No card controls provided.');
    }

    const card = await CardRequest.findOne({
      where: { id: req.params.id, user_id: req.user.id, request_type: TYPE_DEBIT_CARD },
    });
    if (!card) return notFound(res, 'Card not found.');
    if (card.status !== 'active') {
      return badRequest(res, 'Controls can only be changed on an active card.');
    }

    // ── Security PIN verification (same hash used for money transfers) ──────
    const user = await User.findByPk(req.user.id);
    if (!user?.security_pin) return badRequest(res, 'No security PIN set. Please contact support.');
    const pinValid = await bcrypt.compare(String(securityPin), user.security_pin);
    if (!pinValid) return badRequest(res, 'Incorrect security PIN.');

    // ── Merge only the known, type-checked control keys ─────────────────────
    const current = { ...DEFAULT_CONTROLS, ...(card.controls || {}) };
    const next = { ...current };
    const changed = [];

    const boolKeys = ['frozen', 'atm_enabled', 'domestic_enabled', 'international_enabled'];
    boolKeys.forEach((k) => {
      if (controls[k] !== undefined) {
        // Coerce truthy/"true"/1 → boolean so the frontend can't trip on type.
        const v = controls[k] === true || controls[k] === 'true' || controls[k] === 1;
        if (v !== current[k]) {
          next[k] = v;
          changed.push({ key: k, value: v });
        }
      }
    });
    const numKeys = ['domestic_limit', 'international_limit'];
    numKeys.forEach((k) => {
      if (controls[k] !== undefined) {
        const v = parseFloat(controls[k]);
        if (!Number.isNaN(v) && v >= 0 && v !== Number(current[k])) {
          next[k] = v;
          changed.push({ key: k, value: v });
        }
      }
    });

    // No effective diff (e.g. the stored value already matches the requested
    // state). The PIN was valid, so this is a successful no-op rather than an
    // error — persist the normalized controls and return 200 so the toggle UI
    // never shows a spurious "400 / No changes" after a correct PIN entry.
    if (changed.length === 0) {
      await card.update({ controls: next });
      return success(res, { controls: next, changes: [] }, 'No changes were needed — card settings are already up to date.');
    }

    await card.update({ controls: next });

    // ── Per-change alert email + notification (fraud-prevention) ────────────
    const summary = changed.map(({ key, value }) => {
      const label = CONTROL_LABELS[key] || key;
      if (key.endsWith('_limit')) return `${label} set to ${fmtINR(value)}`;
      if (key === 'frozen') return value ? 'Card frozen' : 'Card unfrozen';
      return `${label} ${value ? 'enabled' : 'disabled'}`;
    });

    await Notification.create({
      user_id: req.user.id,
      title: 'Card Controls Updated',
      message: summary.join('; ') + '.',
      type: 'security',
      priority: 'high',
    }).catch((e) => logger.error(`Control notification failed: ${e.message}`));

    sendCardControlAlertEmail(user.email, user.first_name || 'Customer', {
      tier: card.card_tier,
      maskedNumber: card.card_number ? maskCardNumber(card.card_number) : null,
      changes: summary,
      time: new Date().toLocaleString('en-US'),
    }).catch((e) => logger.error(`Control alert email failed: ${e.message}`));

    createAuditLog({
      userId: req.user.id, action: 'CARD_CONTROLS_UPDATED', entityType: 'CardRequest',
      entityId: card.id, ipAddress: req.ip, status: 'success',
      newValues: next, description: `Card controls updated: ${summary.join('; ')}.`,
    }).catch(() => {});

    return success(res, { controls: next, changes: summary }, 'Card controls updated successfully.');
  } catch (err) {
    logger.error(`updateCardControls error: ${err.message}`);
    return error(res, 'Could not update card controls. Please try again.');
  }
};

// ─── Secure card reveal (PIN-gated) ───────────────────────────────────────────
// POST /api/requests/card/:id/reveal   (protect)
// Body: { securityPin }
// Returns the FULL PAN + CVV + expiry for a brief client-side reveal. The data
// is read from disk only after a valid PIN; nothing is mutated and the values
// are never logged. The client is responsible for the auto-hide timer.
exports.revealCard = async (req, res) => {
  try {
    const { securityPin } = req.body;
    if (!securityPin || String(securityPin).length < 4) {
      return badRequest(res, 'Enter your 4-digit transaction security PIN.');
    }

    const card = await CardRequest.findOne({
      where: { id: req.params.id, user_id: req.user.id, request_type: TYPE_DEBIT_CARD },
    });
    if (!card) return notFound(res, 'Card not found.');
    if (card.status !== 'active' || !card.card_number) {
      return badRequest(res, 'Card details are only available once your card is active.');
    }

    // Security PIN verification (same hash as money transfers).
    const user = await User.findByPk(req.user.id);
    if (!user?.security_pin) return badRequest(res, 'No security PIN set. Please contact support.');
    const pinValid = await bcrypt.compare(String(securityPin), user.security_pin);
    if (!pinValid) return badRequest(res, 'Incorrect security PIN.');

    createAuditLog({
      userId: req.user.id, action: 'CARD_DETAILS_REVEALED', entityType: 'CardRequest',
      entityId: card.id, ipAddress: req.ip, status: 'success',
      description: 'Full card details revealed after PIN verification.',
    }).catch(() => {});

    // Format the PAN in groups of 4 for display.
    const grouped = String(card.card_number).replace(/(.{4})/g, '$1 ').trim();
    return success(res, {
      number: card.card_number,
      formattedNumber: grouped,
      cvv: card.cvv || null,
      expiry: card.expiry_date || null,
      network: card.card_network,
      tier: card.card_tier,
    }, 'Card details revealed.');
  } catch (err) {
    logger.error(`revealCard error: ${err.message}`);
    return error(res, 'Could not reveal card details. Please try again.');
  }
};

// ─── Admin: list service requests ─────────────────────────────────────────────
// GET /api/admin/service-requests?status=&type=   (adminProtect)
exports.adminListRequests = async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.type) where.request_type = req.query.type;

    const requests = await CardRequest.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'customer_id'] }],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    return success(res, { requests, count: requests.length });
  } catch (err) {
    logger.error(`adminListRequests error: ${err.message}`);
    return error(res, 'Failed to fetch service requests.');
  }
};

// ─── Admin: process a request (approve / decline / process) ───────────────────
// PATCH /api/admin/service-requests/:id   Body: { action, notes? }
//   (adminProtect + requireRole)
exports.adminProcessRequest = async (req, res) => {
  try {
    const { action, notes } = req.body;
    if (!['approve', 'decline', 'process'].includes(action)) {
      return badRequest(res, "action must be one of 'approve', 'decline', or 'process'.");
    }

    const request = await CardRequest.findByPk(req.params.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'email'] }],
    });
    if (!request) return notFound(res, 'Service request not found.');

    const previousStatus = request.status;
    const isCard = request.request_type === TYPE_DEBIT_CARD;
    const serviceLabel = LABELS[request.request_type] || 'Service';
    const recipientEmail = request.user?.email;
    const recipientName = request.user?.first_name || 'Customer';

    // ── 'process' → mark in-progress (no side effects) ──────────────────────
    if (action === 'process') {
      await request.update({ status: 'processing', notes: notes || request.notes });
      await notifyUser(request.user_id, `${serviceLabel} Request Update`, `Your ${serviceLabel} request is now being processed.`);
      auditProcess(req, request, previousStatus, 'processing', action);
      return success(res, { requestId: request.id, status: 'processing' }, 'Request marked as processing.');
    }

    // ── APPROVE ─────────────────────────────────────────────────────────────
    if (action === 'approve') {
      if (isCard) {
        // Generate a Luhn-valid 16-digit number for the chosen network.
        const network = request.card_network || 'Visa';
        let cardNumber = generateCardNumber(network);
        // Defensive: regenerate on the astronomically-unlikely chance of an
        // invalid number (keeps the guarantee absolute).
        if (!isLuhnValid(cardNumber)) cardNumber = generateCardNumber(network);
        const cvv = generateCVV();
        const expiry = generateCardExpiry(5);

        await request.update({
          status: 'active',
          card_number: cardNumber,
          cvv,
          expiry_date: expiry,
          notes: notes || request.notes,
        });

        // Reflect issuance on the account profile (best-effort).
        const acct = await Account.findOne({ where: { user_id: request.user_id } });
        if (acct) {
          await acct.update({ card_issued: true, card_number_masked: maskCardNumber(cardNumber) }).catch(() => {});
        }

        await notifyUser(request.user_id, 'Debit Card Issued',
          `Your ${request.card_tier || ''} ${network} card has been issued and is now active.`);

        if (recipientEmail) {
          sendCardIssuedEmail(recipientEmail, recipientName, {
            tier: request.card_tier, network, maskedNumber: maskCardNumber(cardNumber), expiry,
          }).catch((e) => logger.error(`Card issued email failed: ${e.message}`));
        }

        auditProcess(req, request, previousStatus, 'active', action);
        return success(res, { requestId: request.id, status: 'active', maskedNumber: maskCardNumber(cardNumber) },
          'Card approved and issued.');
      }

      // Cheque book approval → dispatched.
      await request.update({ status: 'dispatched', notes: notes || request.notes });
      await notifyUser(request.user_id, 'Cheque Book Approved',
        'Your Cheque Book request has been approved and is being dispatched.');
      if (recipientEmail) {
        sendServiceRequestEmail(recipientEmail, recipientName, {
          serviceLabel: 'Cheque Book (Approved)', requestId: request.id, createdAt: request.createdAt,
        }).catch(() => {});
      }
      auditProcess(req, request, previousStatus, 'dispatched', action);
      return success(res, { requestId: request.id, status: 'dispatched' }, 'Cheque Book approved.');
    }

    // ── DECLINE ─────────────────────────────────────────────────────────────
    // For a card: refund the issuance fee atomically, then notify.
    let refundInfo = null;
    if (isCard && request.fee_status === 'charged' && parseFloat(request.issuance_fee) > 0) {
      refundInfo = await refundCardFee(request, req.ip);
    }

    await request.update({ status: 'cancelled', notes: notes || request.notes });

    if (isCard) {
      await notifyUser(request.user_id, 'Debit Card Application Declined',
        `Your ${request.card_tier || ''} card application was declined.${refundInfo ? ` ${fmtINR(refundInfo.amount)} issuance fee refunded.` : ''}`);
      if (recipientEmail) {
        sendCardRejectedEmail(recipientEmail, recipientName, {
          tier: request.card_tier,
          reason: notes || 'Your application did not meet the current issuance criteria.',
          refundAmount: refundInfo ? refundInfo.amount : 0,
        }).catch((e) => logger.error(`Card rejected email failed: ${e.message}`));
      }
    } else {
      // Cheque-book rejection → specific signature-records reason email.
      await notifyUser(request.user_id, 'Cheque Book Request Declined',
        'Signature not updated in system records. Please update your signature to re-apply.');
      if (recipientEmail) {
        sendCheckbookRejectedEmail(recipientEmail, recipientName).catch((e) => logger.error(`Checkbook rejected email failed: ${e.message}`));
      }
    }

    auditProcess(req, request, previousStatus, 'cancelled', action, refundInfo);
    return success(res, {
      requestId: request.id, status: 'cancelled',
      refunded: refundInfo ? refundInfo.amount : 0,
    }, isCard ? 'Card application declined.' : 'Cheque Book request declined.');
  } catch (err) {
    logger.error(`adminProcessRequest error: ${err.message}`);
    return error(res, 'Failed to update the service request.');
  }
};

// ─── Admin: delete a user's card ──────────────────────────────────────────────
// DELETE /api/admin/user/:userId/card/:cardId   (adminProtect + requireRole)
// Permanently removes a card request/record. If an active card is deleted, the
// account's card flags are cleared so the user's dashboard reflects "no card".
exports.adminDeleteUserCard = async (req, res) => {
  try {
    const { userId, cardId } = req.params;

    const card = await CardRequest.findOne({
      where: { id: cardId, user_id: userId },
    });
    if (!card) return notFound(res, 'Card not found for this user.');

    const wasActive = card.status === 'active';
    const snapshot = {
      status: card.status,
      network: card.card_network,
      tier: card.card_tier,
      maskedNumber: card.card_number ? maskCardNumber(card.card_number) : null,
    };

    await card.destroy();

    // Clear the account's card flags if we removed the live card.
    if (wasActive) {
      const acct = await Account.findOne({ where: { user_id: userId } });
      if (acct) {
        await acct.update({ card_issued: false, card_number_masked: null }).catch(() => {});
      }
      await notifyUser(userId, 'Debit Card Removed',
        'Your debit card has been removed by Alister Bank. Please contact support if you did not expect this.');
    }

    createAuditLog({
      adminId: req.admin?.id,
      userId,
      action: 'ADMIN_CARD_DELETED',
      entityType: 'CardRequest',
      entityId: cardId,
      oldValues: snapshot,
      ipAddress: req.ip,
      status: 'success',
      description: `Admin permanently deleted ${snapshot.tier || ''} ${snapshot.network || ''} card (was ${snapshot.status}).`,
    }).catch(() => {});

    return success(res, { cardId, deleted: true }, 'Card deleted successfully.');
  } catch (err) {
    logger.error(`adminDeleteUserCard error: ${err.message}`);
    return error(res, 'Failed to delete the card.');
  }
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Atomically credit the issuance fee back to the user's account. */
async function refundCardFee(request, ip) {
  const account = await Account.findOne({ where: { user_id: request.user_id } });
  if (!account) {
    logger.error(`Refund skipped — no account for user ${request.user_id} (card ${request.id}).`);
    return null;
  }
  const fee = parseFloat(request.issuance_fee);
  const refundRef = generateReferenceNumber('CARDRFND');
  const t = await sequelize.transaction();
  try {
    const locked = await Account.findOne({ where: { id: account.id }, transaction: t, lock: t.LOCK.UPDATE });
    const before = parseFloat(locked.balance);
    const after = before + fee;
    await locked.update({
      balance: after,
      available_balance: parseFloat(locked.available_balance) + fee,
    }, { transaction: t });

    await Transaction.create({
      account_id: locked.id,
      reference_number: refundRef,
      transaction_type: 'credit',
      transfer_mode: 'REVERSAL',
      amount: fee,
      balance_before: before,
      balance_after: after,
      description: `Refund — ${request.card_tier || ''} card issuance fee`,
      narration: `CARD FEE REFUND · ${request.fee_reference || ''}`,
      category: 'card_fee_refund',
      status: 'success',
      processed_at: new Date(),
      ip_address: ip,
      tags: { kind: 'card_issuance_fee_refund', originalFeeRef: request.fee_reference },
    }, { transaction: t });

    await request.update({ fee_status: 'refunded' }, { transaction: t });
    await t.commit();
    logger.info(`Card fee refunded: ${refundRef} ($${fee}) for card ${request.id}.`);
    return { amount: fee, reference: refundRef };
  } catch (e) {
    await t.rollback();
    logger.error(`Card fee refund failed (card ${request.id}): ${e.message}`);
    return null;
  }
}

/** Best-effort in-app notification. */
async function notifyUser(userId, title, message) {
  if (!userId) return;
  await Notification.create({ user_id: userId, title, message, type: 'system', priority: 'medium' })
    .catch((e) => logger.error(`notifyUser failed: ${e.message}`));
}

/** Shared audit-log writer for admin processing actions. */
function auditProcess(req, request, fromStatus, toStatus, action, refundInfo) {
  createAuditLog({
    adminId: req.admin?.id,
    userId: request.user_id,
    action: 'SERVICE_REQUEST_PROCESSED',
    entityType: 'CardRequest',
    entityId: request.id,
    oldValues: { status: fromStatus },
    newValues: { status: toStatus, ...(refundInfo ? { refunded: refundInfo.amount } : {}) },
    ipAddress: req.ip,
    status: 'success',
    description: `${request.request_type} ${action} → ${toStatus}.`,
  }).catch(() => {});
}
