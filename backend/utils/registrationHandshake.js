const jwt = require('jsonwebtoken');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · REGISTRATION HANDSHAKE (HDFC-style ephemeral onboarding nonce)
   Issues a cryptographic tracking token (anti-CSRF registration nonce) that the
   multi-step "Open Account" wizard mints the moment its first step mounts. The
   client reflects it into the URL and echoes it back in the request headers
   when it fires the compiled form data, so the onboarding gateway can block
   replay / CSRF on the account-creation pipeline.

   STATELESS DESIGN: the token is now a signed JWT (HS256, JWT_SECRET) carrying
   its own issue time, expiry and a context tag. There is NO server-side store,
   so the handshake survives a process recycle mid-onboarding (important on
   shared hosting like Hostinger where the Node process can be restarted at any
   time). The signature guarantees integrity; the embedded `exp` enforces the
   lifespan. A dedicated context tag keeps it distinct from the login nonce.
   ────────────────────────────────────────────────────────────────────────── */

// Absolute maximum age for a registration handshake token: exactly 40 minutes,
// generous for a multi-step KYC funnel with document uploads.
const TTL_MS = 40 * 60 * 1000;
const TTL_SECONDS = Math.floor(TTL_MS / 1000);
const CONTEXT = 'registration-handshake';

/** Resolve the signing secret, failing loudly if it is not configured. */
function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not configured');
  return s;
}

/**
 * Issue a new signed registration handshake token bound to the requesting IP.
 * @param {string} ip
 * @returns {{ token: string, expiresIn: number }}
 */
function issueRegistrationHandshake(ip) {
  const token = jwt.sign(
    { ctx: CONTEXT, ip: ip || null },
    secret(),
    { expiresIn: TTL_SECONDS }
  );
  return { token, expiresIn: TTL_SECONDS };
}

/**
 * Validate a registration handshake token. Stateless: verifies the signature
 * and the embedded expiry (absolute max age = TTL). Returns a reason code so
 * the caller can message precisely.
 * @param {string} token
 * @param {string} ip
 * @returns {{ valid: boolean, reason?: 'missing'|'invalid'|'expired'|'ip_mismatch' }}
 */
function consumeRegistrationHandshake(token, ip) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' };

  let decoded;
  try {
    decoded = jwt.verify(token, secret());
  } catch (err) {
    if (err.name === 'TokenExpiredError') return { valid: false, reason: 'expired' };
    return { valid: false, reason: 'invalid' };
  }

  // Reject tokens minted for a different context (e.g. a login nonce).
  if (decoded.ctx !== CONTEXT) return { valid: false, reason: 'invalid' };

  // IP binding (soft): only enforce when both IPs are known. Proxies can shift
  // the apparent IP, so a mismatch is treated as a replay signal here.
  if (decoded.ip && ip && decoded.ip !== ip) return { valid: false, reason: 'ip_mismatch' };

  return { valid: true };
}

module.exports = { issueRegistrationHandshake, consumeRegistrationHandshake, TTL_MS };
