const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Account, Transaction, Beneficiary, User, Notification, OTP } = require('../models');
const { generateReferenceNumber, maskAccountNumber, formatCurrency, paginate, generateOTP, hashOTP, getOTPExpiry } = require('../utils/helpers');
const { isMethodEnabled, methodBlockedMessage } = require('../utils/transferMethods');
const { sendTransferAlertEmail, sendOTPEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound, forbidden } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { checkOtpFlood } = require('../utils/otpGuard');
const moment = require('moment');

// ─── Get Transactions ─────────────────────────────────────────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, mode, startDate, endDate, search, status } = req.query;
    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    const where = { account_id: account.id };
    if (type) where.transaction_type = type;
    if (mode) where.transfer_mode = mode;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.created_at = { [Op.between]: [new Date(startDate), new Date(endDate + 'T23:59:59')] };
    }
    if (search) {
      where[Op.or] = [
        { reference_number: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { to_account_name: { [Op.like]: `%${search}%` } },
        { narration: { [Op.like]: `%${search}%` } },
      ];
    }

    const { limit: lim, offset } = paginate(page, limit);
    const { count, rows } = await Transaction.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: lim,
      offset,
    });

    return success(res, {
      transactions: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: lim,
        totalPages: Math.ceil(count / lim),
      },
    });
  } catch (err) {
    logger.error(`Get transactions error: ${err.message}`);
    return error(res, 'Failed to fetch transactions.');
  }
};

// ─── Large-transfer OTP threshold ─────────────────────────────────────────────
// Transfers at or above this amount require a fresh email OTP in addition to
// the security PIN. Tunable via env without a deploy.
const LARGE_TRANSFER_OTP_THRESHOLD = parseFloat(process.env.TRANSFER_OTP_THRESHOLD || '10000');

// ─── Initiate Transfer ────────────────────────────────────────────────────────
exports.initiateTransfer = async (req, res) => {
  try {
    const {
      toAccountNumber, toAccountName, toBankName, toIfsc,
      amount, transferMode, description, securityPin, scheduledAt,
      idempotencyKey, otp,
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) return badRequest(res, 'Invalid transfer amount.');
    if (!toAccountNumber || !transferMode) return badRequest(res, 'Account number and transfer mode are required.');

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');
    if (account.status === 'frozen') return forbidden(res, 'Your account is frozen. Contact support.');

    // ── IDEMPOTENCY ──────────────────────────────────────────────────────────
    // If this exact key was already processed for THIS account, return the
    // original result instead of executing a duplicate debit (covers native
    // app retries after network drops). Scoped per-account so one user's key
    // can never collide with another's.
    const cleanIdemKey = typeof idempotencyKey === 'string' && idempotencyKey.length <= 100
      ? idempotencyKey : null;
    if (cleanIdemKey) {
      const existing = await Transaction.findOne({
        where: { account_id: account.id, idempotency_key: cleanIdemKey },
      });
      if (existing) {
        return success(res, {
          referenceNumber: existing.reference_number,
          transactionId: existing.id,
          balanceAfter: parseFloat(existing.balance_after),
          status: existing.status,
          duplicate: true,
        }, 'Transfer already processed (idempotent replay).');
      }
    }

    // Verify PIN
    const user = await User.findByPk(req.user.id);
    const isPinValid = await bcrypt.compare(String(securityPin), user.security_pin);
    if (!isPinValid) return badRequest(res, 'Incorrect security PIN.');

    // ── LARGE-TRANSFER OTP (server-enforced; never trust the client) ─────────
    // At/above the threshold a fresh 'transaction' email OTP is REQUIRED. The
    // client can request one via POST /transactions/transfer-otp. Missing OTP
    // returns otpRequired:true so the app knows to start the OTP step.
    if (parsedAmount >= LARGE_TRANSFER_OTP_THRESHOLD && !scheduledAt) {
      if (!otp) {
        return res.status(428).json({
          success: false,
          otpRequired: true,
          threshold: LARGE_TRANSFER_OTP_THRESHOLD,
          message: `Transfers of $${LARGE_TRANSFER_OTP_THRESHOLD.toLocaleString()} or more require email OTP verification.`,
        });
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
      if (!otpRecord) return badRequest(res, 'No valid OTP found. Please request a new one.');
      if (otpRecord.attempts >= 5) {
        await otpRecord.update({ used: true });
        return badRequest(res, 'Too many OTP attempts. Please request a new one.');
      }
      if (otpRecord.otp_hash !== hashOTP(String(otp))) {
        await otpRecord.increment('attempts');
        return badRequest(res, 'Incorrect OTP.');
      }
      await otpRecord.update({ used: true });
    }

    // RTGS minimum check
    if (transferMode === 'RTGS' && parsedAmount < 200000)
      return badRequest(res, 'RTGS minimum transfer amount is $200,000.');

    // Check sufficient balance
    if (parseFloat(account.available_balance) < parsedAmount)
      return badRequest(res, 'Insufficient balance.');

    // Daily limit check
    resetDailyLimitIfNeeded(account);
    const dailyUsed = parseFloat(account.daily_transferred || 0);
    const dailyLimit = parseFloat(account.daily_transfer_limit);
    if (dailyUsed + parsedAmount > dailyLimit)
      return badRequest(res, `Daily transfer limit of $${dailyLimit.toLocaleString()} exceeded.`);

    // Internal vs external transfer
    const isInternal = await Account.findOne({ where: { account_number: toAccountNumber } });
    const effectiveMode = isInternal ? 'INTERNAL' : transferMode;

    // ── Per-user transfer-method lock ─────────────────────────────────────────
    // External IMPS / NEFT / UPI are disabled by default; internal stays on.
    // Unmanaged rails (e.g. RTGS) are left to the existing validation above.
    if (!isMethodEnabled(account, effectiveMode)) {
      return forbidden(res, methodBlockedMessage(effectiveMode));
    }

    const referenceNumber = generateReferenceNumber(effectiveMode);

    // Handle scheduled transfer
    if (scheduledAt && new Date(scheduledAt) > new Date()) {
      const { TransferRequest } = require('../models');
      const txReq = await TransferRequest.create({
        from_account_id: account.id,
        to_account_number: toAccountNumber,
        to_account_name: toAccountName,
        to_bank_name: toBankName || 'Alister Bank',
        to_ifsc: toIfsc,
        amount: parsedAmount,
        transfer_mode: effectiveMode,
        description,
        scheduled_at: new Date(scheduledAt),
        reference_number: referenceNumber,
        pin_verified: true,
      });
      return success(res, { referenceNumber, requestId: txReq.id }, 'Transfer scheduled successfully.');
    }

    // Execute immediately
    const result = await executeTransfer({
      fromAccount: account,
      toAccountNumber,
      toAccountName: toAccountName || (isInternal?.user?.first_name || 'Unknown'),
      toBankName: toBankName || (isInternal ? 'Alister Bank' : ''),
      toIfsc,
      amount: parsedAmount,
      mode: effectiveMode,
      description: description || `Transfer to ${toAccountNumber}`,
      referenceNumber,
      userId: req.user.id,
      ip: req.ip,
      idempotencyKey: cleanIdemKey,
    });

    if (!result.success) return badRequest(res, result.message);

    // Notify
    sendTransferAlertEmail(user.email, user.first_name, {
      type: 'debit',
      amount: parsedAmount.toFixed(2),
      reference: referenceNumber,
      counterparty: toAccountName || toAccountNumber,
      mode: effectiveMode,
      balance: result.balanceAfter,
      time: new Date().toLocaleString(),
    }).catch(() => {});

    await createAuditLog({
      userId: req.user.id,
      action: 'TRANSFER_INITIATED',
      entityType: 'Transaction',
      entityId: referenceNumber,
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {
      referenceNumber,
      transactionId: result.transactionId,
      balanceAfter: result.balanceAfter,
      status: 'success',
    }, 'Transfer completed successfully.');
  } catch (err) {
    logger.error(`Transfer error: ${err.message}`);
    return error(res, 'Transfer failed. Please try again.');
  }
};

// ─── Request Transfer OTP (large transfers) ───────────────────────────────────
// POST /api/transactions/transfer-otp — emails a fresh 5-minute 'transaction'
// OTP to the authenticated user. Route is rate-limited (otpLimiter); prior
// unused transaction OTPs are invalidated so only the newest code works.
exports.requestTransferOTP = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return notFound(res, 'User not found.');

    // Anti-OTP-bombing: per-email cooldown + hourly/daily caps.
    const gate = await checkOtpFlood(OTP, user.email, { purpose: 'transaction' });
    if (!gate.allowed) {
      return error(res, gate.message, 429);
    }

    await OTP.update(
      { used: true },
      { where: { email: user.email, purpose: 'transaction', used: false } }
    );

    const code = generateOTP();
    await OTP.create({
      email: user.email,
      otp_hash: hashOTP(code),
      purpose: 'transaction',
      expires_at: getOTPExpiry(5),
      ip_address: req.ip,
    });

    await sendOTPEmail(user.email, code, 'transaction');

    await createAuditLog({
      userId: req.user.id,
      action: 'TRANSFER_OTP_SENT',
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, { expiresInMinutes: 5 }, 'OTP sent to your registered email.');
  } catch (err) {
    logger.error(`Transfer OTP error: ${err.message}`);
    return error(res, 'Could not send OTP. Please try again.');
  }
};

// ─── Execute Transfer (internal helper) ──────────────────────────────────────
const executeTransfer = async ({
  fromAccount, toAccountNumber, toAccountName, toBankName, toIfsc,
  amount, mode, description, referenceNumber, userId, ip, idempotencyKey = null,
}) => {
  const t = await sequelize.transaction();
  try {
    const balanceBefore = parseFloat(fromAccount.balance);
    const balanceAfter = balanceBefore - amount;

    if (balanceAfter < 0) throw new Error('Insufficient balance');

    // Debit sender
    await fromAccount.update({
      balance: balanceAfter,
      available_balance: balanceAfter,
      daily_transferred: parseFloat(fromAccount.daily_transferred || 0) + amount,
    }, { transaction: t });

    // Create debit transaction
    const txn = await Transaction.create({
      account_id: fromAccount.id,
      reference_number: referenceNumber,
      transaction_type: 'debit',
      transfer_mode: mode,
      amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description,
      status: 'success',
      to_account_number: toAccountNumber,
      to_account_name: toAccountName,
      to_bank_name: toBankName,
      to_ifsc: toIfsc,
      processed_at: new Date(),
      ip_address: ip,
      idempotency_key: idempotencyKey,
    }, { transaction: t });

    // Credit receiver (if internal)
    const toAccount = await Account.findOne({ where: { account_number: toAccountNumber }, transaction: t });
    if (toAccount) {
      const toBalanceBefore = parseFloat(toAccount.balance);
      const toBalanceAfter = toBalanceBefore + amount;

      await toAccount.update({
        balance: toBalanceAfter,
        available_balance: toBalanceAfter,
      }, { transaction: t });

      await Transaction.create({
        account_id: toAccount.id,
        reference_number: `${referenceNumber}-CR`,
        transaction_type: 'credit',
        transfer_mode: mode,
        amount,
        balance_before: toBalanceBefore,
        balance_after: toBalanceAfter,
        description: `Transfer from ${maskAccountNumber(fromAccount.account_number)}`,
        status: 'success',
        from_account_number: fromAccount.account_number,
        from_account_name: 'Alister Bank Customer',
        processed_at: new Date(),
        ip_address: ip,
      }, { transaction: t });

      // Notify receiver
      const receiver = await User.findByPk(toAccount.user_id);
      if (receiver) {
        await Notification.create({
          user_id: receiver.id,
          title: `$${amount.toLocaleString('en-US')} credited to your account`,
          message: `You received $${amount.toLocaleString('en-US')} via ${mode}. Ref: ${referenceNumber}`,
          type: 'transaction',
          priority: 'high',
        }, { transaction: t });
      }
    }

    await t.commit();
    return { success: true, transactionId: txn.id, balanceAfter };
  } catch (err) {
    await t.rollback();
    return { success: false, message: err.message };
  }
};

// ─── Helper: reset daily limit if new day ────────────────────────────────────
const resetDailyLimitIfNeeded = async (account) => {
  const lastReset = account.last_limit_reset;
  const now = new Date();
  if (!lastReset || moment(lastReset).format('YYYY-MM-DD') !== moment(now).format('YYYY-MM-DD')) {
    await account.update({ daily_transferred: 0, last_limit_reset: now });
  }
};

// ─── Download PDF Statement ───────────────────────────────────────────────────
exports.downloadStatement = async (req, res) => {
  try {
    const { startDate, endDate, format } = req.query;
    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    const where = { account_id: account.id, status: 'success' };
    if (startDate && endDate) {
      where.created_at = {
        [Op.between]: [new Date(startDate), new Date(endDate + 'T23:59:59')],
      };
    }

    const transactions = await Transaction.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 500,
    });

    const user = await User.findByPk(req.user.id);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=statement-${Date.now()}.pdf`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, 612, 100).fill('#c8102e');
    doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold').text('ALISTER BANK', 50, 30);
    doc.fontSize(10).font('Helvetica').text('Account Statement', 50, 60);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 350, 60);

    // Account Info
    doc.fillColor('#000000').moveDown(4);
    doc.fontSize(11).font('Helvetica-Bold').text('Account Holder: ', 50, 120, { continued: true });
    doc.font('Helvetica').text(`${user.first_name} ${user.last_name}`);
    doc.font('Helvetica-Bold').text('Account Number: ', 50, 138, { continued: true });
    doc.font('Helvetica').text(maskAccountNumber(account.account_number));
    doc.font('Helvetica-Bold').text('SWIFT Code: ', 50, 156, { continued: true });
    doc.font('Helvetica').text(account.swift_code || 'ALSTINBB');
    doc.font('Helvetica-Bold').text('Current Balance: ', 50, 174, { continued: true });
    doc.font('Helvetica').text(`$${parseFloat(account.balance).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

    // Period
    if (startDate && endDate) {
      doc.font('Helvetica-Bold').text('Period: ', 50, 192, { continued: true });
      doc.font('Helvetica').text(`${startDate} to ${endDate}`);
    }

    // Separator
    doc.moveTo(50, 215).lineTo(562, 215).strokeColor('#c8102e').lineWidth(2).stroke();

    // Table header
    const tableTop = 230;
    doc.rect(50, tableTop, 512, 24).fill('#1a1a2e');
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
    doc.text('DATE', 55, tableTop + 7);
    doc.text('DESCRIPTION', 120, tableTop + 7);
    doc.text('REF NO.', 310, tableTop + 7);
    doc.text('DEBIT', 400, tableTop + 7);
    doc.text('CREDIT', 450, tableTop + 7);
    doc.text('BALANCE', 505, tableTop + 7);

    // Rows
    let y = tableTop + 30;
    transactions.forEach((tx, idx) => {
      if (y > 750) { doc.addPage(); y = 50; }
      if (idx % 2 === 0) doc.rect(50, y - 4, 512, 20).fill('#f9f9f9');
      doc.fillColor('#000000').fontSize(8).font('Helvetica');
      doc.text(moment(tx.created_at).format('DD/MM/YY'), 55, y);
      const desc = (tx.description || tx.narration || '').slice(0, 30);
      doc.text(desc, 120, y);
      doc.text((tx.reference_number || '').slice(0, 16), 310, y);
      doc.fillColor(tx.transaction_type === 'debit' ? '#dc2626' : '#555');
      doc.text(tx.transaction_type === 'debit' ? `$${parseFloat(tx.amount).toFixed(2)}` : '-', 400, y);
      doc.fillColor(tx.transaction_type === 'credit' ? '#16a34a' : '#555');
      doc.text(tx.transaction_type === 'credit' ? `$${parseFloat(tx.amount).toFixed(2)}` : '-', 450, y);
      doc.fillColor('#000000');
      doc.text(`$${parseFloat(tx.balance_after || 0).toFixed(2)}`, 505, y);
      y += 20;
    });

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#888').text(
      'This is a system-generated statement. © Alister Bank. SWIFT: ALSTINBB.',
      50, y + 20, { align: 'center', width: 512 }
    );

    doc.end();
  } catch (err) {
    logger.error(`Statement download error: ${err.message}`);
    return error(res, 'Failed to generate statement.');
  }
};

// ─── Download Transaction Receipt (PDF) ──────────────────────────────────────
// GET /transactions/:id/receipt — :id accepts the transaction UUID OR its
// reference number. SECURITY: the lookup is ALWAYS scoped to the logged-in
// user's own account (account_id), so one customer can never fetch another
// customer's receipt even with a guessed/leaked transaction ID. The route is
// additionally rate-limited (receiptLimiter) to block bulk enumeration.
exports.downloadReceipt = async (req, res) => {
  try {
    const rawId = String(req.params.id || '').trim();
    // Tight input validation: UUIDs and reference numbers are alphanumeric
    // with hyphens only, max 40 chars. Anything else is rejected outright.
    if (!rawId || rawId.length > 40 || !/^[A-Za-z0-9-]+$/.test(rawId)) {
      return badRequest(res, 'Invalid receipt identifier.');
    }

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    // Ownership-scoped lookup — account_id filter is the security boundary.
    const tx = await Transaction.findOne({
      where: {
        account_id: account.id,
        [Op.or]: [{ id: rawId }, { reference_number: rawId }],
      },
    });
    if (!tx) return notFound(res, 'Transaction not found.');

    const user = await User.findByPk(req.user.id);
    const isCredit = tx.transaction_type === 'credit';
    const money = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    // Fire-and-forget audit trail of every receipt download.
    createAuditLog({
      userId: req.user.id,
      action: 'RECEIPT_DOWNLOADED',
      entityType: 'Transaction',
      entityId: tx.reference_number,
      ipAddress: req.ip,
      status: 'success',
    }).catch(() => {});

    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt-${tx.reference_number}.pdf`);
    // Receipts contain account data — never let intermediaries cache them.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    doc.pipe(res);

    const PAGE_W = 595.28;
    const CARD_X = 60, CARD_W = PAGE_W - 120;

    // ── Header band ──────────────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 130).fill('#0f0f1a');
    doc.rect(0, 126, PAGE_W, 4).fill('#c8102e');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26).text('ALISTER BANK', 60, 40);
    doc.fillColor('#c8102e').fontSize(10).font('Helvetica-Bold').text('TRANSACTION RECEIPT', 60, 74, { characterSpacing: 2 });
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(8)
      .text('SWIFT: ALSTINBB  ·  www.alisterbank.online', 60, 92);
    doc.fillColor('#9ca3af').fontSize(8)
      .text(`Generated: ${moment().format('DD MMM YYYY, HH:mm:ss')}`, 60, 40, { width: PAGE_W - 120, align: 'right' });

    // ── Status + amount hero ─────────────────────────────────────────────────
    const statusMap = {
      success: { label: 'SUCCESSFUL', color: '#16a34a', bg: '#f0fdf4' },
      pending: { label: 'PENDING', color: '#d97706', bg: '#fffbeb' },
      processing: { label: 'PROCESSING', color: '#d97706', bg: '#fffbeb' },
      failed: { label: 'FAILED', color: '#dc2626', bg: '#fef2f2' },
      reversed: { label: 'REVERSED', color: '#dc2626', bg: '#fef2f2' },
    };
    const st = statusMap[tx.status] || statusMap.pending;

    let y = 170;
    doc.roundedRect(CARD_X, y, CARD_W, 110, 10).fill(st.bg);
    doc.fillColor(st.color).font('Helvetica-Bold').fontSize(9)
      .text(`●  ${st.label}`, CARD_X, y + 20, { width: CARD_W, align: 'center', characterSpacing: 1.5 });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(30)
      .text(`${isCredit ? '+' : '-'} ${money(tx.amount)}`, CARD_X, y + 38, { width: CARD_W, align: 'center' });
    doc.fillColor('#6b7280').font('Helvetica').fontSize(9)
      .text(`${isCredit ? 'Credited to' : 'Debited from'} A/c ${maskAccountNumber(account.account_number)}  ·  ${moment(tx.created_at).format('DD MMM YYYY [at] HH:mm')}`,
        CARD_X, y + 78, { width: CARD_W, align: 'center' });

    // ── Details card ─────────────────────────────────────────────────────────
    y = 310;
    const rows = [
      ['Reference Number', tx.reference_number],
      ['Date & Time', moment(tx.created_at).format('DD MMM YYYY, HH:mm:ss')],
      ['Transfer Mode', tx.transfer_mode || '—'],
      ['Transaction Type', isCredit ? 'Credit' : 'Debit'],
      ['Account Holder', `${user.first_name} ${user.last_name}`],
      ['Account Number', maskAccountNumber(account.account_number)],
      ...(tx.to_account_name ? [['Beneficiary Name', tx.to_account_name]] : []),
      ...(tx.to_account_number ? [['Beneficiary A/c', tx.to_account_number]] : []),
      ...(tx.to_bank_name ? [['Beneficiary Bank', tx.to_bank_name]] : []),
      ...(tx.to_ifsc ? [['IFSC / SWIFT', tx.to_ifsc]] : []),
      ...(tx.description ? [['Remarks', String(tx.description).slice(0, 80)]] : []),
      ['Balance After', money(tx.balance_after)],
    ];

    const ROW_H = 26;
    const cardH = rows.length * ROW_H + 44;
    doc.roundedRect(CARD_X, y, CARD_W, cardH, 10).lineWidth(1).strokeColor('#e5e7eb').stroke();
    doc.fillColor('#0f0f1a').font('Helvetica-Bold').fontSize(11).text('PAYMENT DETAILS', CARD_X + 24, y + 18, { characterSpacing: 1 });
    doc.moveTo(CARD_X + 24, y + 36).lineTo(CARD_X + CARD_W - 24, y + 36).strokeColor('#c8102e').lineWidth(1.5).stroke();

    let ry = y + 48;
    rows.forEach(([label, value], i) => {
      if (i > 0) doc.moveTo(CARD_X + 24, ry - 5).lineTo(CARD_X + CARD_W - 24, ry - 5).strokeColor('#f3f4f6').lineWidth(0.5).stroke();
      doc.fillColor('#6b7280').font('Helvetica').fontSize(9).text(label, CARD_X + 24, ry, { width: 170 });
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9)
        .text(String(value), CARD_X + 200, ry, { width: CARD_W - 224, align: 'right' });
      ry += ROW_H;
    });

    // ── Footer ───────────────────────────────────────────────────────────────
    let fy = y + cardH + 28;
    doc.roundedRect(CARD_X, fy, CARD_W, 46, 8).fill('#f9fafb');
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7.5).text(
      'SECURITY NOTICE: Alister Bank never asks for your OTP, PIN or password. This receipt is digitally generated and requires no signature. '
      + 'Verify any transaction by matching the reference number in your account statement.',
      CARD_X + 16, fy + 10, { width: CARD_W - 32, align: 'center', lineGap: 2 }
    );

    doc.fillColor('#9ca3af').fontSize(7).text(
      `© ${new Date().getFullYear()} Alister Bank · This is a system-generated receipt for reference number ${tx.reference_number}.`,
      CARD_X, fy + 62, { width: CARD_W, align: 'center' }
    );

    doc.end();
  } catch (err) {
    logger.error(`Receipt download error: ${err.message}`);
    return error(res, 'Failed to generate receipt.');
  }
};

// ─── Get Mini Statement ───────────────────────────────────────────────────────
exports.getMiniStatement = async (req, res) => {
  try {
    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    const transactions = await Transaction.findAll({
      where: { account_id: account.id },
      order: [['created_at', 'DESC']],
      limit: 10,
    });

    return success(res, { transactions, balance: account.balance });
  } catch (err) {
    return error(res, 'Failed to fetch mini statement.');
  }
};

// ─── Beneficiary Management ───────────────────────────────────────────────────
exports.getBeneficiaries = async (req, res) => {
  try {
    const beneficiaries = await Beneficiary.findAll({
      where: { user_id: req.user.id, is_active: true },
      order: [['created_at', 'DESC']],
    });
    return success(res, { beneficiaries });
  } catch (err) {
    return error(res, 'Failed to fetch beneficiaries.');
  }
};

exports.addBeneficiary = async (req, res) => {
  try {
    const { nickname, accountNumber, accountName, bankName, ifscCode, accountType } = req.body;

    const existing = await Beneficiary.findOne({
      where: { user_id: req.user.id, account_number: accountNumber, is_active: true },
    });
    if (existing) return badRequest(res, 'Beneficiary already added.');

    // Auto-verify if internal account
    const internalAccount = await Account.findOne({ where: { account_number: accountNumber } });

    const beneficiary = await Beneficiary.create({
      user_id: req.user.id,
      nickname,
      account_number: accountNumber,
      account_name: accountName,
      bank_name: bankName || (internalAccount ? 'Alister Bank' : ''),
      ifsc_code: ifscCode,
      account_type: accountType,
      is_verified: !!internalAccount,
    });

    return success(res, { beneficiary }, 'Beneficiary added successfully.');
  } catch (err) {
    return error(res, 'Failed to add beneficiary.');
  }
};

exports.deleteBeneficiary = async (req, res) => {
  try {
    const beneficiary = await Beneficiary.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!beneficiary) return notFound(res, 'Beneficiary not found.');
    await beneficiary.update({ is_active: false });
    return success(res, {}, 'Beneficiary removed.');
  } catch (err) {
    return error(res, 'Failed to remove beneficiary.');
  }
};

// ─── Get Notifications ────────────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const { Notification } = require('../models');
    const notifications = await Notification.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
      limit: 50,
    });
    const unreadCount = notifications.filter(n => !n.is_read).length;
    return success(res, { notifications, unreadCount });
  } catch (err) {
    return error(res, 'Failed to fetch notifications.');
  }
};

exports.markNotificationsRead = async (req, res) => {
  try {
    const { Notification } = require('../models');
    await Notification.update(
      { is_read: true },
      { where: { user_id: req.user.id, is_read: false } }
    );
    return success(res, {}, 'Notifications marked as read.');
  } catch (err) {
    return error(res, 'Failed to update notifications.');
  }
};

// ─── Support Ticket ───────────────────────────────────────────────────────────
exports.createTicket = async (req, res) => {
  try {
    const { SupportTicket } = require('../models');
    const { subject, description, category, priority } = req.body;
    const { generateTicketNumber } = require('../utils/helpers');

    const ticket = await SupportTicket.create({
      user_id: req.user.id,
      ticket_number: generateTicketNumber(),
      subject,
      description,
      category: category || 'other',
      priority: priority || 'medium',
    });

    return success(res, { ticket }, 'Support ticket created successfully.');
  } catch (err) {
    return error(res, 'Failed to create support ticket.');
  }
};

exports.getTickets = async (req, res) => {
  try {
    const { SupportTicket } = require('../models');
    const tickets = await SupportTicket.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
    });
    return success(res, { tickets });
  } catch (err) {
    return error(res, 'Failed to fetch tickets.');
  }
};
