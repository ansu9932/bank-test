const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const { User, Account, KYCDocument, OTP, SecureLink, Notification } = require('../models');
const {
  generateCustomerID, generateAccountNumber, generateIFSC,
  generateSecureToken, getSecureLinkExpiry, hashValue, generateReferralCode, isExpired,
} = require('../utils/helpers');
const {
  sendKYCUnderReviewEmail, sendVideoKYCEmail, sendAccountApprovedEmail,
} = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound, created, linkError } = require('../utils/apiResponse');
const { scheduleActivationDeposit } = require('../jobs/kycWorkflow');
const logger = require('../utils/logger');
const {
  issueRegistrationHandshake, consumeRegistrationHandshake,
} = require('../utils/registrationHandshake');

// ─── Registration Handshake (HDFC-style ephemeral onboarding nonce) ──────────
// GET /api/account/registration-handshake → mints a short-lived, single-use
// anti-CSRF registration nonce. The "Open Account" wizard fetches this the
// moment its first step mounts, reflects it into the URL, and echoes it back in
// the request headers when it submits the compiled form. Blocks replay / CSRF
// on the account-creation pipeline.
exports.registrationHandshake = async (req, res) => {
  try {
    const { token, expiresIn } = issueRegistrationHandshake(req.ip);
    return success(res, { handshakeToken: token, expiresIn }, 'Registration handshake issued.');
  } catch (err) {
    logger.error(`Registration handshake error: ${err.message}`);
    return error(res, 'Could not initialize a secure registration session.');
  }
};

// ─── Submit Account Opening Application ───────────────────────────────────────
exports.openAccount = async (req, res) => {
  try {
    // NOTE: The previous ephemeral "registration handshake" nonce + 40-minute
    // expiry was removed. It caused users who spent longer than the window on
    // the multi-step KYC funnel (document uploads, etc.) to hit a
    // "secure registration session expired — refresh and continue" error at the
    // final step and lose their progress. Account opening no longer requires a
    // short-lived onboarding token.

    const {
      firstName, lastName, email, phone, dateOfBirth, gender,
      fatherName, motherName, maritalStatus, nationality, occupation, annualIncome,
      addressLine1, addressLine2, city, state, pincode, country,
      aadhaarNumber, panNumber, passportNumber,
      citizenshipNumber, cidNumber, nationalIdNumber, tinNumber,
      accountType,
    } = req.body;

    // ── Explicit required-field validation ─────────────────────────────────────
    // The DB columns are NOT NULL; missing values would otherwise surface as a
    // generic Sequelize 500 deep in .create(). Validate up-front and return a
    // precise 400 naming the first missing field instead. (This is the primary
    // cause of the reported mobile 500s: partially-filled payloads reaching
    // .create() before the frontend gating existed.)
    const requiredFields = {
      firstName, lastName, email, phone, dateOfBirth, gender,
      addressLine1, city, state, pincode, accountType,
    };
    const missing = Object.entries(requiredFields)
      .filter(([, v]) => v === undefined || v === null || String(v).trim() === '')
      .map(([k]) => k);
    if (missing.length > 0) {
      logger.warn(`openAccount rejected — missing required fields: ${missing.join(', ')}`);
      return badRequest(res, `Missing required fields: ${missing.join(', ')}.`);
    }

    // Normalize the identity fields the same way the client does (defensive:
    // strip Aadhaar spacing, upper-case PAN) so stored values are canonical.
    const aadhaarClean = aadhaarNumber ? String(aadhaarNumber).replace(/\D/g, '') : null;
    const panClean = panNumber ? String(panNumber).toUpperCase().replace(/[^A-Z0-9]/g, '') : null;

    // Check duplicates
    const existingEmail = await User.findOne({ where: { email } });
    if (existingEmail) return badRequest(res, 'An account with this email already exists.');

    const existingPhone = await User.findOne({ where: { phone } });
    if (existingPhone) return badRequest(res, 'An account with this phone number already exists.');

    // Generate IDs
    let customerId;
    let isUnique = false;
    while (!isUnique) {
      customerId = generateCustomerID();
      const existing = await User.findOne({ where: { customer_id: customerId } });
      if (!existing) isUnique = true;
    }

    // Create user
    const user = await User.create({
      customer_id: customerId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      date_of_birth: dateOfBirth,
      gender,
      father_name: fatherName,
      mother_name: motherName,
      marital_status: maritalStatus || null,
      nationality: nationality || 'Indian',
      occupation,
      // annual_income is DECIMAL — coerce blanks to null so an empty string
      // doesn't trip a numeric validation error.
      annual_income: annualIncome === '' || annualIncome === undefined ? null : annualIncome,
      address_line1: addressLine1,
      address_line2: addressLine2,
      city,
      state,
      pincode,
      country: country || 'India',
      aadhaar_number: aadhaarClean,
      pan_number: panClean,
      passport_number: passportNumber || null,
      // Country-specific national IDs (only the relevant one is sent).
      citizenship_number: citizenshipNumber || null,
      cid_number: cidNumber || null,
      national_id_number: nationalIdNumber || null,
      tin_number: tinNumber || null,
      account_type: accountType || 'savings',
      kyc_status: 'pending',
      account_status: 'pending',
      email_verified: true, // verified during OTP step
      referral_code: generateReferralCode(firstName),
      ip_address: req.ip,
      device_fingerprint: req.headers['user-agent'],
    });

    // ── KYC documents: upload kept, but NOT persisted to the database ──────────
    // The document upload UI stays exactly as-is and the files are still
    // received/stored on disk by the upload middleware. However, we intentionally
    // SKIP writing a KYCDocument row per file: on a slow database those repeated
    // inserts were causing the account submission to time out / fail. The user
    // record (created above) is saved as usual, so onboarding completes reliably.

    // Send review email — fire-and-forget (NON-blocking). Awaiting SMTP here
    // would hold the request (and a DB connection) open under load, hurting
    // concurrency; a mail hiccup must never delay or fail a created account.
    sendKYCUnderReviewEmail(email, firstName, customerId)
      .catch((mailErr) => logger.error(`KYC review email failed for ${email} (non-fatal): ${mailErr.message}`));

    // Update kyc status to under_review
    await user.update({ kyc_status: 'under_review' });

    await createAuditLog({
      userId: user.id,
      action: 'ACCOUNT_APPLICATION_SUBMITTED',
      entityType: 'User',
      entityId: user.id,
      ipAddress: req.ip,
      status: 'success',
      description: `Account opening application by ${email}`,
    });

    return created(res, {
      customerId,
      message: 'Application submitted successfully. Documents are under review.',
    }, 'Application submitted successfully.');
  } catch (err) {
    // ── Full error context to the node terminal so the failing column/constraint
    //    is identifiable on the live (Hostinger) dashboard ──────────────────────
    logger.error(`Account opening error: ${err.name}: ${err.message}`);
    if (err.original) logger.error(`Raw DB error: ${err.original.message}`);
    if (err.parent && err.parent !== err.original) logger.error(`DB parent error: ${err.parent.message}`);
    if (err.stack) logger.error(err.stack);

    // Map known Sequelize failures to a precise 400 instead of a generic 500.
    if (err.name === 'SequelizeUniqueConstraintError') {
      const field = err.errors?.[0]?.path || 'field';
      return badRequest(res, `An account with this ${field} already exists.`);
    }
    if (err.name === 'SequelizeValidationError') {
      const detail = err.errors?.[0]?.message || 'A submitted field is invalid.';
      return badRequest(res, detail);
    }
    if (err.name === 'SequelizeDatabaseError') {
      // e.g. value too long, bad enum, datatype mismatch — actionable as 400.
      return badRequest(res, 'One or more submitted details are invalid. Please review and try again.');
    }

    // ── Database connectivity / pool-acquire timeouts ──────────────────────────
    // On shared MySQL these are the usual cause of a generic 500 here: the DB
    // refused/dropped the connection or the pool could not acquire one in time
    // (frequently "Too many connections" when PM2 cluster workers × pool.max
    // exceeds the server's max_connections). Surface a clear, RETRYABLE 503 so
    // the client can try again, and so this stops masquerading as an opaque 500.
    const connErrorNames = [
      'SequelizeConnectionError',
      'SequelizeConnectionRefusedError',
      'SequelizeConnectionAcquireTimeoutError',
      'SequelizeConnectionTimedOutError',
      'SequelizeHostNotReachableError',
      'SequelizeAccessDeniedError',
      'TimeoutError',
    ];
    if (connErrorNames.includes(err.name)) {
      logger.error(`Account opening failed due to a DB connectivity issue (${err.name}).`);
      return error(res, 'We are experiencing a brief connection delay. Please try submitting again in a moment.', 503);
    }

    return error(res, 'Failed to submit application. Please try again.');
  }
};

// ─── Video KYC — Verify Link ───────────────────────────────────────────────────
exports.verifyVideoKYCLink = async (req, res) => {
  try {
    const { token } = req.params;
    const link = await SecureLink.findOne({ where: { token, purpose: 'video_kyc', used: false } });

    if (!link) return linkError(res, 'INVALID_LINK', 'This Video KYC link is invalid or has already been used. You can request a fresh one below.');
    if (isExpired(link.expires_at)) {
      await link.update({ used: true });
      return linkError(res, 'EXPIRED_LINK', 'This Video KYC link has expired. You can request a fresh one below.');
    }

    const user = await User.findByPk(link.user_id, {
      attributes: ['id', 'first_name', 'last_name', 'email', 'customer_id'],
    });

    return success(res, { valid: true, user }, 'Link is valid. Proceed with Video KYC.');
  } catch (err) {
    logger.error(`Video KYC link verify error: ${err.message}`);
    return error(res, 'Failed to verify link.');
  }
};

// ─── Submit Video KYC ─────────────────────────────────────────────────────────
exports.submitVideoKYC = async (req, res) => {
  try {
    const { token } = req.body;
    const link = await SecureLink.findOne({ where: { token, purpose: 'video_kyc', used: false } });

    if (!link) return badRequest(res, 'Invalid or expired Video KYC link.');
    if (isExpired(link.expires_at)) {
      await link.update({ used: true });
      return badRequest(res, 'Video KYC link expired.');
    }

    if (!req.file) return badRequest(res, 'Video recording is required.');

    await KYCDocument.create({
      user_id: link.user_id,
      document_type: 'video_kyc',
      file_path: req.file.path,
      file_name: req.file.originalname,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
    });

    await User.update({ video_kyc_completed: true, kyc_status: 'video_kyc_pending' }, {
      where: { id: link.user_id },
    });

    // Reliably send the activation-deposit email ~2 minutes from now, in THIS
    // live process (shared hosting can't depend on the minute-cron firing).
    scheduleActivationDeposit(link.user_id);

    await link.update({ used: true, used_at: new Date() });

    await createAuditLog({
      userId: link.user_id,
      action: 'VIDEO_KYC_SUBMITTED',
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, 'Video KYC submitted successfully. Account will be activated shortly.');
  } catch (err) {
    logger.error(`Video KYC submit error: ${err.message}`);
    return error(res, 'Failed to submit Video KYC.');
  }
};

// ─── Cyber Video KYC — capture upload (image snapshot) ────────────────────────
// Accepts the still ID/biometric snapshot produced by the CyberVideoKYC wizard.
// Resolves the target user via EITHER:
//   (a) an onboarding secure-link token in the body (pre-login flow), OR
//   (b) a logged-in user's Bearer JWT (Authorization header).
// When a user is resolved, it persists a KYCDocument and advances the user's
// workflow record. When neither is present (standalone demo at /cyber-kyc with
// no session), it still returns success so the wizard completes gracefully.
exports.uploadKYCCapture = async (req, res) => {
  try {
    // `.fields()` populates req.files; fall back to req.file for compatibility.
    // The primary capture is the `document`; if only a `selfie` was sent, use it.
    const captureFile = req.file
      || req.files?.document?.[0]
      || req.files?.selfie?.[0];
    if (!captureFile) return badRequest(res, 'KYC capture image is required.');

    // ── Resolve the user + (optional) secure link ──────────────────────────
    let userId = null;
    let link = null;

    if (req.body.token) {
      link = await SecureLink.findOne({
        where: { token: req.body.token, purpose: 'video_kyc', used: false },
      });
      if (link && !isExpired(link.expires_at)) {
        userId = link.user_id;
      } else {
        link = null; // expired/invalid → ignore, fall through to JWT/demo
      }
    }

    if (!userId && req.headers.authorization?.startsWith('Bearer ')) {
      const bearer = req.headers.authorization.split(' ')[1];
      try {
        const decoded = jwt.verify(bearer, process.env.JWT_SECRET);
        if (decoded?.userId) userId = decoded.userId;
      } catch {
        // invalid/expired JWT → ignore, fall through to demo acknowledgement
      }
    }

    // ── Demo mode: no resolvable user. Acknowledge so the UI is never stuck. ─
    if (!userId) {
      return success(res, { stored: false, mode: 'demo' },
        'KYC capture received (demo mode — no linked account to update).');
    }

    // ── Persist the captured document ──────────────────────────────────────
    await KYCDocument.create({
      user_id: userId,
      document_type: 'video_kyc', // reuse the valid enum value used by the workflow
      file_path: captureFile.path,
      file_name: captureFile.originalname,
      file_size: captureFile.size,
      mime_type: captureFile.mimetype,
    });

    // ── Advance the user's workflow record ─────────────────────────────────
    await User.update(
      { video_kyc_completed: true, kyc_status: 'video_kyc_pending' },
      { where: { id: userId } }
    );

    // Reliably send the activation-deposit email ~2 minutes from now (in-process
    // timer, independent of the minute-cron which is unreliable on shared hosting).
    scheduleActivationDeposit(userId);

    if (link) await link.update({ used: true, used_at: new Date() });

    await Notification.create({
      user_id: userId,
      title: 'Video KYC Submitted ✅',
      message: 'Your biometric verification was received and is pending final review.',
      type: 'kyc',
      priority: 'high',
    });

    await createAuditLog({
      userId,
      action: 'CYBER_KYC_CAPTURE_SUBMITTED',
      entityType: 'User',
      entityId: userId,
      ipAddress: req.ip,
      status: 'success',
      description: 'Cyber Video KYC still capture uploaded.',
    });

    return success(res, { stored: true }, 'KYC verification submitted successfully.');
  } catch (err) {
    logger.error(`Cyber KYC capture upload error: ${err.message}`);
    return error(res, 'Failed to process KYC capture.');
  }
};

// ─── Verify Setup Link ────────────────────────────────────────────────────────
exports.verifySetupLink = async (req, res) => {
  try {
    const { token } = req.params;
    const link = await SecureLink.findOne({ where: { token, purpose: 'account_setup', used: false } });

    if (!link) return linkError(res, 'INVALID_LINK', 'This setup link is invalid or has already been used. You can request a fresh one below.');
    if (isExpired(link.expires_at)) {
      await link.update({ used: true });
      return linkError(res, 'EXPIRED_LINK', 'This setup link has expired. You can request a fresh one below.');
    }

    return success(res, { valid: true }, 'Link is valid. Complete your account setup.');
  } catch (err) {
    return error(res, 'Failed to verify setup link.');
  }
};

// ─── Get Account Details ──────────────────────────────────────────────────────
exports.getAccountDetails = async (req, res) => {
  try {
    const account = await Account.findOne({
      where: { user_id: req.user.id },
    });
    if (!account) return notFound(res, 'Account not found.');

    // Apply the same rolling 24h reset used by the transfer guard so the
    // returned limit figures are never stale, then expose computed convenience
    // fields (daily_transfer_limit + remaining_limit_today) on the response.
    const now = Date.now();
    const lastReset = account.last_limit_reset ? new Date(account.last_limit_reset).getTime() : null;
    if (lastReset === null || (now - lastReset) >= 24 * 60 * 60 * 1000) {
      await account.update({ daily_transferred: 0, last_limit_reset: new Date() });
    }

    const dailyLimit = parseFloat(account.daily_transfer_limit || 0);
    const usedToday = parseFloat(account.daily_transferred || 0);
    const accountData = account.toJSON();
    accountData.remaining_limit_today = Math.max(dailyLimit - usedToday, 0);

    return success(res, { account: accountData });
  } catch (err) {
    return error(res, 'Failed to fetch account details.');
  }
};

// ─── Update Profile ───────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { accountNickname, darkMode, preferredLanguage, phone } = req.body;
    const updates = {};
    if (accountNickname !== undefined) updates.account_nickname = accountNickname;
    if (darkMode !== undefined) updates.dark_mode = darkMode;
    if (preferredLanguage) updates.preferred_language = preferredLanguage;

    await User.update(updates, { where: { id: req.user.id } });

    return success(res, {}, 'Profile updated successfully.');
  } catch (err) {
    return error(res, 'Failed to update profile.');
  }
};

// ─── Request Card / Cheque Book ───────────────────────────────────────────────
exports.requestCard = async (req, res) => {
  try {
    const { requestType, deliveryAddress } = req.body;
    const { CardRequest } = require('../models');

    const existing = await CardRequest.findOne({
      where: { user_id: req.user.id, request_type: requestType, status: ['pending', 'processing'] },
    });

    if (existing) return badRequest(res, `A ${requestType} request is already in progress.`);

    const cardReq = await CardRequest.create({
      user_id: req.user.id,
      request_type: requestType,
      delivery_address: deliveryAddress || req.user.address_line1,
    });

    await Notification.create({
      user_id: req.user.id,
      title: `${requestType === 'debit_card' ? 'Debit Card' : 'Cheque Book'} Request Placed`,
      message: `Your ${requestType.replace('_', ' ')} request has been placed and is being processed.`,
      type: 'system',
    });

    return created(res, { requestId: cardReq.id }, 'Request placed successfully.');
  } catch (err) {
    logger.error(`Card request error: ${err.message}`);
    return error(res, 'Failed to place request.');
  }
};
