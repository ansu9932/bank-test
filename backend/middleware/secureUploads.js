const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, AdminUser, Session, KYCDocument } = require('../models');
const logger = require('../utils/logger');

/**
 * Authenticated file server for /uploads.
 *
 * Replaces the previous public express.static('/uploads') mount, which exposed
 * every KYC document (IDs, selfies, KYC videos) to anyone with the URL.
 *
 * Access rules:
 *   • Authenticated ADMIN (active AdminUser)  → may fetch any uploaded file.
 *   • Authenticated USER (active session)     → may fetch ONLY files referenced
 *     by a KYCDocument row that belongs to them (ownership via the DB record).
 *   • Everyone else                           → 401 (no/invalid token) or
 *     403 (valid identity, not the owner).
 *
 * Token sources (in order): Authorization: Bearer header, `?token=` query
 * param (needed for <img>/<video> tags which cannot set headers), then the
 * httpOnly `adminToken` / `accessToken` cookies set at login.
 *
 * Existing upload PATHS are unchanged — files still live under
 * backend/uploads/** and are still addressed as /uploads/<subdir>/<filename>.
 */

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

const deny = (res, status, message) => res.status(status).json({ success: false, message });

// Collect every candidate token from the request (header, query, cookies).
const collectTokens = (req) => {
  const tokens = [];
  if (req.headers.authorization?.startsWith('Bearer ')) {
    tokens.push(req.headers.authorization.split(' ')[1]);
  }
  if (typeof req.query.token === 'string' && req.query.token.length > 0) {
    tokens.push(req.query.token);
  }
  if (req.cookies?.adminToken) tokens.push(req.cookies.adminToken);
  if (req.cookies?.accessToken) tokens.push(req.cookies.accessToken);
  return tokens;
};

const serveUpload = async (req, res) => {
  try {
    // ── 1. Path-traversal guard ─────────────────────────────────────────────
    // Decode, normalize, and ensure the resolved target stays inside uploads/.
    let relPath;
    try {
      relPath = decodeURIComponent(req.path);
    } catch {
      return deny(res, 400, 'Bad request.');
    }
    const absPath = path.resolve(UPLOADS_ROOT, '.' + path.posix.normalize('/' + relPath));
    if (absPath !== UPLOADS_ROOT && !absPath.startsWith(UPLOADS_ROOT + path.sep)) {
      return deny(res, 403, 'Access denied.');
    }

    // ── 2. Authenticate ─────────────────────────────────────────────────────
    const candidates = collectTokens(req);
    if (candidates.length === 0) {
      return deny(res, 401, 'Authentication required to access documents.');
    }

    let decoded = null;
    for (const candidate of candidates) {
      try {
        decoded = jwt.verify(candidate, process.env.JWT_SECRET);
        break;
      } catch {
        /* try the next candidate */
      }
    }
    if (!decoded) return deny(res, 401, 'Invalid or expired authentication token.');

    // ── 3. Authorize ────────────────────────────────────────────────────────
    let authorized = false;

    if (decoded.type === 'admin' && decoded.adminId) {
      const admin = await AdminUser.findByPk(decoded.adminId, { attributes: ['id', 'is_active'] });
      authorized = Boolean(admin && admin.is_active);
    } else if (decoded.type === 'user' && decoded.userId) {
      // Session must still be active server-side (mirrors the `protect` middleware).
      const session = await Session.findOne({ where: { id: decoded.sessionId, is_active: true } });
      const sessionValid = session && !(session.expires_at && new Date() > new Date(session.expires_at));
      if (sessionValid) {
        const user = await User.findByPk(decoded.userId, { attributes: ['id', 'account_status'] });
        if (user && user.account_status !== 'closed') {
          // Ownership check via the DB record: the requested file must be
          // referenced by a KYC document that belongs to THIS user.
          const filename = path.basename(absPath);
          const owned = await KYCDocument.findOne({
            where: {
              user_id: user.id,
              file_path: { [Op.like]: `%${filename}` },
            },
            attributes: ['id'],
          });
          authorized = Boolean(owned);
        }
      }
    }

    if (!authorized) {
      logger.warn(`Denied upload access: ${req.path} (type=${decoded.type || 'unknown'})`);
      return deny(res, 403, 'You do not have permission to access this document.');
    }

    // ── 4. Serve ────────────────────────────────────────────────────────────
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return deny(res, 404, 'File not found.');
    }
    // Never let sensitive documents land in shared caches.
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(absPath);
  } catch (err) {
    logger.error(`Secure uploads error: ${err.message}`);
    return deny(res, 500, 'Failed to serve file.');
  }
};

module.exports = { serveUpload, UPLOADS_ROOT };
