/**
 * Mobile-app onboarding + MPIN quick-login.
 *
 * Flow (first run / after 30-day device expiry):
 *   1. POST /api/app/verify-customer  { customerId, dob }        → email OTP sent
 *   2. POST /api/app/verify-otp       { otp }        + step token
 *   3. POST /api/app/verify-password  { password }   + step token
 *   4. POST /api/app/setup-mpin       { mpin, deviceId } + step token
 *        → 30-day device registration + normal access/refresh session
 * Returning user (within 30 days):
 *   POST /api/app/mpin-login          { mpin, deviceId, deviceToken }
 * Logout:
 *   POST /api/app/logout-device       (authenticated)
 *
 * Every step token is a short-lived JWT scoped to BOTH a purpose and the
 * specific user, so tokens cannot be replayed across steps or accounts.
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, OTP, Session } = require('../models');
const { generateToken } = require('../middleware/auth');
const { sendOTPEmail, sendLoginAlertEmail } = require('../services/emailService');
const { createAuditLog } = require('../middleware/auditLogger');
const {
  generateOTP, hashValue, hashOTP, getOTPExpiry, generateSecureToken,
  detectDevice, isExpired,
} = require('../utils/helpers');
const { success, error, badRequest, unauthorized } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ─── Step-token helpers ───────────────────────────────────────────────────────
const STEP_TTL = '10m';
const signStep = (userId, step) =>
  jwt.sign({ ctx: 'app-onboarding', userId, step }, process.env.JWT_SECRET, { expiresIn: STEP_TTL });

const verifyStep = (token, expectedStep) => {
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p.ctx !== 'app-onboarding' || p.step !== expectedStep) return null;
    return p;
  } catch {
    return null;
  }
};

// Device tokens live 30 days: after that, MPIN login returns REVERIFY_REQUIRED
// and the app repeats the full onboarding verification.
const DEVICE_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const signDeviceToken = (userId, deviceId) =>
  jwt.sign({ ctx: 'app-device', userId, deviceId }, process.env.JWT_SECRET, { expiresIn: '30d' });

const verifyDeviceToken = (token) => {
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p.ctx !== 'app-device') return null;
    return p;
  } catch {
    return null;
  }
};

const maskEmail = (email) => {
  const [local, domain] = String(email).split('@');
  if (!domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 3))}@${domain}`;
};

// Trivial MPINs an attacker guesses first — rejected at setup.
const WEAK_MPINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1122', '2580', '0852', '1212', '6969',
  '000000', '111111', '222222', '333333', '444444', '555555',
  '666666', '777777', '888888', '999999', '123456', '654321', '121212',
]);

// Shared session factory — mirrors the website login exactly (single-device
// enforcement, refresh rotation, device binding) so app sessions get the same
// guarantees the hardened web login has.
async function createAppSession(user, req, deviceId) {
  await Session.update(
    { is_active: false, logout_at: new Date() },
    { where: { user_id: user.id, is_active: true } }
  );

  const refreshToken = generateSecureToken(32);
  const session = await Session.create({
    user_id: user.id,
    token_hash: 'temp',
    ip_address: req.ip,
    user_agent: req.headers['user-agent'],
    device_type: detectDevice(req.headers['user-agent']),
    device_id: deviceId || null,
    is_active: true,
    last_activity: new Date(),
    expires_at: new Date(Date.now() + DEVICE_TOKEN_TTL_MS),
    refresh_token_hash: hashValue(refreshToken),
    refresh_expires_at: new Date(Date.now() + DEVICE_TOKEN_TTL_MS),
  });

  const token = generateToken(user.id, session.id);
  await session.update({ token_hash: hashValue(token) });
  return { token, refreshToken, session };
}

const publicUser = (user) => ({
  id: user.id,
  customerId: user.customer_id,
  firstName: user.first_name,
  lastName: user.last_name,
  email: user.email,
  phone: user.phone,
  accountStatus: user.account_status,
  kycStatus: user.kyc_status,
  darkMode: user.dark_mode,
  profilePicture: user.profile_picture,
});

// ─── 1. Verify Customer ID + DOB → send email OTP ────────────────────────────
exports.verifyCustomer = async (req, res) => {
  try {
    const { customerId, dob } = req.body;
    if (!customerId || !dob) return badRequest(res, 'Customer ID and date of birth are required.');

    const cleanId = String(customerId).trim().toUpperCase();
    if (!/^ALB[A-Z0-9]{5,15}$/.test(cleanId)) {
      return badRequest(res, 'Enter a valid Customer ID (starts with ALB).');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob))) {
      return badRequest(res, 'Enter a valid date of birth.');
    }

    const user = await User.findOne({ where: { customer_id: cleanId } });
    // Generic error — never reveal which half was wrong.
    const GENERIC = 'The details you entered do not match our records.';
    if (!user) return unauthorized(res, GENERIC);
    if (String(user.date_of_birth) !== String(dob)) {
      await createAuditLog({
        userId: user.id, action: 'APP_VERIFY_FAILED', ipAddress: req.ip,
        userAgent: req.headers['user-agent'], status: 'failure',
        description: 'App onboarding: DOB mismatch',
      });
      return unauthorized(res, GENERIC);
    }
    if (user.account_status !== 'active') {
      return unauthorized(res, 'This account is not active. Please contact support.');
    }

    // Issue and email the OTP (reuses the bank's existing OTP infra).
    const otp = generateOTP();
    await OTP.create({
      email: user.email,
      otp_hash: hashOTP(otp),
      purpose: '2fa',
      expires_at: getOTPExpiry(5),
      ip_address: req.ip,
    });
    await sendOTPEmail(user.email, otp, 'mobile app verification');

    await createAuditLog({
      userId: user.id, action: 'APP_ONBOARD_START', ipAddress: req.ip,
      userAgent: req.headers['user-agent'], status: 'success',
      description: 'App onboarding: customer verified, OTP sent',
    });

    return success(res, {
      onboardingToken: signStep(user.id, 'otp'),
      maskedEmail: maskEmail(user.email),
    }, 'We sent a verification code to your registered email.');
  } catch (err) {
    logger.error(`App verify-customer error: ${err.message}`);
    return error(res, 'Verification could not be completed. Please try again.');
  }
};

// ─── 2. Verify email OTP ──────────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  try {
    const { otp, onboardingToken } = req.body;
    const step = verifyStep(onboardingToken, 'otp');
    if (!step) return unauthorized(res, 'Session expired. Please start again.');
    if (!otp || !/^\d{6}$/.test(String(otp))) return badRequest(res, 'Enter the 6-digit code.');

    const user = await User.findByPk(step.userId);
    if (!user) return unauthorized(res, 'Session expired. Please start again.');

    const record = await OTP.findOne({
      where: { email: user.email, purpose: '2fa', used: false },
      order: [['created_at', 'DESC']],
    });
    if (!record || isExpired(record.expires_at)) {
      return badRequest(res, 'Code expired. Please request a new one.');
    }
    if (record.attempts >= 5) {
      return badRequest(res, 'Too many wrong attempts. Please request a new code.');
    }
    if (record.otp_hash !== hashOTP(String(otp))) {
      await record.update({ attempts: record.attempts + 1 });
      return badRequest(res, `Incorrect code. ${5 - record.attempts - 1} attempts left.`);
    }
    await record.update({ used: true });

    return success(res, {
      onboardingToken: signStep(user.id, 'password'),
    }, 'Email verified.');
  } catch (err) {
    logger.error(`App verify-otp error: ${err.message}`);
    return error(res, 'Verification could not be completed. Please try again.');
  }
};

// ─── 3. One-time NetBanking password confirmation ────────────────────────────
exports.verifyPassword = async (req, res) => {
  try {
    const { password, onboardingToken } = req.body;
    const step = verifyStep(onboardingToken, 'password');
    if (!step) return unauthorized(res, 'Session expired. Please start again.');
    if (!password) return badRequest(res, 'Password is required.');

    const user = await User.findByPk(step.userId);
    if (!user) return unauthorized(res, 'Session expired. Please start again.');

    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return unauthorized(res, `Account locked. Try again in ${mins} minute(s).`);
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      const attempts = user.login_attempts + 1;
      const updates = { login_attempts: attempts };
      if (attempts >= 5) updates.locked_until = new Date(Date.now() + 30 * 60 * 1000);
      await user.update(updates);
      return unauthorized(res, attempts >= 5
        ? 'Too many failed attempts. Account locked for 30 minutes.'
        : `Incorrect password. ${5 - attempts} attempts remaining.`);
    }
    await user.update({ login_attempts: 0, locked_until: null });

    return success(res, {
      onboardingToken: signStep(user.id, 'mpin'),
    }, 'Password confirmed.');
  } catch (err) {
    logger.error(`App verify-password error: ${err.message}`);
    return error(res, 'Verification could not be completed. Please try again.');
  }
};

// ─── 4. Set MPIN → register device for 30 days + full session ────────────────
exports.setupMpin = async (req, res) => {
  try {
    const { mpin, deviceId, onboardingToken } = req.body;
    const step = verifyStep(onboardingToken, 'mpin');
    if (!step) return unauthorized(res, 'Session expired. Please start again.');

    const pin = String(mpin || '');
    if (!/^\d{4}$|^\d{6}$/.test(pin)) return badRequest(res, 'MPIN must be 4 or 6 digits.');
    if (WEAK_MPINS.has(pin)) return badRequest(res, 'This MPIN is too easy to guess. Choose another.');

    const user = await User.findByPk(step.userId);
    if (!user) return unauthorized(res, 'Session expired. Please start again.');

    const cleanDeviceId = typeof deviceId === 'string' ? deviceId.slice(0, 100) : null;
    if (!cleanDeviceId) return badRequest(res, 'Device identifier missing.');

    await user.update({
      mpin_hash: await bcrypt.hash(pin, 12),
      mpin_set_at: new Date(),
      mpin_attempts: 0,
      mpin_locked_until: null,
    });

    const { token, refreshToken } = await createAppSession(user, req, cleanDeviceId);

    // New-device alert, same policy as the web login.
    const prior = await Session.count({ where: { user_id: user.id, device_id: cleanDeviceId } });
    if (prior <= 1) {
      sendLoginAlertEmail(user.email, user.first_name, {
        time: new Date().toLocaleString(),
        ip: req.ip,
        device: detectDevice(req.headers['user-agent']) || 'Mobile app',
        newDevice: true,
      }).catch(() => {});
    }

    await createAuditLog({
      userId: user.id, action: 'APP_MPIN_SETUP', ipAddress: req.ip,
      userAgent: req.headers['user-agent'], status: 'success',
      description: 'Mobile app MPIN set + device registered (30 days)',
    });

    return success(res, {
      token,
      refreshToken,
      deviceToken: signDeviceToken(user.id, cleanDeviceId),
      user: publicUser(user),
    }, 'You are all set.');
  } catch (err) {
    logger.error(`App setup-mpin error: ${err.message}`);
    return error(res, 'MPIN setup could not be completed. Please try again.');
  }
};

// ─── MPIN quick login (returning user within 30 days) ────────────────────────
exports.mpinLogin = async (req, res) => {
  try {
    const { mpin, deviceId, deviceToken } = req.body;

    const dt = verifyDeviceToken(deviceToken);
    if (!dt) {
      // Expired or invalid 30-day registration → app restarts onboarding.
      return res.status(401).json({
        success: false, message: 'Please verify your identity again.', code: 'REVERIFY_REQUIRED',
      });
    }
    const cleanDeviceId = typeof deviceId === 'string' ? deviceId.slice(0, 100) : null;
    if (!cleanDeviceId || dt.deviceId !== cleanDeviceId) {
      return res.status(401).json({
        success: false, message: 'Device mismatch. Please verify again.', code: 'REVERIFY_REQUIRED',
      });
    }

    const user = await User.findByPk(dt.userId);
    if (!user || !user.mpin_hash) {
      return res.status(401).json({
        success: false, message: 'Please verify your identity again.', code: 'REVERIFY_REQUIRED',
      });
    }
    if (user.account_status !== 'active') {
      return unauthorized(res, 'This account is not active. Please contact support.');
    }
    if (user.mpin_locked_until && new Date() < new Date(user.mpin_locked_until)) {
      const mins = Math.ceil((new Date(user.mpin_locked_until) - new Date()) / 60000);
      return unauthorized(res, `MPIN locked. Try again in ${mins} minute(s).`);
    }

    const pin = String(mpin || '');
    const ok = /^\d{4}$|^\d{6}$/.test(pin) && (await bcrypt.compare(pin, user.mpin_hash));
    if (!ok) {
      const attempts = (user.mpin_attempts || 0) + 1;
      const updates = { mpin_attempts: attempts };
      if (attempts >= 5) updates.mpin_locked_until = new Date(Date.now() + 30 * 60 * 1000);
      await user.update(updates);
      await createAuditLog({
        userId: user.id, action: 'APP_MPIN_FAILED', ipAddress: req.ip,
        userAgent: req.headers['user-agent'], status: 'failure',
        description: `App MPIN wrong attempt ${attempts}`,
      });
      return unauthorized(res, attempts >= 5
        ? 'Too many wrong attempts. MPIN locked for 30 minutes.'
        : `Incorrect MPIN. ${5 - attempts} attempts remaining.`);
    }

    await user.update({ mpin_attempts: 0, mpin_locked_until: null, last_login: new Date() });
    const { token, refreshToken } = await createAppSession(user, req, cleanDeviceId);

    await createAuditLog({
      userId: user.id, action: 'APP_MPIN_LOGIN', ipAddress: req.ip,
      userAgent: req.headers['user-agent'], status: 'success',
    });

    return success(res, {
      token,
      refreshToken,
      user: publicUser(user),
    }, 'Welcome back.');
  } catch (err) {
    logger.error(`App mpin-login error: ${err.message}`);
    return error(res, 'Login could not be completed. Please try again.');
  }
};

// ─── Resend onboarding OTP ────────────────────────────────────────────────────
exports.resendOtp = async (req, res) => {
  try {
    const { onboardingToken } = req.body;
    const step = verifyStep(onboardingToken, 'otp');
    if (!step) return unauthorized(res, 'Session expired. Please start again.');

    const user = await User.findByPk(step.userId);
    if (!user) return unauthorized(res, 'Session expired. Please start again.');

    const otp = generateOTP();
    await OTP.create({
      email: user.email,
      otp_hash: hashOTP(otp),
      purpose: '2fa',
      expires_at: getOTPExpiry(5),
      ip_address: req.ip,
    });
    await sendOTPEmail(user.email, otp, 'mobile app verification');
    return success(res, {}, 'A new code has been sent.');
  } catch (err) {
    logger.error(`App resend-otp error: ${err.message}`);
    return error(res, 'Could not resend the code. Please try again.');
  }
};

// ─── Logout device (forget MPIN registration) ────────────────────────────────
exports.logoutDevice = async (req, res) => {
  try {
    // req.user set by protect middleware.
    await Session.update(
      { is_active: false, logout_at: new Date() },
      { where: { user_id: req.user.id, is_active: true } }
    );
    await createAuditLog({
      userId: req.user.id, action: 'APP_DEVICE_LOGOUT', ipAddress: req.ip,
      userAgent: req.headers['user-agent'], status: 'success',
    });
    return success(res, {}, 'Device logged out.');
  } catch (err) {
    logger.error(`App logout-device error: ${err.message}`);
    return error(res, 'Logout failed. Please try again.');
  }
};
