const jwt = require('jsonwebtoken');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · ACTIVATION-DEPOSIT LINK (stateless, signed)
   The onboarding "activation deposit" step is gated by a signed JWT emailed to
   the user after their Video KYC is approved. It is stateless (no DB row), so
   it survives a process restart on shared hosting. It carries the userId so the
   public deposit page can resolve the account number + holder name, and the
   deposit submission can credit the right (sandbox) account.

   This is used only by the SIMULATED activation-deposit flow.
   ────────────────────────────────────────────────────────────────────────── */

const TTL_DAYS = 7;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;
const CONTEXT = 'onboarding-deposit';

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not configured');
  return s;
}

/**
 * Issue a signed activation-deposit token bound to a user.
 * @param {string} userId
 * @returns {{ token: string, expiresIn: number }}
 */
function issueDepositToken(userId) {
  const token = jwt.sign({ ctx: CONTEXT, userId: String(userId) }, secret(), {
    expiresIn: TTL_SECONDS,
  });
  return { token, expiresIn: TTL_SECONDS };
}

/**
 * Verify an activation-deposit token.
 * @param {string} token
 * @returns {{ valid: boolean, userId?: string, reason?: 'missing'|'invalid'|'expired' }}
 */
function verifyDepositToken(token) {
  if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' };
  let decoded;
  try {
    decoded = jwt.verify(token, secret());
  } catch (err) {
    if (err.name === 'TokenExpiredError') return { valid: false, reason: 'expired' };
    return { valid: false, reason: 'invalid' };
  }
  if (decoded.ctx !== CONTEXT || !decoded.userId) return { valid: false, reason: 'invalid' };
  return { valid: true, userId: decoded.userId };
}

module.exports = { issueDepositToken, verifyDepositToken, TTL_SECONDS };
