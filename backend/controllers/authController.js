const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Account, OTP, Session, Notification } = require('../models');
const { generateToken } = require('../middleware/auth');
const { sendOTPEmail, sendPasswordResetEmail, sendVideoKYCEmail, sendAccountApprovedEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const {
  generateOTP, hashValue, getOTPExpiry, generateSecureToken,
  getSecureLinkExpiry, getOnboardingLinkExpiry, detectDevice, isExpired,
} = require('../utils/helpers');
const { success, error, badRequest, unauthorized, notFound, linkError } = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { SecureLink } = require('../models');
const { issueHandshake, consumeHandshake } = require('../utils/loginHandshake');
const { issueCaptcha, verifyCaptcha } = require('../utils/simpleCaptcha');

// generateSecureToken() = crypto.randomBytes(64).toString('hex') → 128 hex chars.
// Used to reject obviously-malformed tokens before any DB lookup.
const RESET_TOKEN_PATTERN = /^[a-f0-9]{128}$/;

// ─── Login Handshake (HDFC-style ephemeral SSO nonce) ────────────────────────
// GET /api/auth/login-handshake → mints a short-lived, single-use state token
// the client appends to the login URL and must echo back when submitting
// credentials. Blocks login replay / CSRF on the gateway.
exports.loginHandshake = async (req, res) => {
  try {
    const { token, expiresIn } = issueHandshake(req.ip);
    return success(res, { handshakeToken: token, expiresIn }, 'Handshake issued.');
  } catch (err) {
    logger.error(`Login handshake error: ${err.message}`);
    return error(res, 'Could not initialize a secure login session.');
  }
};

// ─── Login ─────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { username, password, handshakeToken } = req.body;

    // ── Ephemeral handshake validation (anti-replay) — SOFT / non-blocking ───
    // The handshake is an anti-replay nicety, NOT an authentication factor.
    // A CDN/proxy IP shift, a page left open, a cold start, or a transient
    // handshake-endpoint hiccup must never lock a legitimate user out (this was
    // surfacing as a "Secure session not ready" dead-end on the login page).
    // Login is already protected by the strict login rate-limiter, credential
    // verification, and account lockout — so we LOG the handshake result and
    // continue regardless of whether it validated.
    const hs = consumeHandshake(handshakeToken, req.ip);
    if (!hs.valid) {
      logger.warn(`Login handshake not validated (${hs.reason}) from ${req.ip} — proceeding (soft mode).`);
    }

    if (!username || !password) return badRequest(res, 'Username and password are required.');

    const user = await User.findOne({
      where: { [Op.or]: [{ username }, { email: username }] },
    });

    if (!user) {
      return unauthorized(res, 'Invalid credentials.');
    }

    // Check lockout
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return unauthorized(res, `Account locked. Try again in ${remaining} minute(s).`);
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const attempts = user.login_attempts + 1;
      const updates = { login_attempts: attempts };
      if (attempts >= 5) {
        updates.locked_until = new Date(Date.now() + 30 * 60 * 1000); // 30 min lock
      }
      await user.update(updates);

      await createAuditLog({
        userId: user.id,
        action: 'LOGIN_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'failure',
        description: `Failed login attempt ${attempts}`,
      });

      return unauthorized(res, attempts >= 5
        ? 'Too many failed attempts. Account locked for 30 minutes.'
        : `Invalid credentials. ${5 - attempts} attempts remaining.`);
    }

    // Check account status
    if (user.account_status === 'pending') return unauthorized(res, 'Account setup not completed.');
    if (user.account_status === 'frozen') return unauthorized(res, 'Account is frozen. Contact support.');
    if (user.account_status === 'closed') return unauthorized(res, 'Account is closed.');

    // Reset login attempts
    await user.update({ login_attempts: 0, locked_until: null, last_login: new Date() });

    // ── SINGLE-DEVICE ENFORCEMENT ──────────────────────────────────────────
    // Deactivate every prior active session for this user. Any other device
    // still polling /auth/session-status will now receive { active:false } and
    // be force-logged-out with the "logged in on another device" dialog.
    await Session.update(
      { is_active: false, logout_at: new Date() },
      { where: { user_id: user.id, is_active: true } }
    );

    // Create session
    const session = await Session.create({
      user_id: user.id,
      token_hash: 'temp',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      device_type: detectDevice(req.headers['user-agent']),
      is_active: true,
      last_activity: new Date(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const token = generateToken(user.id, session.id);
    await session.update({ token_hash: hashValue(token) });

    // Login-detected alert email intentionally disabled (per product decision).

    await createAuditLog({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success',
    });

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return success(res, {
      token,
      user: {
        id: user.id,
        customerId: user.customer_id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        accountStatus: user.account_status,
        kycStatus: user.kyc_status,
        darkMode: user.dark_mode,
        twoFactorEnabled: user.two_factor_enabled,
      },
    }, 'Login successful.');
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    return error(res, 'Login failed. Please try again.');
  }
};

// ─── Logout ────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    if (req.session) {
      await req.session.update({ is_active: false, logout_at: new Date() });
    }
    res.clearCookie('accessToken');
    return success(res, {}, 'Logged out successfully.');
  } catch (err) {
    logger.error(`Logout error: ${err.message}`);
    return error(res, 'Logout failed.');
  }
};

// ─── Session Status (concurrent-login heartbeat) ─────────────────────────────
// Lightweight poll target for the customer dashboard's session-security engine.
// Unlike `protect`, this NEVER returns 401 for a valid-but-superseded token —
// it returns 200 { active:false, reason } so the client can show a clean
// "logged in on another device" dialog before wiping local state. A missing or
// malformed token is the only 401 case.
exports.sessionStatus = async (req, res) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }
    if (!token) return unauthorized(res, 'No session token provided.');

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      // Expired/invalid JWT → treat as a destroyed session (not a hard 401),
      // so the client can react gracefully.
      return success(res, { active: false, reason: 'expired' }, 'Session token invalid.');
    }

    const session = await Session.findOne({ where: { id: decoded.sessionId } });
    if (!session || !session.is_active) {
      return success(res, { active: false, reason: 'concurrent' }, 'Session is no longer active.');
    }
    if (session.expires_at && new Date() > new Date(session.expires_at)) {
      return success(res, { active: false, reason: 'expired' }, 'Session expired.');
    }

    // Heartbeat: refresh last-activity so the server-side record stays warm.
    await session.update({ last_activity: new Date() });
    return success(res, { active: true }, 'Session active.');
  } catch (err) {
    logger.error(`Session status error: ${err.message}`);
    // Fail-open to avoid nuisance logouts on a transient DB blip.
    return success(res, { active: true, degraded: true }, 'Session status unavailable.');
  }
};

// ─── Get Current User ──────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password_hash', 'security_pin'] },
    });
    return success(res, { user });
  } catch (err) {
    return error(res, 'Failed to fetch user.');
  }
};

// ─── Send OTP ──────────────────────────────────────────────────────────────────
exports.sendOTP = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email || !purpose) return badRequest(res, 'Email and purpose are required.');

    // Invalidate old OTPs
    await OTP.update({ used: true }, { where: { email, purpose, used: false } });

    const otp = generateOTP();
    const otpHash = hashValue(otp);
    const expiresAt = getOTPExpiry(5);

    await OTP.create({
      email,
      otp_hash: otpHash,
      purpose,
      expires_at: expiresAt,
      ip_address: req.ip,
    });

    await sendOTPEmail(email, otp, purpose);

    return success(res, { expiresIn: 300 }, 'OTP sent to your email address.');
  } catch (err) {
    logger.error(`Send OTP error: ${err.message}`);
    return error(res, 'Failed to send OTP. Please try again.');
  }
};

// ─── Verify OTP ────────────────────────────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp, purpose } = req.body;
    if (!email || !otp || !purpose) return badRequest(res, 'Email, OTP, and purpose are required.');

    const record = await OTP.findOne({
      where: { email, purpose, used: false },
      order: [['created_at', 'DESC']],
    });

    if (!record) return badRequest(res, 'No active OTP found. Please request a new one.');

    if (record.attempts >= 5) {
      await record.update({ used: true });
      return badRequest(res, 'Maximum OTP attempts exceeded. Please request a new OTP.');
    }

    if (isExpired(record.expires_at)) {
      await record.update({ used: true });
      return badRequest(res, 'OTP has expired. Please request a new one.');
    }

    const otpHash = hashValue(otp);
    if (record.otp_hash !== otpHash) {
      await record.increment('attempts');
      return badRequest(res, `Invalid OTP. ${4 - record.attempts} attempts remaining.`);
    }

    await record.update({ used: true });
    return success(res, { verified: true }, 'OTP verified successfully.');
  } catch (err) {
    logger.error(`Verify OTP error: ${err.message}`);
    return error(res, 'OTP verification failed.');
  }
};

// ─── Change Password ───────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findByPk(req.user.id);

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) return badRequest(res, 'Current password is incorrect.');

    if (newPassword.length < 8) return badRequest(res, 'New password must be at least 8 characters.');

    const hash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await user.update({ password_hash: hash });

    // Invalidate all sessions
    await Session.update({ is_active: false }, { where: { user_id: user.id } });

    await createAuditLog({
      userId: user.id,
      action: 'PASSWORD_CHANGED',
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, 'Password changed successfully. Please log in again.');
  } catch (err) {
    logger.error(`Change password error: ${err.message}`);
    return error(res, 'Failed to change password.');
  }
};

// ─── Forgot Password ───────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) return success(res, {}, 'If an account exists, a reset link has been sent.');

    const token = generateSecureToken();
    const expiresAt = getSecureLinkExpiry(5);

    await SecureLink.create({
      user_id: user.id,
      token,
      purpose: 'password_reset',
      expires_at: expiresAt,
      ip_address: req.ip,
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, user.first_name, resetLink);

    return success(res, {}, 'Password reset link sent to your email (expires in 5 minutes).');
  } catch (err) {
    logger.error(`Forgot password error: ${err.message}`);
    return error(res, 'Failed to process request.');
  }
};

// ─── Email masking (for the multi-step forgot-password identity flow) ────────
// Keeps the first 2 chars of the local part, masks the rest with asterisks.
// e.g. "arjun.sharma@gmail.com" → "ar**********@gmail.com"
const maskEmail = (email) => {
  const str = String(email || '');
  const at = str.indexOf('@');
  if (at <= 0) return str;
  const local = str.slice(0, at);
  const domain = str.slice(at); // includes '@'
  const visible = local.slice(0, 2);
  const maskedLen = Math.max(local.length - 2, 3);
  return `${visible}${'*'.repeat(maskedLen)}${domain}`;
};

// Generic anti-enumeration error shared by Step 2 and Step 3 of the
// forgot-password identity-verification flow.
const IDENTITY_MISMATCH_MSG =
  "We couldn't verify your details. Please check your User ID, account number, and date of birth.";

/**
 * Find the User (with linked Account) by username AND confirm the supplied
 * accountNumber + dateOfBirth match. Returns the user on success, or null on
 * ANY mismatch (including closed accounts) so callers can return one generic
 * error without leaking which field was wrong.
 */
const findVerifiedUserForReset = async (userId, accountNumber, dateOfBirth) => {
  if (!userId || !accountNumber || !dateOfBirth) return null;

  const user = await User.findOne({
    where: { username: String(userId).trim() },
    include: [{ model: Account, as: 'account' }],
  });
  if (!user) return null;
  if (!user.account) return null;
  if (user.account.status === 'closed') return null;

  if (String(user.account.account_number).trim() !== String(accountNumber).trim()) return null;

  // date_of_birth is a DATEONLY field — Sequelize returns it as 'YYYY-MM-DD'.
  if (String(user.date_of_birth) !== String(dateOfBirth).trim()) return null;

  return user;
};

// ─── Step 1: Verify User ID ──────────────────────────────────────────────────
exports.verifyUserId = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return badRequest(res, 'User ID is required.');

    const user = await User.findOne({ where: { username: String(userId).trim() } });
    if (!user) return badRequest(res, 'User ID not found. Please check and try again.');
    if (user.account_status === 'closed') {
      return badRequest(res, 'User ID not found. Please check and try again.');
    }

    return success(res, {}, 'User ID verified.');
  } catch (err) {
    logger.error(`Verify user ID error: ${err.message}`);
    return error(res, 'Failed to verify User ID. Please try again.');
  }
};

// ─── Step 2: Verify Account Number + Date of Birth ───────────────────────────
exports.verifyAccountDetails = async (req, res) => {
  try {
    const { userId, accountNumber, dateOfBirth } = req.body;
    if (!userId || !accountNumber || !dateOfBirth) {
      return badRequest(res, IDENTITY_MISMATCH_MSG);
    }

    const user = await findVerifiedUserForReset(userId, accountNumber, dateOfBirth);
    if (!user) return badRequest(res, IDENTITY_MISMATCH_MSG);

    return success(res, { maskedEmail: maskEmail(user.email) }, 'Identity verified.');
  } catch (err) {
    logger.error(`Verify account details error: ${err.message}`);
    return error(res, 'Failed to verify account details. Please try again.');
  }
};

// ─── Step 3: Send Reset Link ─────────────────────────────────────────────────
exports.sendResetLink = async (req, res) => {
  try {
    const { userId, accountNumber, dateOfBirth } = req.body;
    if (!userId || !accountNumber || !dateOfBirth) {
      return badRequest(res, IDENTITY_MISMATCH_MSG);
    }

    // Re-verify from scratch — never trust that Step 2 already passed.
    const user = await findVerifiedUserForReset(userId, accountNumber, dateOfBirth);
    if (!user) return badRequest(res, IDENTITY_MISMATCH_MSG);

    const token = generateSecureToken();
    const expiresAt = getSecureLinkExpiry(5);

    await SecureLink.create({
      user_id: user.id,
      token,
      purpose: 'password_reset',
      expires_at: expiresAt,
      ip_address: req.ip,
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, user.first_name, resetLink);

    await createAuditLog({
      userId: user.id,
      action: 'PASSWORD_RESET_REQUESTED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success',
      description: 'Password reset link requested via User ID + Account Details verification.',
    });

    // Generic success — email already shown masked in step 2.
    return success(res, {}, 'Password reset link sent to your registered email (expires in 5 minutes).');
  } catch (err) {
    logger.error(`Send reset link error: ${err.message}`);
    return error(res, 'Failed to send reset link. Please try again.');
  }
};

// ─── Issue a self-hosted CAPTCHA (image + opaque token) ──────────────────────
// GET /api/auth/captcha → { svg, token }. The frontend renders the SVG and
// sends back the token + the user's typed answer with the reset request.
exports.getCaptcha = async (req, res) => {
  try {
    const { svg, token } = issueCaptcha();
    return success(res, { svg, token }, 'Captcha generated.');
  } catch (err) {
    logger.error(`Captcha generation error: ${err.message}`);
    return error(res, 'Failed to generate captcha.');
  }
};

// ─── Reset Password ────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword, captchaToken, captchaAnswer } = req.body;
    if (!token || !newPassword) return badRequest(res, 'Token and new password are required.');

    // ── Bot protection: verify the self-hosted CAPTCHA BEFORE any DB lookup ──
    if (!verifyCaptcha(captchaToken, captchaAnswer)) {
      return badRequest(res, 'Captcha verification failed. Please try again.');
    }

    // ── Cheap token-shape gate ───────────────────────────────────────────────
    // Reject obviously-malformed (bot) tokens up front so we never waste a DB
    // query on them. Same generic message as a genuine miss — no info leak.
    if (!RESET_TOKEN_PATTERN.test(String(token))) {
      return badRequest(res, 'Invalid or expired reset link.');
    }

    const link = await SecureLink.findOne({ where: { token, purpose: 'password_reset', used: false } });
    if (!link) return badRequest(res, 'Invalid or expired reset link.');
    if (isExpired(link.expires_at)) {
      await link.update({ used: true });
      return badRequest(res, 'Reset link has expired.');
    }

    if (newPassword.length < 8) return badRequest(res, 'Password must be at least 8 characters.');

    // ── Disallow reusing the current password ────────────────────────────────
    const user = await User.findByPk(link.user_id);
    if (user) {
      const sameAsCurrent = await bcrypt.compare(newPassword, user.password_hash);
      if (sameAsCurrent) {
        return badRequest(res, 'New password must be different from your current password.');
      }
    }

    const hash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await User.update({ password_hash: hash }, { where: { id: link.user_id } });
    await link.update({ used: true, used_at: new Date() });

    await Session.update({ is_active: false }, { where: { user_id: link.user_id } });

    await createAuditLog({
      userId: link.user_id,
      action: 'PASSWORD_RESET_COMPLETED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success',
      description: 'Password reset completed via secure reset link.',
    });

    return success(res, {}, 'Password reset successfully. Please log in.');
  } catch (err) {
    logger.error(`Reset password error: ${err.message}`);
    return error(res, 'Failed to reset password.');
  }
};

// ─── Verify Setup Link ────────────────────────────────────────────────────────
exports.verifySetup = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return badRequest(res, 'Token is required.');

    const link = await SecureLink.findOne({ 
      where: { token, purpose: 'account_setup', used: false } 
    });

    if (!link) return linkError(res, 'INVALID_LINK', 'This setup link is invalid or has already been used. You can request a fresh one below.');
    if (isExpired(link.expires_at)) {
      await link.update({ used: true });
      return linkError(res, 'EXPIRED_LINK', 'This setup link has expired. You can request a fresh one below.');
    }

    const user = await User.findByPk(link.user_id, {
      attributes: ['id', 'first_name', 'last_name', 'email']
    });

    if (!user) return notFound(res, 'Associated user account not found.');

    return success(res, { 
      token,
      user: {
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email
      }
    }, 'Setup link verified successfully.');
  } catch (err) {
    logger.error(`Verify setup error: ${err.message}`);
    return error(res, 'Verification process failed.');
  }
};

// ─── Regenerate Onboarding Link (self-service) ────────────────────────────────
// Lets a user whose Video KYC / Account Setup link expired safely request a
// fresh one by proving identity with BOTH their registered email AND Customer
// ID. Anti-enumeration: a non-match returns a single generic error.
exports.regenerateOnboardingLink = async (req, res) => {
  try {
    const { email, customerId, type } = req.body;
    const normalizedType = String(type || '').toLowerCase();

    if (!email || !customerId || !['account-setup', 'video-kyc'].includes(normalizedType)) {
      return badRequest(res, 'Email, Customer ID, and a valid link type are required.');
    }

    const purpose = normalizedType === 'video-kyc' ? 'video_kyc' : 'account_setup';

    // Match BOTH fields. MySQL's default collation makes this case-insensitive.
    const user = await User.findOne({
      where: { email: String(email).trim(), customer_id: String(customerId).trim() },
    });

    // Generic response on no-match → never reveal which field was wrong.
    if (!user) {
      return badRequest(res, 'We could not verify those details. Please check your registered email and Customer ID, then try again.');
    }

    // Already fully completed → informative, no link issued.
    if (purpose === 'account_setup' && (user.setup_completed || user.account_status === 'active')) {
      return success(res, { alreadyDone: true }, 'Your account is already set up. Please log in with your credentials.');
    }
    if (purpose === 'video_kyc' && (user.video_kyc_completed || user.kyc_status === 'approved')) {
      return success(res, { alreadyDone: true }, 'Your Video KYC is already complete — no new link is required.');
    }

    // Invalidate any prior active links of this purpose, then mint a fresh 24h token.
    await SecureLink.update(
      { used: true, used_at: new Date() },
      { where: { user_id: user.id, purpose, used: false } }
    );

    const token = generateSecureToken();
    await SecureLink.create({
      user_id: user.id,
      token,
      purpose,
      expires_at: getOnboardingLinkExpiry(),
      ip_address: req.ip,
    });

    // Build the fresh onboarding URL + dispatch via the existing mail service.
    if (purpose === 'video_kyc') {
      const kycLink = `${process.env.FRONTEND_URL}/video-kyc?token=${token}`;
      await sendVideoKYCEmail(user.email, user.first_name, kycLink);
    } else {
      const setupLink = `${process.env.FRONTEND_URL}/account-setup?token=${token}`;
      const account = await Account.findOne({ where: { user_id: user.id } });
      await sendAccountApprovedEmail(
        user.email,
        user.first_name,
        setupLink,
        account?.account_number || user.customer_id
      );
    }

    await createAuditLog({
      userId: user.id,
      action: 'ONBOARDING_LINK_REGENERATED',
      entityType: 'SecureLink',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      status: 'success',
      description: `Regenerated ${purpose} onboarding link (24h).`,
    });

    return success(res, { type: normalizedType }, 'A fresh secure link has been sent to your registered email.');
  } catch (err) {
    logger.error(`Regenerate onboarding link error: ${err.message}`);
    return error(res, 'Could not process your request right now. Please try again shortly.');
  }
};

// ─── Account Setup (after approval) ───────────────────────────────────────────
exports.setupAccount = async (req, res) => {
  try {
    const { token, username, password, securityPin } = req.body;
    if (!token || !username || !password || !securityPin)
      return badRequest(res, 'All fields are required.');

    const link = await SecureLink.findOne({ where: { token, purpose: 'account_setup', used: false } });
    if (!link) return badRequest(res, 'Invalid or expired setup link.');
    if (isExpired(link.expires_at)) {
      await link.update({ used: true });
      return badRequest(res, 'Setup link has expired. Please contact support.');
    }

    // Validations
    if (username.length < 5) return badRequest(res, 'Username must be at least 5 characters.');
    if (password.length < 8) return badRequest(res, 'Password must be at least 8 characters.');
    if (!/^\d{4}$/.test(securityPin)) return badRequest(res, 'Security PIN must be exactly 4 digits.');

    // Check username availability
    const existing = await User.findOne({ where: { username } });
    if (existing) return badRequest(res, 'Username already taken. Please choose another.');

    const [passwordHash, pinHash] = await Promise.all([
      bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12),
      bcrypt.hash(securityPin, parseInt(process.env.BCRYPT_ROUNDS) || 12),
    ]);

    await User.update({
      username,
      password_hash: passwordHash,
      security_pin: pinHash,
      account_status: 'active',
      setup_completed: true,
    }, { where: { id: link.user_id } });

    await link.update({ used: true, used_at: new Date() });

    // Create welcome notification
    await Notification.create({
      user_id: link.user_id,
      title: 'Welcome to Alister Bank! 🎉',
      message: 'Your account is now active. Start exploring your banking dashboard.',
      type: 'kyc',
      priority: 'high',
    });

    await createAuditLog({
      userId: link.user_id,
      action: 'ACCOUNT_SETUP_COMPLETED',
      ipAddress: req.ip,
      status: 'success',
    });

    return success(res, {}, 'Account setup complete. You can now log in.');
  } catch (err) {
    logger.error(`Account setup error: ${err.message}`);
    return error(res, 'Account setup failed.');
  }
};