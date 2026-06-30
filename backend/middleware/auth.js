const jwt = require('jsonwebtoken');
const { User, AdminUser, Session, AdminDevice } = require('../models');
const { unauthorized, forbidden } = require('../utils/apiResponse');
const { hashValue } = require('../utils/helpers');
const logger = require('../utils/logger');

/**
 * Protect user routes — verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Extract from Authorization header or cookie
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) return unauthorized(res, 'Authentication required. Please log in.');

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') return unauthorized(res, 'Session expired. Please log in again.');
      return unauthorized(res, 'Invalid authentication token.');
    }

    // Check session in DB
    const session = await Session.findOne({
      where: { id: decoded.sessionId, is_active: true },
    });

    if (!session) return unauthorized(res, 'Session not found or expired.');
    if (session.expires_at && new Date() > new Date(session.expires_at)) {
      await session.update({ is_active: false });
      return unauthorized(res, 'Session expired. Please log in again.');
    }

    // Get user
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password_hash', 'security_pin'] },
    });

    if (!user) return unauthorized(res, 'User account not found.');
    if (user.account_status === 'closed') return forbidden(res, 'This account has been closed.');
    if (user.locked_until && new Date() < new Date(user.locked_until)) {
      return forbidden(res, 'Account temporarily locked due to too many failed attempts.');
    }

    // Update last activity
    await session.update({ last_activity: new Date() });

    req.user = user;
    req.session = session;
    req.token = token;
    next();
  } catch (err) {
    logger.error(`Auth middleware error: ${err.message}`);
    return unauthorized(res, 'Authentication failed.');
  }
};

/**
 * Require account to be active
 */
const requireActiveAccount = (req, res, next) => {
  if (req.user.account_status !== 'active') {
    return forbidden(res, `Account is ${req.user.account_status}. Please contact support.`);
  }
  next();
};

/**
 * Protect admin routes
 */
const adminProtect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.adminToken) {
      token = req.cookies.adminToken;
    }

    if (!token) return unauthorized(res, 'Admin authentication required.');

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return unauthorized(res, 'Invalid or expired admin token.');
    }

    if (decoded.type !== 'admin') return forbidden(res, 'Access denied.');

    const admin = await AdminUser.findByPk(decoded.adminId, {
      attributes: { exclude: ['password_hash'] },
    });

    if (!admin || !admin.is_active) return unauthorized(res, 'Admin account not found or inactive.');

    // ── Device approval re-check (enforces revocation mid-session) ──────────
    // Tokens issued by the device-gated login carry the deviceId. If that
    // device has since been revoked (or deleted), reject immediately so access
    // is cut off without waiting for the 12h token to expire. Legacy tokens
    // minted before this feature have no deviceId and are allowed through until
    // they expire (the next login will register/gate the device).
    if (decoded.deviceId) {
      const device = await AdminDevice.findOne({ where: { device_id: decoded.deviceId } });
      if (!device || device.status !== 'approved') {
        return unauthorized(res, 'This device is no longer approved for admin access. Please sign in again.');
      }
    }

    req.admin = admin;
    next();
  } catch (err) {
    logger.error(`Admin auth middleware error: ${err.message}`);
    return unauthorized(res, 'Admin authentication failed.');
  }
};

/**
 * Role-based access control for admin
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.admin) return unauthorized(res, 'Admin authentication required.');
  if (!roles.includes(req.admin.role)) {
    return forbidden(res, `Role '${req.admin.role}' is not authorized for this action.`);
  }
  next();
};

/**
 * Generate JWT access token
 */
const generateToken = (userId, sessionId) => {
  return jwt.sign(
    { userId, sessionId, type: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

/**
 * Generate admin JWT
 */
const generateAdminToken = (adminId, deviceId = null) => {
  return jwt.sign(
    { adminId, deviceId, type: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
};

module.exports = {
  protect,
  requireActiveAccount,
  adminProtect,
  requireRole,
  generateToken,
  generateAdminToken,
};
