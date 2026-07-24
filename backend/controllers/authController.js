const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Account, OTP, Session, Notification } = require('../models');
const { generateToken } = require('../middleware/auth');
const { sendOTPEmail, sendPasswordResetEmail, sendVideoKYCEmail, sendAccountApprovedEmail, sendLoginAlertEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const {
  generateOTP, hashValue, hashOTP, getOTPExpiry, generateSecureToken,
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
    const { username, password, handshakeToken, captchaToken, captchaAnswer, biometric, deviceId } = req.body;

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

    // ── Bot protection: self-hosted captcha (replaces Cloudflare Turnstile) ──
    // EXCEPTION: the native Android app's biometric quick-login sends
    // biometric:true and no captcha — the user already passed an OS-level
    // fingerprint/face check and the credentials come from Keystore-encrypted
    // storage. The flag is NOT trusted as an auth factor: the request still
    // needs valid credentials and remains fully covered by the strict login
    // rate limiter and the 5-attempt account lockout, so spoofing the flag
    // gains a bot nothing beyond ordinary credential-stuffing (which lockout
    // already throttles).
    const isBiometricQuickLogin = biometric === true && !captchaToken;
    if (isBiometricQuickLogin) {
      logger.info(`Biometric quick-login (captcha bypassed) from ${req.ip}`);
    } else if (!verifyCaptcha(captchaToken, captchaAnswer)) {
      return badRequest(res, 'Captcha verification failed. Please try again.');
    }

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

    // ── CHANNEL MUTUAL EXCLUSION ───────────────────────────────────────────
    // An active mobile-app session blocks website sign-in: the user must log
    // out of the app first (sessions idle >15 min don't block).
    const { findActiveChannelSession } = require('./appAuthController');
    if (await findActiveChannelSession(user.id, 'app')) {
      return res.status(409).json({
        success: false,
        code: 'APP_SESSION_ACTIVE',
        message: 'You are signed in on the Alister Bank mobile app. Please log out of the app first, then sign in here.',
      });
    }

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

    // ── DEVICE BINDING (native app) ────────────────────────────────────────
    // The Android app sends a stable random deviceId. If this user has never
    // logged in from this device before, alert them by email — an attacker
    // with stolen credentials on a new phone triggers an immediate warning.
    const cleanDeviceId = typeof deviceId === 'string' ? deviceId.slice(0, 100) : null;
    let isNewDevice = false;
    if (cleanDeviceId) {
      const priorFromDevice = await Session.findOne({
        where: { user_id: user.id, device_id: cleanDeviceId },
      });
      isNewDevice = !priorFromDevice;
    }

    // Create session. The refresh token is a 64-char CSPRNG hex string stored
    // only as a SHA-256 hash; it long-outlives the 15-minute access JWT and is
    // ROTATED (single-use) on every /auth/refresh call.
    const refreshToken = generateSecureToken(32);
    const session = await Session.create({
      user_id: user.id,
      token_hash: 'temp',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      device_type: detectDevice(req.headers['user-agent']),
      device_id: cleanDeviceId,
      is_active: true,
      last_activity: new Date(),
      // Session lifetime = refresh window (30 days). The short-lived access
      // JWT (15 min) is renewed against this session via /auth/refresh.
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      refresh_token_hash: hashValue(refreshToken),
      refresh_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const token = generateToken(user.id, session.id);
    await session.update({ token_hash: hashValue(token) });

    // New-device alert (fire-and-forget; never blocks login).
    if (isNewDevice) {
      sendLoginAlertEmail(user.email, user.first_name, {
        time: new Date().toLocaleString(),
        ip: req.ip,
        device: detectDevice(req.headers['user-agent']) || 'Unknown device',
        newDevice: true,
      }).catch(() => {});
    }

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
      maxAge: 15 * 60 * 1000, // 15 min — matches the access-JWT lifetime
    });

    return success(res, {
      token,
      refreshToken,
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

// ─── Refresh Access Token (rotating refresh tokens) ──────────────────────────
// POST /api/auth/refresh { refreshToken }
// Exchanges a valid single-use refresh token for a NEW 15-minute access JWT
// plus a NEW refresh token (rotation). Replay of an already-rotated token is
// treated as theft: the whole session is revoked and the client must log in.
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken: presented } = req.body;
    if (!presented || typeof presented !== 'string') {
      return unauthorized(res, 'Refresh token is required.');
    }

    const presentedHash = hashValue(presented);
    const session = await Session.findOne({
      where: { refresh_token_hash: presentedHash, is_active: true },
    });

    if (!session) {
      // Either never existed OR was already rotated (replay). If it matches a
      // revoked/rotated session's ancestry we can't tell — fail safe.
      return unauthorized(res, 'Invalid refresh token. Please sign in again.');
    }
    if (session.refresh_expires_at && new Date() > new Date(session.refresh_expires_at)) {
      await session.update({ is_active: false, logout_at: new Date() });
      return unauthorized(res, 'Refresh token expired. Please sign in again.');
    }

    const user = await User.findByPk(session.user_id);
    if (!user || user.account_status !== 'active') {
      await session.update({ is_active: false, logout_at: new Date() });
      return unauthorized(res, 'Account is not active.');
    }

    // ── ROTATE ── new refresh token + new access JWT bound to the session.
    const nextRefresh = generateSecureToken(32);
    const nextAccess = generateToken(user.id, session.id);
    await session.update({
      refresh_token_hash: hashValue(nextRefresh),
      token_hash: hashValue(nextAccess),
      last_activity: new Date(),
    });

    await createAuditLog({
      userId: user.id,
      action: 'TOKEN_REFRESHED',
      ipAddress: req.ip,
      status: 'success',
    });

    res.cookie('accessToken', nextAccess, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });

    return success(res, { token: nextAccess, refreshToken: nextRefresh }, 'Token refreshed.');
  } catch (err) {
    logger.error(`Token refresh error: ${err.message}`);
    return error(res, 'Token refresh failed.');
  }
};

// ─── Logout ────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    if (req.session) {
      // Revoke BOTH the access session and its refresh token in one shot so a
      // captured refresh token is dead the instant the user logs out.
      await req.session.update({
        is_active: false,
        logout_at: new Date(),
        refresh_token_hash: null,
        refresh_expires_at: null,
      });
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

// ─── Send OTP ────────────────────────────────────────────────────────────���─────
exports.sendOTP = async (req, res) => {
  try {
    const { email, purpose } = req.body;
    if (!email || !purpose) return badRequest(res, 'Email and purpose are required.');

    // Invalidate old OTPs
    await OTP.update({ used: true }, { where: { email, purpose, used: false } });

    const otp = generateOTP();
    const otpHash = hashOTP(otp);
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

    const otpHash = hashOTP(otp);
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

// ─── Verify Password (read-only re-authentication check) ─────────────────────
// POST /api/auth/verify-password — used by the native app's Settings page
// before enabling biometric login, so a mistyped password can never be stored
// in the device's secure credential store. Authenticated route (protect);
// changes NOTHING server-side.
exports.verifyPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return badRequest(res, 'Password is required.');

    const user = await User.findByPk(req.user.id);
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return unauthorized(res, 'Password is incorrect.');

    return success(res, { verified: true }, 'Password verified.');
  } catch (err) {
    logger.error(`Verify password error: ${err.message}`);
    return error(res, 'Verification failed.');
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

// ─── Forgot-password wizard: advanced anti-abuse protections ─────────────────
// Progressive per-target lockout (in addition to the per-IP authLimiter):
// failures are tracked per `ip|userId` key so an attacker cycling User IDs
// from one IP, or hammering one victim's User ID, gets locked out after
// MAX_RESET_ATTEMPTS failures for RESET_LOCKOUT_MS. In-memory (single-node),
// self-pruning.
const MAX_RESET_ATTEMPTS = 5;
const RESET_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const RESET_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const resetAttempts = new Map(); // key → { count, first, lockedUntil }

function resetAttemptKey(req, userId) {
  return `${req.ip}|${String(userId || '').trim().toLowerCase()}`;
}

function checkResetLock(req, userId) {
  const rec = resetAttempts.get(resetAttemptKey(req, userId));
  if (!rec) return null;
  if (rec.lockedUntil && Date.now() < rec.lockedUntil) {
    return Math.ceil((rec.lockedUntil - Date.now()) / 60000);
  }
  return null;
}

function recordResetFailure(req, userId) {
  const k = resetAttemptKey(req, userId);
  const now = Date.now();
  let rec = resetAttempts.get(k);
  if (!rec || now - rec.first > RESET_ATTEMPT_WINDOW_MS) rec = { count: 0, first: now, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_RESET_ATTEMPTS) rec.lockedUntil = now + RESET_LOCKOUT_MS;
  resetAttempts.set(k, rec);
  // Opportunistic prune so the map can't grow unbounded.
  if (resetAttempts.size > 5000) {
    for (const [key, r] of resetAttempts) {
      if (now - r.first > RESET_ATTEMPT_WINDOW_MS && (!r.lockedUntil || now > r.lockedUntil)) resetAttempts.delete(key);
    }
  }
  return rec.lockedUntil ? 0 : MAX_RESET_ATTEMPTS - rec.count;
}

function clearResetFailures(req, userId) {
  resetAttempts.delete(resetAttemptKey(req, userId));
}

const RESET_LOCKED_MSG = (mins) => `Too many failed attempts. Please try again in ${mins} minute(s).`;

// Resend cooldown: one reset email per user per RESEND_COOLDOWN_MS.
const RESEND_COOLDOWN_MS = 60 * 1000;
const lastResetEmailAt = new Map(); // user.id → timestamp

// ─── Step 1: Verify User ID (CAPTCHA + progressive lockout) ──────────────────
exports.verifyUserId = async (req, res) => {
  try {
    const { userId, captchaToken, captchaAnswer, website } = req.body;
    if (!userId) return badRequest(res, 'User ID is required.');

    // Honeypot: real users never fill this hidden field — bots do.
    if (website) {
      logger.warn(`Forgot-password honeypot triggered from ${req.ip}`);
      return badRequest(res, 'User ID not found. Please check and try again.');
    }

    // Bot protection: self-hosted CAPTCHA is mandatory before any DB lookup.
    if (!verifyCaptcha(captchaToken, captchaAnswer)) {
      return badRequest(res, 'Captcha verification failed. Please try again.');
    }

    const lockedMins = checkResetLock(req, userId);
    if (lockedMins) return badRequest(res, RESET_LOCKED_MSG(lockedMins));

    const user = await User.findOne({ where: { username: String(userId).trim() } });
    if (!user || user.account_status === 'closed') {
      const remaining = recordResetFailure(req, userId);
      await createAuditLog({
        userId: user?.id || null,
        action: 'PASSWORD_RESET_STEP_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'failure',
        description: `Forgot-password Step 1 failed for User ID "${String(userId).trim().slice(0, 50)}"`,
      });
      return badRequest(res, remaining > 0
        ? 'User ID not found. Please check and try again.'
        : RESET_LOCKED_MSG(Math.ceil(RESET_LOCKOUT_MS / 60000)));
    }

    return success(res, {}, 'User ID verified.');
  } catch (err) {
    logger.error(`Verify user ID error: ${err.message}`);
    return error(res, 'Failed to verify User ID. Please try again.');
  }
};

// ─── Step 2: Verify Account Number + Date of Birth (progressive lockout) ─────
exports.verifyAccountDetails = async (req, res) => {
  try {
    const { userId, accountNumber, dateOfBirth } = req.body;
    if (!userId || !accountNumber || !dateOfBirth) {
      return badRequest(res, IDENTITY_MISMATCH_MSG);
    }

    const lockedMins = checkResetLock(req, userId);
    if (lockedMins) return badRequest(res, RESET_LOCKED_MSG(lockedMins));

    const user = await findVerifiedUserForReset(userId, accountNumber, dateOfBirth);
    if (!user) {
      const remaining = recordResetFailure(req, userId);
      await createAuditLog({
        userId: null,
        action: 'PASSWORD_RESET_STEP_FAILED',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        status: 'failure',
        description: `Forgot-password Step 2 identity mismatch for User ID "${String(userId).trim().slice(0, 50)}"`,
      });
      return badRequest(res, remaining > 0
        ? IDENTITY_MISMATCH_MSG
        : RESET_LOCKED_MSG(Math.ceil(RESET_LOCKOUT_MS / 60000)));
    }

    // Full identity verified — reset the failure counter for this target.
    clearResetFailures(req, userId);

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

    const lockedMins = checkResetLock(req, userId);
    if (lockedMins) return badRequest(res, RESET_LOCKED_MSG(lockedMins));

    // Re-verify from scratch — never trust that Step 2 already passed.
    const user = await findVerifiedUserForReset(userId, accountNumber, dateOfBirth);
    if (!user) {
      recordResetFailure(req, userId);
      return badRequest(res, IDENTITY_MISMATCH_MSG);
    }

    // Resend cooldown — max one reset email per user per 60 seconds, so the
    // flow can't be abused to email-bomb a customer.
    const lastSent = lastResetEmailAt.get(user.id) || 0;
    if (Date.now() - lastSent < RESEND_COOLDOWN_MS) {
      const waitSecs = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - lastSent)) / 1000);
      return badRequest(res, `Please wait ${waitSecs} second(s) before requesting another reset link.`);
    }

    // Single-active-link policy: invalidate every previous unused reset link
    // for this user so only the newest emailed link works.
    await SecureLink.update(
      { used: true, used_at: new Date() },
      { where: { user_id: user.id, purpose: 'password_reset', used: false } }
    );

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
    lastResetEmailAt.set(user.id, Date.now());

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

// ─── Regenerate Onboarding Link (self-service) ──────────────────────────���─────
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
