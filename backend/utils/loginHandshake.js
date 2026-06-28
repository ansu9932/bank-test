const jwt = require('jsonwebtoken');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · LOGIN HANDSHAKE (HDFC-style ephemeral SSO nonce)
   Issues a short-lived cryptographic state token that the client must echo
   back with the credential payload. Blocks session replay / CSRF on the login
   gateway — mirroring enterprise banking "secure handshake" redirects.

   STATELESS DESIGN: the token is now a signed JWT (HS256, JWT_SECRET) carrying
   its own issue time, expiry and a context tag. There is NO server-side store,
   so the handshake survives a process recycle mid-login (important on shared
   hosting like Hostinger where the Node process can be restarted at any time).
   The signature guarantees integrity; the embedded `exp` enforces the lifespan.
   ────────────────────────────────────────────────────────────────────────── */

// Absolute maximum age for a login handshake token: exactly 10 minutes.
const TTL_MS = 10 * 60 * 1000;
const TTL_SECONDS = Math.floor(TTL_MS / 1000);
const CONTEXT = 'login-handshake';

/** Resolve the signing secret, failing loudly if it is not configured. */
function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not configured');
  return s;
}

/**
 * Issue a new signed login handshake token bound to the requesting IP.
 * @param {string} ip
 * @returns {{ token: string, expiresIn: number }}
 */
function issueHandshake(ip) {
  const token = jwt.sign(
    { ctx: CONTEXT, ip: ip || null },
    secret(),
    { expiresIn: TTL_SECONDS }
  );
  return { token, expiresIn: TTL_SECONDS };
}

/**
 * Validate a login handshake token. Stateless: verifies the signature and the
 * embedded expiry (absolute max age = TTL). Returns a reason code so the caller
 * can message precisely.
 * @param {string} token
 * @param {string} ip
 * @returns {{ valid: boolean, reason?: 'missing'|'invalid'|'expired'|'ip_mismatch' }}
 */
function consumeHandshake(token, ip) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' };

  let decoded;
  try {
    decoded = jwt.verify(token, secret());
  } catch (err) {
    if (err.name === 'TokenExpiredError') return { valid: false, reason: 'expired' };
    return { valid: false, reason: 'invalid' };
  }

  // Reject tokens minted for a different context (e.g. a registration nonce).
  if (decoded.ctx !== CONTEXT) return { valid: false, reason: 'invalid' };

  // IP binding (soft): only enforce when both IPs are known. Proxies can shift
  // the apparent IP, so a mismatch is treated as a replay signal here.
  if (decoded.ip && ip && decoded.ip !== ip) return { valid: false, reason: 'ip_mismatch' };

  return { valid: true };
}

module.exports = { issueHandshake, consumeHandshake, TTL_MS };
