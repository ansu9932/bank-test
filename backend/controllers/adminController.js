const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Account, Transaction, KYCDocument, AdminUser, AuditLog, Notification, SupportTicket, SecureLink, CardRequest, ApprovedCard } = require('../models');
const { generateAdminToken } = require('../middleware/auth');
const {
  generateAccountNumber, generateIFSC, generateSecureToken, getSecureLinkExpiry, getOnboardingLinkExpiry,
  isLuhnValid, detectCardNetwork, hashValue, minimumBalanceForType,
} = require('../utils/helpers');
const { sendAccountApprovedEmail, sendVideoKYCEmail, sendTransferAlertEmail, sendKYCRejectedEmail, sendActivationDepositEmail } = require('../services/emailService');
const { issueDepositToken } = require('../utils/depositLink');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound, created, unauthorized } = require('../utils/apiResponse');
const { normalizeTransferMethods, METHOD_LABELS } = require('../utils/transferMethods');
const logger = require('../utils/logger');
const { paginate } = require('../utils/helpers');

// ─── Shared: map a stored document path to a public /uploads web path ─────────
// Normalizes Windows separators and slices from "uploads/…" so the value works
// with the express.static('/uploads') mount regardless of how it was stored.
const toWebPath = (p) => {
  if (!p) return null;
  const norm = String(p).replace(/\\/g, '/');
  const m = norm.match(/uploads\/.*/);
  return m ? `/${m[0]}` : norm;
};

// ─── Admin Login ──────────────────────────────────────────────────────────────
exports.adminLogin = async (req, res) => {
  try {
    // Defensively capture any common naming variations from the frontend request body payload
    const identifier = req.body.username || req.body.email || req.body.usernameOrEmail || req.body.login;
    const { password } = req.body;

    if (!identifier || !password) {
      return badRequest(res, 'Username or Email and password are required.');
    }

    // Lookup using the extracted identifier against both the username and email columns
    const admin = await AdminUser.findOne({ 
      where: { 
        [Op.or]: [
          { username: identifier }, 
          { email: identifier }
        ] 
      } 
    });
    
    if (!admin || !admin.is_active) {
      return unauthorized(res, 'Invalid credentials or account inactive.');
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) return unauthorized(res, 'Invalid credentials.');

    await admin.update({ last_login: new Date() });

    const token = generateAdminToken(admin.id);

    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 12 * 60 * 60 * 1000,
    });

    await createAuditLog({ adminId: admin.id, action: 'ADMIN_LOGIN', ipAddress: req.ip, status: 'success' });

    return success(res, {
      token,
      admin: { id: admin.id, username: admin.username, fullName: admin.full_name, role: admin.role },
    }, 'Admin login successful.');
  } catch (err) {
    logger.error(`Admin login error: ${err.message}`);
    return error(res, 'Login failed.');
  }
};

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers, pendingKYC, activeAccounts, frozenAccounts,
      totalTransactions, todayTx, pendingTickets,
    ] = await Promise.all([
      User.count(),
      User.count({ where: { kyc_status: { [Op.in]: ['under_review', 'video_kyc_pending'] } } }),
      Account.count({ where: { status: 'active' } }),
      Account.count({ where: { status: 'frozen' } }),
      Transaction.count({ where: { status: 'success' } }),
      Transaction.count({
        where: {
          status: 'success',
          created_at: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      SupportTicket.count({ where: { status: { [Op.in]: ['open', 'in_progress'] } } }),
    ]);

    // Transaction volume
    const volumeResult = await Transaction.findAll({
      attributes: [
        [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'totalVolume'],
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
      ],
      where: { status: 'success', transaction_type: 'debit' },
      raw: true,
    });

    // Monthly chart data
    const monthlyData = await Transaction.findAll({
      attributes: [
        [require('sequelize').fn('DATE_FORMAT', require('sequelize').col('created_at'), '%Y-%m'), 'month'],
        [require('sequelize').fn('SUM', require('sequelize').col('amount')), 'total'],
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count'],
        'transaction_type',
      ],
      where: {
        status: 'success',
        created_at: { [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 6)) },
      },
      group: ['month', 'transaction_type'],
      order: [['month', 'ASC']],
      raw: true,
    });

    // Flagged transactions
    const flaggedCount = await Transaction.count({ where: { is_flagged: true, status: 'success' } });

    return success(res, {
      totalUsers,
      pendingKYC,
      activeAccounts,
      frozenAccounts,
      totalTransactions,
      todayTransactions: todayTx,
      pendingTickets,
      totalVolume: volumeResult[0]?.totalVolume || 0,
      flaggedTransactions: flaggedCount,
      monthlyData,
    });
  } catch (err) {
    logger.error(`Admin dashboard stats error: ${err.message}`);
    return error(res, 'Failed to fetch stats.');
  }
};

// ─── Get All Users ────────────────────────────────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, kycStatus } = req.query;
    const where = {};
    if (status) where.account_status = status;
    if (kycStatus) where.kyc_status = kycStatus;
    if (search) {
      where[Op.or] = [
        { email: { [Op.like]: `%${search}%` } },
        { customer_id: { [Op.like]: `%${search}%` } },
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
      ];
    }

    const { limit: lim, offset } = paginate(page, limit);
    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: { exclude: ['password_hash', 'security_pin'] },
      include: [{ model: Account, as: 'account', attributes: ['account_number', 'balance', 'status'] }],
      order: [['created_at', 'DESC']],
      limit: lim,
      offset,
    });

    return success(res, {
      users: rows,
      pagination: { total: count, page: parseInt(page), limit: lim, totalPages: Math.ceil(count / lim) },
    });
  } catch (err) {
    logger.error(`Get users error: ${err.message}`);
    return error(res, 'Failed to fetch users.');
  }
};

// ─── Get User Details ─────────────────────────────────────────────────────────
exports.getUserDetails = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id, {
      attributes: { exclude: ['password_hash', 'security_pin'] },
      include: [
        { model: Account, as: 'account' },
        { model: KYCDocument, as: 'documents' },
        {
          model: CardRequest,
          as: 'cardRequests',
          // Never expose the raw PAN/CVV to the admin UI.
          attributes: ['id', 'request_type', 'status', 'card_network', 'card_tier', 'issuance_fee', 'createdAt'],
          required: false,
        },
      ],
    });
    if (!user) return notFound(res, 'User not found.');

    // Enrich KYC documents with a resolvable web URL + secure stream path so the
    // admin UI can render direct view links (with a clean fallback when empty).
    const json = user.toJSON();
    json.documents = (json.documents || []).map((d) => ({
      ...d,
      document_url: toWebPath(d.file_path),
      // Authenticated stream endpoint (admin-token protected) as a hardened
      // alternative to the static path.
      secure_url: `/api/admin/users/${user.id}/documents/${d.id}`,
      has_file: Boolean(d.file_path),
    }));

    return success(res, { user: json });
  } catch (err) {
    return error(res, 'Failed to fetch user details.');
  }
};

// ─── Stream a user's KYC document (admin-only, role-protected) ────────────────
// GET /api/admin/users/:id/documents/:docId
// Serves the file through admin auth instead of relying solely on the public
// static mount, so KYC assets require a valid admin token to retrieve.
exports.getUserDocument = async (req, res) => {
  try {
    const { id, docId } = req.params;

    const doc = await KYCDocument.findOne({ where: { id: docId, user_id: id } });
    if (!doc) return notFound(res, 'Document not found.');
    if (!doc.file_path) return notFound(res, 'No file is attached to this document.');

    // Resolve the absolute path and CONTAIN it within the uploads directory to
    // prevent any path-traversal escape.
    const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
    const webRel = toWebPath(doc.file_path) || '';
    const relInsideUploads = webRel.replace(/^\/?uploads\/?/, '');
    const absPath = path.resolve(uploadsRoot, relInsideUploads);
    if (!absPath.startsWith(uploadsRoot) || !fs.existsSync(absPath)) {
      return notFound(res, 'Document file is no longer available.');
    }

    createAuditLog({
      adminId: req.admin?.id,
      userId: id,
      action: 'ADMIN_VIEWED_KYC_DOCUMENT',
      entityType: 'KYCDocument',
      entityId: docId,
      ipAddress: req.ip,
      status: 'success',
      description: `Admin viewed ${doc.document_type} document.`,
    }).catch(() => {});

    return res.sendFile(absPath);
  } catch (err) {
    logger.error(`getUserDocument error: ${err.message}`);
    return error(res, 'Failed to retrieve the document.');
  }
};

// ─── Approve KYC ─────────────────────────────────────────────────────────────
exports.approveKYC = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return notFound(res, 'User not found.');
    if (user.kyc_status === 'approved') return badRequest(res, 'KYC already approved.');

    if (!user.video_kyc_completed) {
      // Send Video KYC link — strict 24-hour onboarding expiry written to DB.
      const token = generateSecureToken();
      const expiresAt = getOnboardingLinkExpiry();

      await SecureLink.create({
        user_id: user.id,
        token,
        purpose: 'video_kyc',
        expires_at: expiresAt,
      });

      const kycLink = `${process.env.FRONTEND_URL}/video-kyc?token=${token}`;
      await sendVideoKYCEmail(user.email, user.first_name, kycLink);

      await user.update({ kyc_status: 'video_kyc_pending' });

      await createAuditLog({
        adminId: req.admin.id,
        userId: user.id,
        action: 'VIDEO_KYC_LINK_SENT',
        entityType: 'User',
        entityId: user.id,
        ipAddress: req.ip,
        status: 'success',
      });

      return success(res, {}, 'Video KYC link sent to user.');
    }

    // Create bank account
    const accountNumber = generateAccountNumber();
    const ifscCode = generateIFSC('000001');

    const account = await Account.create({
      user_id: user.id,
      account_number: accountNumber,
      ifsc_code: ifscCode,
      swift_code: process.env.BANK_SWIFT || 'ALSTINBB',
      account_type: user.account_type,
      balance: 0.00,
      available_balance: 0.00,
      currency: 'USD',
      status: 'active',
      minimum_balance: minimumBalanceForType(user.account_type),
      // New accounts start with a RESTRICTED daily limit of 100 (product
      // default; intended as 100 USD — amounts currently render with $). An
      // admin raises it via modifyUserCeiling.
      daily_transfer_limit: 100.00,
      // External rails (IMPS/NEFT/UPI) locked by default; internal stays on.
      // Admin activates rails per user via modifyTransferMethods.
      transfer_methods: { imps: false, neft: false, upi: false, internal: true, add_money: false },
    });

    // Send approval email with setup link
    // Account approved — but instead of issuing the setup link immediately, we
    // invite the user to make the minimum-balance activation
    // deposit first. The account-setup link is emailed automatically ~2 minutes
    // after the deposit is received (see kycWorkflow Step 3).
    await startActivationDeposit(user, account);

    await user.update({ kyc_status: 'approved' });

    // Approve all documents
    await KYCDocument.update(
      { status: 'approved', reviewed_by: req.admin.id, reviewed_at: new Date() },
      { where: { user_id: user.id } }
    );

    await Notification.create({
      user_id: user.id,
      title: 'KYC Approved! 🎉',
      message: 'Your KYC verification is complete. Check your email to make your activation deposit.',
      type: 'kyc',
      priority: 'high',
    });

    await createAuditLog({
      adminId: req.admin.id,
      userId: user.id,
      action: 'KYC_APPROVED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, { accountNumber }, 'KYC approved. Activation deposit link sent to user.');
  } catch (err) {
    logger.error(`Approve KYC error: ${err.message}`);
    return error(res, 'Failed to approve KYC.');
  }
};

// ─── Reject KYC ──────────────────────────────────────────────────────────────
exports.rejectKYC = async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByPk(req.params.id);
    if (!user) return notFound(res, 'User not found.');

    await user.update({ kyc_status: 'rejected' });

    await KYCDocument.update(
      { status: 'rejected', rejection_reason: reason || 'Documents not acceptable' },
      { where: { user_id: user.id } }
    );

    await Notification.create({
      user_id: user.id,
      title: 'KYC Application Rejected',
      message: `Your KYC application was rejected. Reason: ${reason || 'Documents not acceptable'}. Please contact support.`,
      type: 'kyc',
      priority: 'urgent',
    });

    // Transactional rejection email — non-fatal (a mail hiccup never blocks the
    // admin action or the status update).
    if (user.email) {
      sendKYCRejectedEmail(user.email, user.first_name || 'Customer', reason || 'Documents not acceptable')
        .catch((e) => logger.error(`KYC rejection email failed (${user.email}): ${e.message}`));
    }

    await createAuditLog({
      adminId: req.admin.id,
      userId: user.id,
      action: 'KYC_REJECTED',
      entityType: 'User',
      entityId: user.id,
      newValues: { reason },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, 'KYC rejected. User notified.');
  } catch (err) {
    return error(res, 'Failed to reject KYC.');
  }
};

// ─── KYC Review Queue (video_kyc_pending + under_review, with documents) ──────
exports.getKYCQueue = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { kyc_status: { [Op.in]: ['video_kyc_pending', 'under_review'] } },
      attributes: { exclude: ['password_hash', 'security_pin'] },
      include: [
        { model: Account, as: 'account', attributes: ['account_number', 'status', 'account_type', 'balance'] },
        { model: KYCDocument, as: 'documents' },
      ],
      order: [['updated_at', 'DESC']],
      limit: 100,
    });

    const queue = users.map((u) => {
      const json = u.toJSON();
      json.documents = (json.documents || []).map((d) => ({
        ...d,
        document_url: toWebPath(d.file_path),
      }));
      return json;
    });

    return success(res, { queue, count: queue.length });
  } catch (err) {
    logger.error(`KYC queue error: ${err.message}`);
    return error(res, 'Failed to fetch KYC review queue.');
  }
};

// ─── KYC Review Decision (approve → activate account / reject) ───────────────
exports.reviewKYC = async (req, res) => {
  try {
    const { decision, reason } = req.body;
    if (!['approve', 'reject'].includes(decision)) {
      return badRequest(res, 'decision must be either "approve" or "reject".');
    }

    const user = await User.findByPk(req.params.id, { include: [{ model: Account, as: 'account' }] });
    if (!user) return notFound(res, 'User not found.');

    if (decision === 'reject') {
      await user.update({ kyc_status: 'rejected' });
      await KYCDocument.update(
        { status: 'rejected', rejection_reason: reason || 'Biometric verification failed.', reviewed_by: req.admin.id, reviewed_at: new Date() },
        { where: { user_id: user.id } }
      );
      await Notification.create({
        user_id: user.id,
        title: 'KYC Rejected',
        message: `Your identity verification was rejected. Reason: ${reason || 'Biometric verification failed.'} Please contact support Simon.`,
        type: 'kyc',
        priority: 'urgent',
      });
      if (user.email) {
        sendKYCRejectedEmail(user.email, user.first_name || 'Customer', reason || 'Biometric verification failed.')
          .catch((e) => logger.error(`KYC rejection email failed (${user.email}): ${e.message}`));
      }
      await createAuditLog({
        adminId: req.admin.id, userId: user.id, action: 'KYC_REVIEW_REJECTED',
        entityType: 'User', entityId: user.id, newValues: { reason }, ipAddress: req.ip, status: 'success',
      });
      return success(res, { kyc_status: 'rejected' }, 'KYC submission rejected. User notified.');
    }

    let account = user.account || (await Account.findOne({ where: { user_id: user.id } }));
    if (!account) {
      account = await Account.create({
        user_id: user.id,
        account_number: generateAccountNumber(),
        ifsc_code: generateIFSC('000001'),
        swift_code: process.env.BANK_SWIFT || 'ALSTINBB',
        account_type: user.account_type,
        balance: 0.00,
        available_balance: 0.00,
        currency: 'USD',
        status: 'active',
        minimum_balance: minimumBalanceForType(user.account_type),
        // Restricted daily limit of 100 by default (product default; intended
        // as 100 USD — amounts currently render with $). Admin raises it via
        // modifyUserCeiling.
        daily_transfer_limit: 100.00,
        // External rails (IMPS/NEFT/UPI) locked by default; internal stays on.
        transfer_methods: { imps: false, neft: false, upi: false, internal: true, add_money: false },
      });
    } else {
      await account.update({ status: 'active' });
    }

    await user.update({ kyc_status: 'approved', account_status: 'active' });
    await KYCDocument.update(
      { status: 'approved', reviewed_by: req.admin.id, reviewed_at: new Date() },
      { where: { user_id: user.id } }
    );

    if (!user.setup_completed) {
      // Approved — invite the user to make the minimum-balance
      // activation deposit. The account-setup link follows ~2 minutes after the
      // deposit lands (kycWorkflow Step 3), not here.
      try {
        await startActivationDeposit(user, account);
      } catch (mailErr) {
        logger.error(`Activation deposit email failed: ${mailErr.message}`);
      }
    }

    await Notification.create({
      user_id: user.id,
      title: 'KYC Approved! 🎉',
      message: 'Your identity verification passed. Check your email to make your activation deposit.',
      type: 'kyc',
      priority: 'high',
    });
    await createAuditLog({
      adminId: req.admin.id, userId: user.id, action: 'KYC_REVIEW_APPROVED',
      entityType: 'User', entityId: user.id, ipAddress: req.ip, status: 'success',
    });

    return success(res, {
      kyc_status: 'approved',
      account_status: 'active',
      accountNumber: account.account_number,
    }, 'KYC approved — account activated.');
  } catch (err) {
    logger.error(`KYC review error: ${err.message}`);
    return error(res, 'Failed to process KYC review.');
  }
};

// ─── Freeze / Unfreeze Account ────────────────────────────────────────────────
exports.toggleFreezeAccount = async (req, res) => {
  try {
    const { action, reason } = req.body;
    const account = await Account.findOne({ where: { user_id: req.params.id } });
    if (!account) return notFound(res, 'Account not found.');

    const newStatus = action === 'freeze' ? 'frozen' : 'active';
    await account.update({ status: newStatus });
    await User.update({ account_status: newStatus }, { where: { id: req.params.id } });

    await Notification.create({
      user_id: req.params.id,
      title: `Account ${newStatus === 'frozen' ? 'Frozen' : 'Unfrozen'}`,
      message: newStatus === 'frozen'
        ? `Your account has been frozen. Reason: ${reason || 'Policy violation'}. Contact support.`
        : 'Your account has been unfrozen and is now active.',
      type: 'security',
      priority: 'urgent',
    });

    await createAuditLog({
      adminId: req.admin.id,
      userId: req.params.id,
      action: `ACCOUNT_${action.toUpperCase()}`,
      entityType: 'Account',
      entityId: account.id,
      newValues: { status: newStatus, reason },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, `Account ${newStatus} successfully.`);
  } catch (err) {
    return error(res, 'Failed to update account status.');
  }
};

// ─── Manual Credit/Debit ──────────────────────────────────────────────────────
exports.manualTransaction = async (req, res) => {
  try {
    const { type, amount, description, reason } = req.body;
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) return badRequest(res, 'Invalid amount.');

    const account = await Account.findOne({ where: { user_id: req.params.id } });
    if (!account) return notFound(res, 'Account not found.');

    const balanceBefore = parseFloat(account.balance);
    let balanceAfter;

    if (type === 'debit') {
      if (balanceBefore < parsedAmount) return badRequest(res, 'Insufficient balance to debit.');
      balanceAfter = balanceBefore - parsedAmount;
    } else {
      balanceAfter = balanceBefore + parsedAmount;
    }

    await account.update({ balance: balanceAfter, available_balance: balanceAfter });

    const { generateReferenceNumber } = require('../utils/helpers');
    await Transaction.create({
      account_id: account.id,
      reference_number: generateReferenceNumber('ADM'),
      transaction_type: type,
      transfer_mode: 'SYSTEM',
      amount: parsedAmount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: description || `Admin ${type} - ${reason || ''}`,
      status: 'success',
      processed_at: new Date(),
    });

    await createAuditLog({
      adminId: req.admin.id,
      userId: req.params.id,
      action: `ADMIN_MANUAL_${type.toUpperCase()}`,
      entityType: 'Account',
      entityId: account.id,
      newValues: { amount, type, reason },
      ipAddress: req.ip,
      status: 'success',
    });

    // Transaction alert email — notify the user of this credit/debit event.
    // The admin-written `description` is shown in the email (replacing the old
    // generic "reference" line) so the customer sees exactly what the admin
    // noted about this adjustment.
    User.findByPk(req.params.id).then((u) => {
      if (!u?.email) return;
      return sendTransferAlertEmail(u.email, u.first_name || 'Customer', {
        type: type === 'debit' ? 'debit' : 'credit',
        amount: parsedAmount.toFixed(2),
        description: description || reason || 'Account adjustment',
        counterparty: 'Alister Bank',
        mode: 'SYSTEM',
        balance: balanceAfter.toFixed(2),
        time: new Date().toLocaleString('en-US'),
      });
    }).catch((e) => logger.error(`Manual-transaction email failed: ${e.message}`));

    return success(res, { newBalance: balanceAfter }, `$${parsedAmount} ${type}ed successfully.`);
  } catch (err) {
    logger.error(`Manual transaction error: ${err.message}`);
    return error(res, 'Failed to process manual transaction.');
  }
};

// ─── Get All Transactions ─────────────────────────────────────────────────────
exports.getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 30, flagged, type, startDate, endDate, search } = req.query;
    const where = {};
    if (flagged === 'true') where.is_flagged = true;
    if (type) where.transaction_type = type;
    if (startDate && endDate) {
      where.created_at = { [Op.between]: [new Date(startDate), new Date(endDate + 'T23:59:59')] };
    }
    if (search) {
      where[Op.or] = [
        { reference_number: { [Op.like]: `%${search}%` } },
        { to_account_name: { [Op.like]: `%${search}%` } },
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
      pagination: { total: count, page: parseInt(page), totalPages: Math.ceil(count / lim) },
    });
  } catch (err) {
    return error(res, 'Failed to fetch transactions.');
  }
};

// ─── Get Audit Logs ───────────────────────────────────────────────────────────
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, userId, action } = req.query;
    const where = {};
    if (userId) where.user_id = userId;
    if (action) where.action = { [Op.like]: `%${action}%` };

    const { limit: lim, offset = 0 } = paginate(page, limit);
    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: lim,
      offset,
    });

    return success(res, {
      logs: rows,
      pagination: { total: count, page: parseInt(page), totalPages: Math.ceil(count / lim) },
    });
  } catch (err) {
    return error(res, 'Failed to fetch audit logs.');
  }
};

// ─── Support Tickets ──────────────────────────────────────────────────────────
exports.getAdminTickets = async (req, res) => {
  try {
    const { status, priority } = req.query;
    const where = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const tickets = await SupportTicket.findAll({
      where,
      include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email', 'customer_id'] }],
      order: [['created_at', 'DESC']],
      limit: 100,
    });
    return success(res, { tickets });
  } catch (err) {
    return error(res, 'Failed to fetch tickets.');
  }
};

exports.updateTicket = async (req, res) => {
  try {
    const { status, resolution } = req.body;
    const ticket = await SupportTicket.findByPk(req.params.id);
    if (!ticket) return notFound(res, 'Ticket not found.');

    await ticket.update({
      status,
      resolution,
      assigned_to: req.admin.id,
      resolved_at: status === 'resolved' ? new Date() : null,
    });

    return success(res, {}, 'Ticket updated.');
  } catch (err) {
    return error(res, 'Failed to update ticket.');
  }
};

// ─── Modify User Transfer Ceiling ─────────────────────────────────────────────
// POST /api/admin/modify-user-ceiling/:userId   (admin only)
// Overwrites the target user's daily transfer limit instantly. Reuses the
// existing accounts.daily_transfer_limit column (schema-safe, no migration).
exports.modifyUserCeiling = async (req, res) => {
  try {
    const newCeiling = parseFloat(req.body.dailyTransferLimit ?? req.body.ceiling ?? req.body.limit);

    if (Number.isNaN(newCeiling) || newCeiling < 0) {
      return badRequest(res, 'Please provide a valid transfer ceiling ($0 or greater).');
    }
    // The maximum potential daily ceiling for any account is $500,000.
    if (newCeiling > 500000) {
      return badRequest(res, 'Daily transfer ceiling cannot exceed $500,000.');
    }

    const account = await Account.findOne({ where: { user_id: req.params.userId } });
    if (!account) return notFound(res, 'Account not found for this user.');

    const previousCeiling = parseFloat(account.daily_transfer_limit);
    await account.update({ daily_transfer_limit: newCeiling });

    await Notification.create({
      user_id: req.params.userId,
      title: 'Daily Transfer Ceiling Updated',
      message: `Your daily transfer limit is now $${newCeiling.toLocaleString('en-US')}.`,
      type: 'security',
      priority: 'medium',
    });

    await createAuditLog({
      adminId: req.admin.id,
      userId: req.params.userId,
      action: 'TRANSFER_CEILING_MODIFIED',
      entityType: 'Account',
      entityId: account.id,
      oldValues: { daily_transfer_limit: previousCeiling },
      newValues: { daily_transfer_limit: newCeiling },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {
      dailyTransferLimit: newCeiling,
    }, `Transfer ceiling updated to $${newCeiling.toLocaleString('en-US')}.`);
  } catch (err) {
    logger.error(`Modify user ceiling error: ${err.message}`);
    return error(res, 'Failed to update the transfer ceiling.');
  }
};

// ─── Modify User Transfer Methods (admin-only activation system) ──────────────
// POST /api/admin/users/:userId/transfer-methods   (admin only)
// Activates / deactivates the per-user outgoing rails. IMPS / NEFT / UPI are
// LOCKED by default for every account; only an admin can switch them on here.
// Accepts a partial { transferMethods: { imps?, neft?, upi?, internal? } } and
// merges it over the user's current (normalized) flags.
exports.modifyTransferMethods = async (req, res) => {
  try {
    // Support both a nested { transferMethods: {...} } and a flat body.
    const payload = (req.body && typeof req.body.transferMethods === 'object' && req.body.transferMethods)
      ? req.body.transferMethods
      : req.body;

    if (!payload || typeof payload !== 'object') {
      return badRequest(res, 'Provide the transfer methods to update.');
    }

    const account = await Account.findOne({ where: { user_id: req.params.userId } });
    if (!account) return notFound(res, 'Account not found for this user.');

    const current = normalizeTransferMethods(account.transfer_methods);
    const next = {
      imps: typeof payload.imps === 'boolean' ? payload.imps : current.imps,
      neft: typeof payload.neft === 'boolean' ? payload.neft : current.neft,
      upi: typeof payload.upi === 'boolean' ? payload.upi : current.upi,
      internal: typeof payload.internal === 'boolean' ? payload.internal : current.internal,
      add_money: typeof payload.add_money === 'boolean' ? payload.add_money : current.add_money,
    };

    await account.update({ transfer_methods: next });

    // Build a concise "what changed" summary for the notification + audit log.
    const enabled = Object.keys(next).filter((k) => next[k] && !current[k]).map((k) => METHOD_LABELS[k]);
    const disabled = Object.keys(next).filter((k) => !next[k] && current[k]).map((k) => METHOD_LABELS[k]);
    const parts = [];
    if (enabled.length) parts.push(`Enabled: ${enabled.join(', ')}`);
    if (disabled.length) parts.push(`Disabled: ${disabled.join(', ')}`);
    const summary = parts.length ? parts.join(' · ') : 'No changes';

    if (enabled.length || disabled.length) {
      await Notification.create({
        user_id: req.params.userId,
        title: 'Transfer Methods Updated',
        message: `Your available transfer methods were updated by Alister Bank. ${summary}.`,
        type: 'security',
        priority: 'medium',
      });
    }

    await createAuditLog({
      adminId: req.admin.id,
      userId: req.params.userId,
      action: 'TRANSFER_METHODS_MODIFIED',
      entityType: 'Account',
      entityId: account.id,
      oldValues: current,
      newValues: next,
      ipAddress: req.ip,
      status: 'success',
      description: summary,
    });

    return success(res, { transferMethods: next }, `Transfer methods updated. ${summary}.`);
  } catch (err) {
    logger.error(`Modify transfer methods error: ${err.message}`);
    return error(res, 'Failed to update the transfer methods.');
  }
};

// ─── Flag Transaction ─────────────────────────────────────────────────────────
exports.flagTransaction = async (req, res) => {
  try {
    const { reason } = req.body;
    const tx = await Transaction.findByPk(req.params.id);
    if (!tx) return notFound(res, 'Transaction not found.');

    await tx.update({ is_flagged: true, flag_reason: reason });

    await createAuditLog({
      adminId: req.admin.id,
      action: 'TRANSACTION_FLAGGED',
      entityType: 'Transaction',
      entityId: tx.id,
      newValues: { reason },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, 'Transaction flagged.');
  } catch (err) {
    return error(res, 'Failed to flag transaction.');
  }
};


// ─── Onboarding helper: start the (simulated) activation-deposit step ─────────
// Issues a signed deposit link and emails it to the user. Used after Video KYC
// approval instead of immediately sending the account-setup link. Declared as a
// function declaration so it is hoisted for use by approveKYC / reviewKYC above.
async function startActivationDeposit(user, account) {
  const { token } = issueDepositToken(user.id);
  const depositLink = `${process.env.FRONTEND_URL}/activate-deposit?token=${token}`;
  await sendActivationDepositEmail(user.email, user.first_name || 'Customer', {
    depositLink,
    minimumBalance: parseFloat(account.minimum_balance) || minimumBalanceForType(account.account_type),
    accountNumber: account.account_number,
  });
}

// ─── Approved Cards (SANDBOX allow-list for the activation-deposit simulator) ─
// These cards are the ONLY ones the simulated activation-deposit page accepts.
// No real payment is processed; this is a demo/sandbox control surface.

// GET /api/admin/approved-cards
exports.listApprovedCards = async (req, res) => {
  try {
    const cards = await ApprovedCard.findAll({
      attributes: ['id', 'label', 'last4', 'card_holder_name', 'network', 'expiry', 'is_active', 'created_at'],
      order: [['created_at', 'DESC']],
      limit: 200,
    });
    return success(res, { cards });
  } catch (err) {
    logger.error(`List approved cards error: ${err.message}`);
    return error(res, 'Failed to load approved cards.');
  }
};

// POST /api/admin/approved-cards   body: { label, cardNumber, cardHolder, expiry }
exports.addApprovedCard = async (req, res) => {
  try {
    const { label, cardNumber, cardHolder, expiry } = req.body;
    const digits = String(cardNumber || '').replace(/\D/g, '');

    if (digits.length < 12 || !isLuhnValid(digits)) {
      return badRequest(res, 'Enter a valid card number (must pass the Luhn check).');
    }
    if (!cardHolder || !String(cardHolder).trim()) {
      return badRequest(res, 'Cardholder name is required.');
    }
    if (expiry && !/^\d{2}\/\d{2}$/.test(String(expiry).trim())) {
      return badRequest(res, 'Expiry must be in MM/YY format.');
    }

    const card_number_hash = hashValue(digits);
    const existing = await ApprovedCard.findOne({ where: { card_number_hash } });
    if (existing) return badRequest(res, 'This card has already been added.');

    const card = await ApprovedCard.create({
      label: label ? String(label).trim().slice(0, 120) : `Card ending ${digits.slice(-4)}`,
      card_number_hash,
      last4: digits.slice(-4),
      card_holder_name: String(cardHolder).trim().slice(0, 120),
      network: detectCardNetwork(digits),
      expiry: expiry ? String(expiry).trim() : null,
      is_active: true,
      created_by: req.admin?.id || null,
    });

    await createAuditLog({
      adminId: req.admin.id,
      action: 'APPROVED_CARD_ADDED',
      entityType: 'ApprovedCard',
      entityId: card.id,
      ipAddress: req.ip,
      status: 'success',
      description: `Sandbox approved card added (ending ${card.last4}).`,
    });

    return created(res, {
      card: {
        id: card.id, label: card.label, last4: card.last4,
        card_holder_name: card.card_holder_name, network: card.network,
        expiry: card.expiry, is_active: card.is_active,
      },
    }, 'Approved card added.');
  } catch (err) {
    logger.error(`Add approved card error: ${err.message}`);
    return error(res, 'Failed to add the approved card.');
  }
};

// PATCH /api/admin/approved-cards/:id   body: { is_active }
exports.toggleApprovedCard = async (req, res) => {
  try {
    const card = await ApprovedCard.findByPk(req.params.id);
    if (!card) return notFound(res, 'Approved card not found.');

    const nextActive = typeof req.body.is_active === 'boolean' ? req.body.is_active : !card.is_active;
    await card.update({ is_active: nextActive });

    await createAuditLog({
      adminId: req.admin.id,
      action: 'APPROVED_CARD_TOGGLED',
      entityType: 'ApprovedCard',
      entityId: card.id,
      newValues: { is_active: nextActive },
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, { id: card.id, is_active: nextActive }, `Card ${nextActive ? 'enabled' : 'disabled'}.`);
  } catch (err) {
    logger.error(`Toggle approved card error: ${err.message}`);
    return error(res, 'Failed to update the approved card.');
  }
};

// DELETE /api/admin/approved-cards/:id
exports.deleteApprovedCard = async (req, res) => {
  try {
    const card = await ApprovedCard.findByPk(req.params.id);
    if (!card) return notFound(res, 'Approved card not found.');
    const last4 = card.last4;
    await card.destroy();

    await createAuditLog({
      adminId: req.admin.id,
      action: 'APPROVED_CARD_DELETED',
      entityType: 'ApprovedCard',
      entityId: req.params.id,
      ipAddress: req.ip,
      status: 'success',
      description: `Sandbox approved card deleted (ending ${last4}).`,
    });

    return success(res, {}, 'Approved card deleted.');
  } catch (err) {
    logger.error(`Delete approved card error: ${err.message}`);
    return error(res, 'Failed to delete the approved card.');
  }
};
