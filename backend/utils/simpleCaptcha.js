const crypto = require('crypto');

/**
 * Self-hosted CAPTCHA — no external service (replaces Cloudflare Turnstile).
 *
 * issueCaptcha() returns an inline SVG image + an opaque, encrypted token that
 * carries the (lowercased) answer and an expiry. The answer is AES-256-GCM
 * encrypted with a key derived from JWT_SECRET, so the client cannot read or
 * forge it. verifyCaptcha(token, answer) decrypts and compares.
 *
 * Stateless: no DB row or session needed. Tokens are single-use in practice
 * because the reset flow always requests a fresh captcha on load / failure.
 */

const ALGO = 'aes-256-gcm';
// Unambiguous character set (no 0/O, 1/I/L) to avoid user confusion.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 5 * 60 * 1000; // 5 minutes
const LENGTH = 5;

function key() {
  return crypto.createHash('sha256')
    .update(process.env.JWT_SECRET || 'alister-captcha-fallback-key')
    .digest();
}

function randomText(len = LENGTH) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += CHARS[bytes[i] % CHARS.length];
  return s;
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

// Build a noisy inline SVG so simple OCR/bots can't trivially read it.
function buildSvg(text) {
  const w = 170;
  const h = 56;
  const palette = ['#CC0000', '#FF3333', '#FFFFFF', '#FF8888', '#E0E0E0'];
  let body = '';

  // Background.
  body += `<rect width="100%" height="100%" fill="#141414"/>`;

  // Noise lines.
  for (let i = 0; i < 5; i++) {
    const c = palette[Math.floor(rand(0, palette.length))];
    body += `<line x1="${rand(0, w)}" y1="${rand(0, h)}" x2="${rand(0, w)}" y2="${rand(0, h)}" stroke="${c}" stroke-width="1" opacity="0.35"/>`;
  }

  // Characters, each jittered + rotated.
  text.split('').forEach((ch, i) => {
    const x = 20 + i * 29 + rand(-3, 3);
    const y = 38 + rand(-4, 4);
    const rot = Math.floor(rand(-22, 22));
    const c = palette[Math.floor(rand(0, palette.length))];
    body += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="monospace" font-size="30" font-weight="bold" fill="${c}" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})">${ch}</text>`;
  });

  // Speckle dots.
  for (let i = 0; i < 24; i++) {
    body += `<circle cx="${rand(0, w).toFixed(1)}" cy="${rand(0, h).toFixed(1)}" r="1" fill="#999" opacity="0.5"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="CAPTCHA challenge">${body}</svg>`;
}

function encryptAnswer(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const payload = JSON.stringify({ a: text.toLowerCase(), e: Date.now() + TTL_MS });
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv(12) + tag(16) + ciphertext, base64url so it's URL/JSON safe.
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

/**
 * Generate a fresh captcha.
 * @returns {{ svg: string, token: string }}
 */
function issueCaptcha() {
  const text = randomText();
  return { svg: buildSvg(text), token: encryptAnswer(text) };
}

/**
 * Verify a user's answer against the encrypted token.
 * @returns {boolean}
 */
function verifyCaptcha(token, answer) {
  if (!token || !answer) return false;
  try {
    const buf = Buffer.from(token, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    const { a, e } = JSON.parse(dec);
    if (!a || Date.now() > e) return false;
    return String(answer).trim().toLowerCase() === a;
  } catch {
    return false;
  }
}

module.exports = { issueCaptcha, verifyCaptcha };
