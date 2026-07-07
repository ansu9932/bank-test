/**
 * QR-code login — "scan to login" for the NetBanking website.
 *
 * Desktop browser                    Server                     Mobile app
 * ───────────────                    ──────                     ──────────
 * POST /qr-login/create  ──────────► pending session
 *   (QR + countdown shown)           qr_id, 60s TTL
 * GET  /qr-login/status/:qrId ─────► pending…            scan QR (jsQR)
 *                                    scanned ◄─────────── POST /qr-login/scan
 *   "Approve on your phone"                                 (device token)
 *                                                          context screen →
 *                                                          swipe → MPIN
 *                                    approved ◄────────── POST /qr-login/approve
 * GET  status → one-time token ◄──── (token delivered once, then nulled)
 * POST /qr-login/exchange ─────────► web session created; QR session dead
 *
 * True 2FA: possession (registered device-bound app) + knowledge (MPIN).
 * No password ever touches the browser.
 */
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { Op } = require('sequelize');
const { User, Session, QrLoginSession } = require('../models');
const { generateToken } = require('../middleware/auth');
const { createAuditLog } = require('../middleware/auditLogger');
const { hashValue, generateSecureToken, detectDevice } = require('../utils/helpers');
const { success, badRequest, unauthorized, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// Strict QR payload structure — the app validates this exact shape before
// sending anything to the server (anti-quishing), and the server re-validates.
const QR_PREFIX = 'ALISTERBANK:QRLOGIN:v1:';
const QR_ID_RE = /^[a-f0-9]{48}$/;

const QR_TTL_MS = 60 * 1000;         // QR expires in 60 seconds
const TOKEN_TTL_MS = 30 * 1000;      // one-time login token: 30s to exchange

// Import lazily to avoid a require cycle (appAuthController requires models too).
const { findActiveChannelSession } = require('./appAuthController');

const verifyDeviceToken = (token) => {
  const jwt = require('jsonwebtoken');
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (p.ctx !== 'app-device') return null;
    return p;
  } catch {
    return null;
  }
};

/** Mark stale rows expired (cheap, keyed queries only). */
async function expireStale() {
  await QrLoginSession.update(
    { status: 'expired' },
    {
      where: {
        status: { [Op.in]: ['pending', 'scanned'] },
        expires_at: { [Op.lt]: new Date() },
      },
    },
  ).catch(() => {});
}

// ─── 1. Browser: create a QR session ────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    // Per-IP flood guard on top of the route rate-limiter: max 3 live
    // pending sessions per IP.
    const live = await QrLoginSession.count({
      where: {
        browser_ip: req.ip,
        status: 'pending',
        expires_at: { [Op.gt]: new Date() },
      },
    });
    if (live >= 3) {
      return badRequest(res, 'Too many QR codes requested. Please wait a moment.');
    }

    const qrId = generateSecureToken(24); // 48 hex chars
    const payload = `${QR_PREFIX}${qrId}`;
    const expiresAt = new Date(Date.now() + QR_TTL_MS);

    await QrLoginSession.create({
      qr_id: qrId,
      status: 'pending',
      browser_ip: req.ip,
      browser_agent: req.headers['user-agent'],
      expires_at: expiresAt,
    });

    // Server-side QR render — the browser never needs a QR library.
    const qrImage = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 260,
      color: { dark: '#101623', light: '#ffffff' },
    });

    return success(res, 'QR session created', {
      qrId,
      qrImage,
      expiresAt: expiresAt.toISOString(),
      pollMs: 2000,
    });
  } catch (err) {
    logger.error(`qr-login create: ${err.message}`);
    return badRequest(res, 'Could not create QR session.');
  }
};

// ─── 2. Browser: poll status ────────────────────────────────────────────────
exports.status = async (req, res) => {
  try {
    const { qrId } = req.params;
    if (!QR_ID_RE.test(String(qrId || ''))) return badRequest(res, 'Invalid session.');

    await expireStale();
    const s = await QrLoginSession.findOne({ where: { qr_id: qrId } });
    if (!s) return notFound(res, 'Session not found.');

    // Approved → deliver the one-time login token EXACTLY once, then null
    // the raw value so it can never be re-read (hash remains for exchange).
    if (s.status === 'approved' && s.login_token && !s.token_delivered_at) {
      const raw = s.login_token;
      await s.update({ login_token: null, token_delivered_at: new Date() });
      return success(res, 'Approved', { status: 'approved', loginToken: raw });
    }

    return success(res, 'Status', {
      status: s.status === 'consumed' ? 'approved' : s.status,
      expiresAt: s.expires_at,
    });
  } catch (err) {
    logger.error(`qr-login status: ${err.message}`);
    return badRequest(res, 'Could not read session status.');
  }
};

// ─── 3. App: scan the QR ────────────────────────────────────────────────────
exports.scan = async (req, res) => {
  try {
    const { qrPayload, deviceToken, deviceId } = req.body;

    const dt = verifyDeviceToken(deviceToken);
    if (!dt) return unauthorized(res, 'Please verify your identity again.');
    const cleanDeviceId = typeof deviceId === 'string' ? deviceId.slice(0, 100) : null;
    if (!cleanDeviceId || dt.deviceId !== cleanDeviceId) {
      return unauthorized(res, 'Device mismatch.');
    }

    // Strict payload validation (anti-quishing): exact prefix + 48-hex id.
    const raw = String(qrPayload || '');
    if (!raw.startsWith(QR_PREFIX)) {
      return badRequest(res, 'This is not an Alister Bank login QR code.');
    }
    const qrId = raw.slice(QR_PREFIX.length);
    if (!QR_ID_RE.test(qrId)) {
      return badRequest(res, 'This is not an Alister Bank login QR code.');
    }

    await expireStale();
    const s = await QrLoginSession.findOne({ where: { qr_id: qrId } });
    if (!s || s.status === 'expired' || new Date() > new Date(s.expires_at)) {
      return badRequest(res, 'This QR code has expired. Ask the website for a fresh one.');
    }
    if (s.status !== 'pending') {
      return badRequest(res, 'This QR code was already used.');
    }

    const user = await User.findByPk(dt.userId);
    if (!user || user.account_status !== 'active') {
      return unauthorized(res, 'This account is not active.');
    }

    // Scanning FREEZES the session TTL into an approval window (60 more
    // seconds) and binds it to this user + device. Only they can approve.
    await s.update({
      status: 'scanned',
      user_id: user.id,
      device_id: cleanDeviceId,
      scanned_at: new Date(),
      expires_at: new Date(Date.now() + QR_TTL_MS),
    });

    await createAuditLog({
      userId: user.id, action: 'QR_LOGIN_SCANNED', ipAddress: req.ip,
      userAgent: req.headers['user-agent'], status: 'success',
      description: `QR login scanned (browser IP ${s.browser_ip})`,
    });

    // Context for the approval screen — lets the customer reject logins
    // they don't recognize (defeats relayed/MITM'd QR codes).
    return success(res, 'Scanned', {
      qrId,
      context: {
        browser: detectDevice(s.browser_agent) || 'Unknown browser',
        userAgent: (s.browser_agent || '').slice(0, 120),
        ip: s.browser_ip,
        requestedAt: s.createdAt,
      },
    });
  } catch (err) {
    logger.error(`qr-login scan: ${err.message}`);
    return badRequest(res, 'Could not process the QR code.');
  }
};

// ─── 4. App: approve (swipe + MPIN) ─────────────────────────────────────────
exports.approve = async (req, res) => {
  try {
    const { qrId, deviceToken, deviceId, mpin } = req.body;

    const dt = verifyDeviceToken(deviceToken);
    if (!dt) return unauthorized(res, 'Please verify your identity again.');
    const cleanDeviceId = typeof deviceId === 'string' ? deviceId.slice(0, 100) : null;
    if (!cleanDeviceId || dt.deviceId !== cleanDeviceId) {
      return unauthorized(res, 'Device mismatch.');
    }
    if (!QR_ID_RE.test(String(qrId || ''))) return badRequest(res, 'Invalid session.');

    await expireStale();
    const s = await QrLoginSession.findOne({ where: { qr_id: qrId } });
    if (!s || s.status === 'expired' || new Date() > new Date(s.expires_at)) {
      return badRequest(res, 'This login request has expired.');
    }
    // Approval must come from the SAME user + device that scanned.
    if (s.status !== 'scanned' || s.user_id !== dt.userId || s.device_id !== cleanDeviceId) {
      return unauthorized(res, 'This login request cannot be approved from this device.');
    }

    const user = await User.findByPk(dt.userId);
    if (!user || !user.mpin_hash) return unauthorized(res, 'Please verify your identity again.');
    if (user.account_status !== 'active') {
      return unauthorized(res, 'This account is not active.');
    }

    // MPIN verification — same lockout policy as mpin-login (5 tries / 30 min).
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
        userId: user.id, action: 'QR_LOGIN_MPIN_FAILED', ipAddress: req.ip,
        userAgent: req.headers['user-agent'], status: 'failure',
        description: `QR approval wrong MPIN attempt ${attempts}`,
      });
      return unauthorized(res, attempts >= 5
        ? 'Too many wrong attempts. MPIN locked for 30 minutes.'
        : `Incorrect MPIN. ${5 - attempts} attempts remaining.`);
    }
    if (user.mpin_attempts) await user.update({ mpin_attempts: 0, mpin_locked_until: null });

    // One-time login token: hashed at rest; raw stored only until the first
    // status poll delivers it, then nulled.
    const loginToken = generateSecureToken(32);
    await s.update({
      status: 'approved',
      approved_at: new Date(),
      login_token: loginToken,
      login_token_hash: hashValue(loginToken),
      expires_at: new Date(Date.now() + TOKEN_TTL_MS),
    });

    await createAuditLog({
      userId: user.id, action: 'QR_LOGIN_APPROVED', ipAddress: req.ip,
      userAgent: req.headers['user-agent'], status: 'success',
      description: `QR login approved for browser IP ${s.browser_ip}`,
    });

    return success(res, 'Login approved. The website will sign in automatically.');
  } catch (err) {
    logger.error(`qr-login approve: ${err.message}`);
    return badRequest(res, 'Could not approve the login.');
  }
};

// ─── 5. App: reject ─────────────────────────────────────────────────────────
exports.reject = async (req, res) => {
  try {
    const { qrId, deviceToken, deviceId } = req.body;
    const dt = verifyDeviceToken(deviceToken);
    if (!dt) return unauthorized(res, 'Please verify your identity again.');
    if (!QR_ID_RE.test(String(qrId || ''))) return badRequest(res, 'Invalid session.');

    const s = await QrLoginSession.findOne({ where: { qr_id: qrId } });
    if (s && ['pending', 'scanned'].includes(s.status) && s.user_id === dt.userId) {
      await s.update({ status: 'rejected' });
      await createAuditLog({
        userId: dt.userId, action: 'QR_LOGIN_REJECTED', ipAddress: req.ip,
        userAgent: req.headers['user-agent'], status: 'success',
        description: `QR login rejected (browser IP ${s.browser_ip})`,
      });
    }
    return success(res, 'Login request rejected.');
  } catch (err) {
    logger.error(`qr-login reject: ${err.message}`);
    return badRequest(res, 'Could not reject the login.');
  }
};

// ─── 6. Browser: exchange one-time token for a web session ─────────────────
exports.exchange = async (req, res) => {
  try {
    const { qrId, loginToken } = req.body;
    if (!QR_ID_RE.test(String(qrId || '')) || !loginToken) {
      return badRequest(res, 'Invalid exchange request.');
    }

    const s = await QrLoginSession.findOne({ where: { qr_id: qrId } });
    if (
      !s || s.status !== 'approved' || s.consumed_at
      || !s.login_token_hash
      || hashValue(String(loginToken)) !== s.login_token_hash
      || new Date() > new Date(s.expires_at)
    ) {
      return unauthorized(res, 'This login link has expired. Please scan again.');
    }

    // Same-browser binding: the exchange must come from the IP that created
    // the QR session (blocks token exfiltration to another machine).
    if (s.browser_ip && req.ip !== s.browser_ip) {
      await s.update({ status: 'rejected' });
      return unauthorized(res, 'Login request origin mismatch. Please scan again.');
    }

    const user = await User.findByPk(s.user_id);
    if (!user || user.account_status !== 'active') {
      return unauthorized(res, 'This account is not active.');
    }

    // Single-use: kill the QR session BEFORE minting the web session.
    await s.update({ status: 'consumed', consumed_at: new Date(), login_token_hash: null });

    // One-session-at-a-time policy (same as password login): every other
    // session — including the app session used to approve — is signed out.
    // The app returns to its MPIN lock screen; device registration remains.
    await Session.update(
      { is_active: false, logout_at: new Date() },
      { where: { user_id: user.id, is_active: true } },
    );

    const refreshToken = generateSecureToken(32);
    const session = await Session.create({
      user_id: user.id,
      token_hash: 'temp',
      ip_address: req.ip,
      user_agent: req.headers['user-agent'],
      device_type: detectDevice(req.headers['user-agent']),
      is_active: true,
      last_activity: new Date(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      refresh_token_hash: hashValue(refreshToken),
      refresh_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      channel: 'web',
    });
    const token = generateToken(user.id, session.id);
    await session.update({ token_hash: hashValue(token) });

    await user.update({ last_login: new Date() });
    await createAuditLog({
      userId: user.id, action: 'QR_LOGIN_SUCCESS', ipAddress: req.ip,
      userAgent: req.headers['user-agent'], status: 'success',
      description: 'Signed in to NetBanking via QR approval from the mobile app',
    });

    return success(res, 'Signed in', {
      token,
      refreshToken,
      user: {
        id: user.id,
        customerId: user.customer_id,
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        kycStatus: user.kyc_status,
        accountStatus: user.account_status,
      },
    });
  } catch (err) {
    logger.error(`qr-login exchange: ${err.message}`);
    return badRequest(res, 'Could not complete the sign-in.');
  }
};
