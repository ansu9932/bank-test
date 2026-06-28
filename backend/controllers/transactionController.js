const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { Account, Transaction, Beneficiary, User, Notification } = require('../models');
const { generateReferenceNumber, maskAccountNumber, formatCurrency, paginate } = require('../utils/helpers');
const { isMethodEnabled, methodBlockedMessage } = require('../utils/transferMethods');
const { sendTransferAlertEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound, forbidden } = require('../utils/apiResponse');
const logger = require('../utils/logger');
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

// ─── Initiate Transfer ────────────────────────────────────────────────────────
exports.initiateTransfer = async (req, res) => {
  try {
    const {
      toAccountNumber, toAccountName, toBankName, toIfsc,
      amount, transferMode, description, securityPin, scheduledAt,
    } = req.body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) return badRequest(res, 'Invalid transfer amount.');
    if (!toAccountNumber || !transferMode) return badRequest(res, 'Account number and transfer mode are required.');

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'Account not found.');
    if (account.status === 'frozen') return forbidden(res, 'Your account is frozen. Contact support.');

    // Verify PIN
    const user = await User.findByPk(req.user.id);
    const isPinValid = await bcrypt.compare(String(securityPin), user.security_pin);
    if (!isPinValid) return badRequest(res, 'Incorrect security PIN.');

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

// ─── Execute Transfer (internal helper) ──────────────────────────────────────
const executeTransfer = async ({
  fromAccount, toAccountNumber, toAccountName, toBankName, toIfsc,
  amount, mode, description, referenceNumber, userId, ip,
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
