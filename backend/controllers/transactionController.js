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
      toAccountName: toAccountName || (isInternal?.user
        ? (isInternal.user.account_type === 'business_elite' && isInternal.user.company_name
          ? isInternal.user.company_name
          : `${isInternal.user.first_name || ''} ${isInternal.user.last_name || ''}`.trim())
        : 'Unknown'),
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

// ─── Statement helpers (shared by download + email delivery) ─────────────────

// The name printed as "Account Holder" on official statements. Business Elite
// accounts are opened in the COMPANY's name, so the statement is titled with
// the registered company name instead of the applicant's personal name.
const statementHolderName = (user) =>
  (user.account_type === 'business_elite' && user.company_name)
    ? user.company_name
    : `${user.first_name} ${user.last_name}`;

// Fetch the statement's transactions for an account + optional date range.
const fetchStatementTransactions = async (accountId, startDate, endDate) => {
  const where = { account_id: accountId, status: 'success' };
  if (startDate && endDate) {
    where.created_at = {
      [Op.between]: [new Date(startDate), new Date(endDate + 'T23:59:59')],
    };
  }
  return Transaction.findAll({ where, order: [['created_at', 'DESC']], limit: 500 });
};

// Render the official statement PDF into the given PDFDocument (piped by the
// caller either to the HTTP response, or into a Buffer for email delivery).
const renderStatementPDF = (doc, { user, account, transactions, startDate, endDate }) => {
  const PAGE_W = 595.28, PAGE_H = 841.89;
  const MARGIN = 50;
  
  // ── Modern Header with primary brand color and clean typography ──────────
  doc.rect(0, 0, PAGE_W, 80).fill('#000a1e'); // primary color
  doc.rect(0, 80, PAGE_W, 4).fill('#c8102e'); // error accent border
  
  doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold')
    .text('Alister Bank', MARGIN, 24);
  
  doc.fillColor('#ffffff').opacity(0.7).fontSize(10).font('Helvetica')
    .text('100 Financial District Blvd, Suite 400', MARGIN, 52)
    .text('New York, NY 10005 · 1-800-ALISTER · www.alisterbank.com', MARGIN, 64);
  
  // Header right side - Statement title and period
  doc.opacity(1).fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
    .text('ACCOUNT STATEMENT', PAGE_W - 220, 24, { width: 170, align: 'right' });
  
  if (startDate && endDate) {
    doc.roundedRect(PAGE_W - 220, 46, 170, 26, 4).fillAndStroke('#efeded', '#c4c6cf');
    doc.fillColor('#44474e').fontSize(7).font('Helvetica-Bold')
      .text('STATEMENT PERIOD', PAGE_W - 215, 50, { width: 160, align: 'center' });
    doc.fillColor('#1b1c1c').fontSize(10).font('Helvetica-Bold')
      .text(`${moment(startDate).format('MMM DD, YYYY')} - ${moment(endDate).format('MMM DD, YYYY')}`, 
        PAGE_W - 215, 60, { width: 160, align: 'center' });
  }
  
  // ── Account Holder & Summary Grid ──────────────────────────────────────
  let y = 110;
  
  // Account Holder Info (Left Column)
  doc.fillColor('#44474e').fontSize(8).font('Helvetica-Bold')
    .text('ACCOUNT HOLDER', MARGIN, y);
  doc.fillColor('#1b1c1c').fontSize(14).font('Helvetica-Bold')
    .text(statementHolderName(user), MARGIN, y + 14);
  
  y += 36;
  doc.fillColor('#44474e').fontSize(8).font('Helvetica-Bold')
    .text('ACCOUNT NUMBER', MARGIN, y);
  doc.fillColor('#1b1c1c').fontSize(10).font('Helvetica')
    .text(maskAccountNumber(account.account_number), MARGIN, y + 14);
  
  y += 30;
  doc.fillColor('#44474e').fontSize(8).font('Helvetica-Bold')
    .text('ACCOUNT TYPE', MARGIN, y);
  doc.fillColor('#1b1c1c').fontSize(10).font('Helvetica')
    .text(account.account_type?.replace('_', ' ').toUpperCase() || 'PREMIUM CHECKING', MARGIN, y + 14);
  
  // Financial Summary Card (Right Column - Bento style)
  const summaryX = PAGE_W - MARGIN - 230;
  const summaryY = 110;
  const summaryW = 230;
  const summaryH = 130;
  
  doc.roundedRect(summaryX, summaryY, summaryW, summaryH, 8)
    .lineWidth(1).strokeColor('#c4c6cf').fillAndStroke('#fbf9f9', '#c4c6cf');
  
  doc.fillColor('#44474e').fontSize(8).font('Helvetica-Bold')
    .text('ACCOUNT SUMMARY', summaryX + 16, summaryY + 16);
  doc.moveTo(summaryX + 16, summaryY + 30).lineTo(summaryX + summaryW - 16, summaryY + 30)
    .strokeColor('#c4c6cf').lineWidth(1).stroke();
  
  // Calculate totals
  const openingBalance = transactions.length > 0 
    ? parseFloat(transactions[transactions.length - 1].balance_before || account.balance) 
    : parseFloat(account.balance);
  const totalCredits = transactions
    .filter(t => t.transaction_type === 'credit')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  const totalDebits = transactions
    .filter(t => t.transaction_type === 'debit')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
  const closingBalance = parseFloat(account.balance);
  
  let sY = summaryY + 40;
  const renderSummaryLine = (label, value, color = '#1b1c1c') => {
    doc.fillColor('#44474e').fontSize(8).font('Helvetica')
      .text(label, summaryX + 16, sY, { width: summaryW - 100 });
    doc.fillColor(color).fontSize(9).font('Helvetica-Bold')
      .text(value, summaryX + 16, sY, { width: summaryW - 32, align: 'right' });
    sY += 16;
  };
  
  renderSummaryLine('Opening Balance', `$${openingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  renderSummaryLine('Total Deposits/Credits (+)', `+$${totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, '#199d3d');
  renderSummaryLine('Total Withdrawals/Debits (-)', `-$${totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, '#1b1c1c');
  
  // Closing balance with emphasis
  doc.moveTo(summaryX + 16, sY).lineTo(summaryX + summaryW - 16, sY)
    .strokeColor('#ba1a1a').lineWidth(2).stroke();
  sY += 8;
  doc.fillColor('#000a1e').fontSize(10).font('Helvetica-Bold')
    .text('Closing Balance', summaryX + 16, sY);
  doc.fillColor('#c8102e').fontSize(13).font('Helvetica-Bold')
    .text(`$${closingBalance.toLocaleString('en-US', { minimomFractionDigits: 2 })}`, 
      summaryX + 16, sY, { width: summaryW - 32, align: 'right' });
  
  // ── Transaction Details Table ──────────────────────────────────────────
  y = 260;
  doc.fillColor('#000a1e').fontSize(12).font('Helvetica-Bold')
    .text('Transaction Details', MARGIN, y);
  doc.moveTo(MARGIN, y + 18).lineTo(PAGE_W - MARGIN, y + 18)
    .strokeColor('#000a1e').lineWidth(2).stroke();
  
  y += 26;
  
  // Table header
  doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 20).fill('#efeded');
  doc.strokeColor('#c4c6cf').lineWidth(0.5)
    .rect(MARGIN, y, PAGE_W - 2 * MARGIN, 20).stroke();
  
  doc.fillColor('#44474e').fontSize(7).font('Helvetica-Bold');
  doc.text('DATE', MARGIN + 8, y + 7);
  doc.text('DESCRIPTION', MARGIN + 50, y + 7);
  doc.text('REF #', MARGIN + 220, y + 7);
  doc.text('WITHDRAWALS (-)', MARGIN + 300, y + 7, { width: 70, align: 'right' });
  doc.text('DEPOSITS (+)', MARGIN + 380, y + 7, { width: 70, align: 'right' });
  doc.text('BALANCE', MARGIN + 460, y + 7, { width: 70, align: 'right' });
  
  y += 20;
  
  // Table rows
  [...transactions].reverse().forEach((tx, idx) => {
    if (y > PAGE_H - 100) {
      doc.addPage();
      y = 50;
      // Repeat header on new page
      doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 20).fill('#efeded');
      doc.fillColor('#44474e').fontSize(7).font('Helvetica-Bold');
      doc.text('DATE', MARGIN + 8, y + 7);
      doc.text('DESCRIPTION', MARGIN + 50, y + 7);
      doc.text('REF #', MARGIN + 220, y + 7);
      doc.text('WITHDRAWALS (-)', MARGIN + 300, y + 7, { width: 70, align: 'right' });
      doc.text('DEPOSITS (+)', MARGIN + 380, y + 7, { width: 70, align: 'right' });
      doc.text('BALANCE', MARGIN + 460, y + 7, { width: 70, align: 'right' });
      y += 20;
    }
    
    // Alternating row background
    if (idx % 2 === 1) {
      doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 18).fill('#fbf9f9');
    }
    
    doc.strokeColor('#c4c6cf').lineWidth(0.5)
      .rect(MARGIN, y, PAGE_W - 2 * MARGIN, 18).stroke();
    
    // Row content
    doc.fillColor('#44474e').fontSize(8).font('Helvetica')
      .text(moment(tx.created_at).format('MMM DD'), MARGIN + 8, y + 5);
    
    const desc = (tx.description || tx.narration || 'Transaction').slice(0, 35);
    doc.fillColor('#1b1c1c').fontSize(8).font('Helvetica')
      .text(desc, MARGIN + 50, y + 5, { width: 165, ellipsis: true });
    
    doc.fillColor('#44474e').fontSize(7).font('Helvetica')
      .text((tx.reference_number || '').slice(0, 18), MARGIN + 220, y + 5);
    
    // Withdrawals
    if (tx.transaction_type === 'debit') {
      doc.fillColor('#1b1c1c').fontSize(8).font('Helvetica')
        .text(`-$${parseFloat(tx.amount).toFixed(2)}`, MARGIN + 300, y + 5, { width: 70, align: 'right' });
    }
    
    // Deposits
    if (tx.transaction_type === 'credit') {
      doc.fillColor('#199d3d').fontSize(8).font('Helvetica')
        .text(`+$${parseFloat(tx.amount).toFixed(2)}`, MARGIN + 380, y + 5, { width: 70, align: 'right' });
    }
    
    // Balance
    doc.fillColor('#1b1c1c').fontSize(8).font('Helvetica-Bold')
      .text(`$${parseFloat(tx.balance_after || 0).toFixed(2)}`, MARGIN + 460, y + 5, { width: 70, align: 'right' });
    
    y += 18;
  });
  
  // Closing balance row
  doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 22).fill('#efeded');
  doc.strokeColor('#000a1e').lineWidth(2)
    .rect(MARGIN, y, PAGE_W - 2 * MARGIN, 22).stroke();
  
  doc.fillColor('#000a1e').fontSize(10).font('Helvetica-Bold')
    .text('Closing Balance', MARGIN + 8, y + 6);
  doc.fillColor('#1b1c1c').fontSize(8).font('Helvetica-Bold')
    .text(`-$${totalDebits.toFixed(2)}`, MARGIN + 300, y + 6, { width: 70, align: 'right' });
  doc.fillColor('#199d3d').fontSize(8).font('Helvetica-Bold')
    .text(`+$${totalCredits.toFixed(2)}`, MARGIN + 380, y + 6, { width: 70, align: 'right' });
  doc.fillColor('#c8102e').fontSize(11).font('Helvetica-Bold')
    .text(`$${closingBalance.toFixed(2)}`, MARGIN + 460, y + 6, { width: 70, align: 'right' });
  
  // ── Footer ──────────────────────────────────────────────────────────────
  y = PAGE_H - 70;
  doc.rect(0, y, PAGE_W, 1).fill('#c4c6cf');
  
  y += 12;
  doc.fillColor('#000a1e').fontSize(11).font('Helvetica-Bold')
    .text('Alister Bank', MARGIN, y);
  doc.fillColor('#44474e').fontSize(8).font('Helvetica')
    .text('For customer service, call 1-800-ALISTER (1-800-254-7837)', MARGIN, y + 16)
    .text('Available 24/7 for account support and fraud reporting.', MARGIN, y + 28);
  
  doc.fillColor('#44474e').fontSize(7).font('Helvetica')
    .text(`© ${new Date().getFullYear()} Alister Bank. All rights reserved. Member FDIC. Equal Housing Lender.`, 
      MARGIN, y + 44, { width: PAGE_W - 2 * MARGIN, align: 'center' });
  
  doc.end();
};

// Validate a requested statement date range. Returns an error string or null.
const validateStatementRange = (startDate, endDate) => {
  if (!startDate || !endDate) return 'Please select a date range.';
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Invalid date range.';
  if (start > end) return 'Start date must be before end date.';
  if ((end - start) > 366 * 24 * 60 * 60 * 1000) return 'Statement range cannot exceed 1 year.';
  return null;
};

// ─── Download PDF Statement ───────────────────────────────────────────────────
exports.downloadStatement = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    const transactions = await fetchStatementTransactions(account.id, startDate, endDate);
    const user = await User.findByPk(req.user.id);

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=statement-${Date.now()}.pdf`);
    doc.pipe(res);
    renderStatementPDF(doc, { user, account, transactions, startDate, endDate });
  } catch (err) {
    logger.error(`Statement download error: ${err.message}`);
    return error(res, 'Failed to generate statement.');
  }
};

// ─── Email PDF Statement (to the REGISTERED email only) ──────────────────────
// POST /transactions/email-statement { startDate, endDate }
//
// SECURITY (anti-bot / anti-abuse), layered:
//   1. Route-level per-IP rate limit (statementEmailLimiter — 3 per 15 min).
//   2. Per-USER cooldown below: one email statement every 2 minutes, so a bot
//      with rotating IPs but a stolen session still can't spam the inbox.
//   3. Per-USER daily cap: max 5 statement emails per calendar day.
//   4. The recipient is ALWAYS the account's registered email — the client can
//      never supply a destination address, so statements cannot be exfiltrated
//      to an attacker-controlled inbox.
//   5. Strict date-range validation (valid dates, start ≤ end, ≤ 1 year).
const STATEMENT_EMAIL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes between requests
const STATEMENT_EMAIL_DAILY_CAP = 5;               // max emails per user per day
// userId → { lastSentAt, day: 'YYYY-MM-DD', count }
const statementEmailGuard = new Map();

exports.emailStatement = async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};

    const rangeError = validateStatementRange(startDate, endDate);
    if (rangeError) return badRequest(res, rangeError);

    // ── Per-user cooldown + daily cap ──────────────────────────────────────
    const today = moment().format('YYYY-MM-DD');
    const guard = statementEmailGuard.get(req.user.id) || { lastSentAt: 0, day: today, count: 0 };
    if (guard.day !== today) { guard.day = today; guard.count = 0; }
    const sinceLast = Date.now() - guard.lastSentAt;
    if (sinceLast < STATEMENT_EMAIL_COOLDOWN_MS) {
      const waitSec = Math.ceil((STATEMENT_EMAIL_COOLDOWN_MS - sinceLast) / 1000);
      return badRequest(res, `Please wait ${waitSec} seconds before requesting another statement email.`);
    }
    if (guard.count >= STATEMENT_EMAIL_DAILY_CAP) {
      return badRequest(res, `Daily limit reached (${STATEMENT_EMAIL_DAILY_CAP} statement emails per day). Please try again tomorrow or use Download Now.`);
    }

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');

    const user = await User.findByPk(req.user.id);
    const transactions = await fetchStatementTransactions(account.id, startDate, endDate);

    // ── Generate the PDF into a Buffer for the email attachment ────────────
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      renderStatementPDF(doc, { user, account, transactions, startDate, endDate });
    });

    // Reserve the guard slot BEFORE dispatch so parallel requests can't race
    // past the cooldown while the SMTP send is in flight.
    guard.lastSentAt = Date.now();
    guard.count += 1;
    statementEmailGuard.set(req.user.id, guard);

    const { sendStatementEmail } = require('../services/emailService');
    const result = await sendStatementEmail(user.email, {
      name: statementHolderName(user),
      accountNumber: maskAccountNumber(account.account_number),
      startDate,
      endDate,
      pdfBuffer,
    });

    if (!result.success) {
      // Roll the cooldown back so a genuine mail outage doesn't consume the
      // user's quota for nothing.
      guard.count -= 1;
      guard.lastSentAt = 0;
      statementEmailGuard.set(req.user.id, guard);
      return error(res, 'Could not send the statement email right now. Please try again shortly.');
    }

    await createAuditLog({
      userId: req.user.id,
      action: 'STATEMENT_EMAILED',
      entityType: 'Account',
      entityId: account.id,
      ipAddress: req.ip,
      status: 'success',
      description: `Statement ${startDate} → ${endDate} emailed to registered address.`,
    });

    // Mask the address in the response (defense-in-depth for shoulder surfing
    // / logged responses) — the user knows their own registered email.
    const maskedEmail = user.email.replace(/^(.{2}).*(@.*)$/, '$1***$2');
    return success(res, { sentTo: maskedEmail }, `Statement sent to your registered email (${maskedEmail}).`);
  } catch (err) {
    logger.error(`Statement email error: ${err.message}`);
    return error(res, 'Failed to email statement.');
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

    const PAGE_W = 595.28, PAGE_H = 841.89;
    const CARD_X = 60, CARD_W = PAGE_W - 120;

    // ── Receipt Header with brand styling ────────────────────────────────────
    // Dark header with decorative pattern overlay
    doc.rect(0, 0, PAGE_W, 110).fill('#000a1e'); // primary color
    
    // Decorative dot pattern overlay (reduced opacity)
    for (let x = 2; x < PAGE_W; x += 24) {
      for (let y = 2; y < 110; y += 24) {
        doc.circle(x, y, 1).fill('#ffffff').opacity(0.1);
      }
    }
    doc.opacity(1); // Reset opacity
    
    doc.rect(0, 106, PAGE_W, 4).fill('#c8102e'); // error accent border
    
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18)
      .text('Alister Bank', 0, 32, { width: PAGE_W, align: 'center' });
    doc.fillColor('#ffffff').opacity(0.7).fontSize(8).font('Helvetica-Bold')
      .text('TRANSACTION RECEIPT', 0, 58, { width: PAGE_W, align: 'center', characterSpacing: 2 });

    // ── Status & Amount Hero Section ─────────────────────────────────────────
    const statusMap = {
      success: { label: 'TRANSFER SUCCESSFUL', color: '#c8102e', bg: '#ffdad6', icon: '✓' },
      pending: { label: 'PENDING', color: '#d97706', bg: '#fffbeb', icon: '⏱' },
      processing: { label: 'PROCESSING', color: '#d97706', bg: '#fffbeb', icon: '⟳' },
      failed: { label: 'FAILED', color: '#dc2626', bg: '#fef2f2', icon: '✗' },
      reversed: { label: 'REVERSED', color: '#dc2626', bg: '#fef2f2', icon: '↺' },
    };
    const st = statusMap[tx.status] || statusMap.pending;

    let y = 150;
    // Hero status card
    doc.roundedRect(CARD_X, y, CARD_W, 90, 10).fill(st.bg);
    
    // Status badge
    doc.fillColor(st.color).font('Helvetica-Bold').fontSize(9)
      .text(`●  ${st.label}`, CARD_X, y + 16, { width: CARD_W, align: 'center', characterSpacing: 1.5 });
    
    // Amount (hero size)
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(32)
      .text(`${isCredit ? '+' : '-'}${money(tx.amount)}`, CARD_X, y + 34, { width: CARD_W, align: 'center' });
    
    // Transaction meta
    doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
      .text(`${isCredit ? 'Credited to' : 'Debited from'} A/c ${maskAccountNumber(account.account_number)}  ·  ${moment(tx.created_at).format('DD MMM YYYY [at] HH:mm')}`,
        CARD_X, y + 70, { width: CARD_W, align: 'center' });

    // ── Sender & Recipient Details Grid ─────────────────────────────────────
    y = 260;
    const colW = (CARD_W - 16) / 2;
    
    // Sender Details (Left)
    doc.roundedRect(CARD_X, y, colW, 80, 8).fill('#efeded');
    doc.moveTo(CARD_X, y).lineTo(CARD_X + 4, y).lineWidth(4).strokeColor('#000a1e').stroke();
    
    doc.fillColor('#44474e').font('Helvetica-Bold').fontSize(7)
      .text('SENDER DETAILS', CARD_X + 12, y + 12, { characterSpacing: 0.8 });
    
    doc.fillColor('#44474e').font('Helvetica').fontSize(7)
      .text('Name', CARD_X + 12, y + 28);
    doc.fillColor('#1b1c1c').font('Helvetica-Bold').fontSize(10)
      .text((user.account_type === 'business_elite' && user.company_name) 
        ? user.company_name 
        : `${user.first_name} ${user.last_name}`, 
        CARD_X + 12, y + 38, { width: colW - 24, ellipsis: true });
    
    doc.fillColor('#44474e').font('Helvetica').fontSize(7)
      .text('Account', CARD_X + 12, y + 54);
    doc.fillColor('#1b1c1c').font('Helvetica').fontSize(8)
      .text(`${account.account_type?.replace('_', ' ')} ending in ${account.account_number.slice(-4)}`, 
        CARD_X + 12, y + 64, { width: colW - 24, ellipsis: true });
    
    // Recipient Details (Right)
    const recX = CARD_X + colW + 16;
    doc.roundedRect(recX, y, colW, 80, 8).fill('#efeded');
    doc.moveTo(recX, y).lineTo(recX + 4, y).lineWidth(4).strokeColor('#c8102e').stroke();
    
    doc.fillColor('#44474e').font('Helvetica-Bold').fontSize(7)
      .text('RECIPIENT DETAILS', recX + 12, y + 12, { characterSpacing: 0.8 });
    
    doc.fillColor('#44474e').font('Helvetica').fontSize(7)
      .text('Name', recX + 12, y + 28);
    doc.fillColor('#1b1c1c').font('Helvetica-Bold').fontSize(10)
      .text(tx.to_account_name || 'N/A', recX + 12, y + 38, { width: colW - 24, ellipsis: true });
    
    doc.fillColor('#44474e').font('Helvetica').fontSize(7)
      .text('Account', recX + 12, y + 54);
    doc.fillColor('#1b1c1c').font('Helvetica').fontSize(8)
      .text(tx.to_account_number 
        ? `Account ending in ${tx.to_account_number.slice(-4)}` 
        : 'N/A', 
        recX + 12, y + 64, { width: colW - 24, ellipsis: true });

    // ── Technical Details Table ──────────────────────────────────────────────
    y = 360;
    const details = [
      ['Transaction ID', tx.reference_number],
      ['Date & Time', moment(tx.created_at).format('MMM DD, YYYY HH:mm:ss UTC')],
      ['Type', tx.transfer_mode || 'Internal Transfer'],
      ...(tx.to_bank_name ? [['Beneficiary Bank', tx.to_bank_name]] : []),
      ...(tx.to_ifsc ? [['IFSC / SWIFT', tx.to_ifsc]] : []),
      ...(tx.description ? [['Note / Description', String(tx.description).slice(0, 60)]] : []),
    ];
    
    const detailH = details.length * 26 + 48;
    doc.roundedRect(CARD_X, y, CARD_W, detailH, 10).lineWidth(1).strokeColor('#e5e7eb').stroke();
    
    doc.fillColor('#0f0f1a').font('Helvetica-Bold').fontSize(11)
      .text('PAYMENT DETAILS', CARD_X + 24, y + 18, { characterSpacing: 1 });
    doc.moveTo(CARD_X + 24, y + 36).lineTo(CARD_X + CARD_W - 24, y + 36)
      .strokeColor('#c8102e').lineWidth(1.5).stroke();
    
    let dY = y + 48;
    details.forEach(([label, value], idx) => {
      if (idx > 0) {
        doc.moveTo(CARD_X + 24, dY - 5).lineTo(CARD_X + CARD_W - 24, dY - 5)
          .strokeColor('#f3f4f6').lineWidth(0.5).stroke();
      }
      doc.fillColor('#6b7280').font('Helvetica').fontSize(8)
        .text(label.toUpperCase(), CARD_X + 24, dY, { width: 160 });
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8)
        .text(String(value), CARD_X + 200, dY, { width: CARD_W - 224, align: 'right' });
      dY += 26;
    });

    // ── Footer ───────────────────────────────────────────────────────────────
    y = dY + 20;
    
    // Security notice card
    doc.roundedRect(CARD_X, y, CARD_W, 50, 8).fill('#f9fafb');
    doc.fillColor('#6b7280').font('Helvetica').fontSize(7)
      .text('SECURITY NOTICE: Alister Bank never asks for your OTP, PIN or password. This receipt is digitally generated and requires no signature. Verify any transaction by matching the reference number in your account statement.',
        CARD_X + 16, y + 10, { width: CARD_W - 32, align: 'center', lineGap: 2 });
    
    // Footer text
    y += 60;
    doc.fillColor('#9ca3af').fontSize(7).font('Helvetica')
      .text(`© ${new Date().getFullYear()} Alister Bank · This is a system-generated receipt for reference number ${tx.reference_number}.`,
        CARD_X, y, { width: CARD_W, align: 'center' });
    
    // Support info
    y += 20;
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica')
      .text('Support: 1-800-ALISTER (1-800-254-7837) · Available 24/7', 
        CARD_X, y, { width: CARD_W, align: 'center' });

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
