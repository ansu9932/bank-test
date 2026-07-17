const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate unique Customer ID: ALB + year + 6 digits
 * Uses crypto.randomInt (CSPRNG) — Math.random is not safe for identifiers.
 */
const generateCustomerID = () => {
  const year = new Date().getFullYear().toString().slice(-2);
  const random = crypto.randomInt(100000, 1000000);
  return `ALB${year}${random}`;
};

/**
 * Generate 16-digit bank account number
 * Format: 4141 (prefix) + 9 digits (middle) + 4 digits (suffix) = 17 chars total
 * The 4-digit suffix range (1000–9999) guarantees a stable, uniform width
 * with no leading-zero truncation.
 */
const generateAccountNumber = () => {
  const prefix = '4141'; // Alister Bank prefix
  const middle = crypto.randomInt(100000000, 1000000000).toString();
  const suffix = crypto.randomInt(1000, 10000).toString();
  return prefix + middle + suffix;
};

/**
 * Generate IFSC Code: ALST0 + 6 digit branch code
 */
const generateIFSC = (branchCode = '000001') => {
  return `ALST0${branchCode}`;
};

/**
 * Generate transaction reference number
 */
const generateReferenceNumber = (mode = 'IMPS') => {
  const timestamp = Date.now().toString();
  const random = crypto.randomInt(1000, 10000);
  return `${mode}${timestamp.slice(-10)}${random}`;
};

/**
 * Generate support ticket number
 */
const generateTicketNumber = () => {
  const ts = Date.now().toString().slice(-8);
  return `TKT${ts}`;
};

/**
 * Generate 6-digit OTP (cryptographically secure)
 */
const generateOTP = () => {
  return crypto.randomInt(100000, 1000000).toString();
};

/**
 * Generate secure random token
 */
const generateSecureToken = (length = 64) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Hash a value using SHA-256
 * NOTE: kept for non-OTP uses (session-token hashes, card-number hashes) so
 * existing stored hashes remain valid. For OTPs use hashOTP() below.
 */
const hashValue = (value) => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

/**
 * Hash an OTP using HMAC-SHA256 keyed with a server-side secret.
 * Unlike a plain (unsalted) SHA-256, an HMAC cannot be brute-forced offline
 * from a leaked hash without also possessing the server secret, which is
 * critical for low-entropy 6-digit codes. The key derives from
 * OTP_HMAC_SECRET (preferred) or falls back to JWT_SECRET.
 */
const hashOTP = (otp) => {
  const secret = process.env.OTP_HMAC_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('OTP_HMAC_SECRET / JWT_SECRET is not configured');
  return crypto.createHmac('sha256', secret).update(String(otp)).digest('hex');
};

/**
 * Mask account number: show only last 4 digits
 */
const maskAccountNumber = (accountNumber) => {
  if (!accountNumber) return '****';
  return 'XXXX XXXX XXXX ' + accountNumber.slice(-4);
};

/**
 * Format currency
 */
const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

/**
 * Calculate OTP expiry (5 minutes from now)
 */
const getOTPExpiry = (minutes = 5) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Get secure link expiry
 */
const getSecureLinkExpiry = (minutes = 5) => {
  return new Date(Date.now() + minutes * 60 * 1000);
};

/**
 * Strict 24-hour expiry for onboarding secure links (Video KYC + Account Setup).
 * Returns the absolute timestamp written into SecureLink.expires_at so an
 * onboarding invitation is valid for exactly 24 hours from issuance.
 */
const ONBOARDING_LINK_EXPIRY_HOURS = 24;
const getOnboardingLinkExpiry = () => {
  return new Date(Date.now() + ONBOARDING_LINK_EXPIRY_HOURS * 60 * 60 * 1000);
};

/**
 * Check if value is expired
 */
const isExpired = (expiryDate) => {
  return new Date() > new Date(expiryDate);
};

/**
 * Sanitize user input
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input.trim().replace(/[<>]/g, '');
};

/**
 * Generate referral code
 */
const generateReferralCode = (name) => {
  const prefix = name.slice(0, 3).toUpperCase();
  const random = crypto.randomInt(10000, 100000);
  return `${prefix}${random}`;
};

/**
 * Compute the Luhn check digit for a numeric string of N-1 digits.
 * @param {string} partial digits WITHOUT the final check digit
 * @returns {number} the check digit (0–9) that makes the full string Luhn-valid
 */
const luhnCheckDigit = (partial) => {
  let sum = 0;
  // The partial's rightmost digit is in an "even" position relative to the
  // (not-yet-appended) check digit, so doubling starts there.
  let double = true;
  for (let i = partial.length - 1; i >= 0; i--) {
    let d = partial.charCodeAt(i) - 48; // fast digit parse
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
};

/**
 * Validate a card number against the Luhn (mod-10) checksum.
 * @param {string} cardNumber digits only
 * @returns {boolean}
 */
const isLuhnValid = (cardNumber) => {
  const digits = String(cardNumber).replace(/\D/g, '');
  if (digits.length < 2) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
};

/**
 * Pick a TEST-compliant Mastercard BIN prefix.
 *
 * Per Mastercard's published BIN structure (and their Unified Checkout test
 * data), valid Mastercard account ranges are:
 *   • the classic 2-digit series 51–55, and
 *   • the newer 4-digit "2-series" 2221–2720.
 * We pick uniformly between the two families so generated TEST cards exercise
 * both ranges. (These are non-funded test PANs — no real account is created.)
 * @returns {string} a leading BIN fragment ('51'..'55' or '2221'..'2720')
 */
const mastercardTestPrefix = () => {
  if (crypto.randomInt(0, 2) === 0) {
    return String(crypto.randomInt(51, 56)); // '51'..'55'
  }
  return String(crypto.randomInt(2221, 2721)); // '2221'..'2720'
};

/**
 * Generate a Luhn-valid 16-digit TEST card number for the given network.
 *   • Visa       → starts with '4'.
 *   • Mastercard → starts with a valid Mastercard BIN (51–55 or 2221–2720),
 *                  matching Mastercard's test-data specification.
 * The final digit is the computed Luhn check digit, so the result always passes
 * standard checksum verification. These are test PANs only — not real cards.
 * @param {'Visa'|'Mastercard'} network
 * @returns {string} 16-digit number
 */
const generateCardNumber = (network) => {
  const prefix = String(network).toLowerCase() === 'mastercard'
    ? mastercardTestPrefix()
    : '4'; // Visa
  // Build the first 15 digits (prefix + random fill), then append check digit.
  let body = prefix;
  while (body.length < 15) {
    body += crypto.randomInt(0, 10).toString();
  }
  body = body.slice(0, 15);
  return body + String(luhnCheckDigit(body));
};

/**
 * Detect a card network from its number (Visa / Mastercard / Unknown).
 * @param {string} cardNumber
 * @returns {'Visa'|'Mastercard'|'Unknown'}
 */
const detectCardNetwork = (cardNumber) => {
  const d = String(cardNumber || '').replace(/\D/g, '');
  if (/^4/.test(d)) return 'Visa';
  const two = parseInt(d.slice(0, 2), 10);
  const four = parseInt(d.slice(0, 4), 10);
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return 'Mastercard';
  return 'Unknown';
};

/**
 * Generate a 3-digit CVV.
 * @returns {string}
 */
const generateCVV = () => String(crypto.randomInt(100, 1000));

/**
 * Generate a card expiry 'MM/YY' a fixed number of years in the future.
 * @param {number} yearsAhead default 5
 * @returns {string}
 */
const generateCardExpiry = (yearsAhead = 5) => {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yy = String((now.getFullYear() + yearsAhead) % 100).padStart(2, '0');
  return `${mm}/${yy}`;
};

/**
 * Mask a 16-digit card number as 'XXXX XXXX XXXX 1234'.
 * @param {string} cardNumber
 * @returns {string}
 */
const maskCardNumber = (cardNumber) => {
  const d = String(cardNumber || '').replace(/\D/g, '');
  if (d.length < 4) return 'XXXX XXXX XXXX XXXX';
  return `XXXX XXXX XXXX ${d.slice(-4)}`;
};

/**
 * Minimum balance required by account type.
 *   • Savings        → $5,298
 *   • Current        → $10,598
 *   • Business Elite → $20,744.90
 * @param {string} accountType 'savings' | 'current' | 'business_elite'
 * @returns {number}
 */
const minimumBalanceForType = (accountType) => {
  const type = String(accountType).toLowerCase();
  if (type === 'business_elite') return 20744.90;
  return type === 'current' ? 10598 : 5298;
};

/**
 * Detect device type from user agent
 */
const detectDevice = (userAgent = '') => {
  if (/mobile/i.test(userAgent)) return 'mobile';
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

/**
 * Paginate results
 */
const paginate = (page = 1, limit = 20) => {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  return { limit: parseInt(limit), offset };
};

module.exports = {
  generateCustomerID,
  generateAccountNumber,
  generateIFSC,
  generateReferenceNumber,
  generateTicketNumber,
  generateOTP,
  generateSecureToken,
  hashValue,
  hashOTP,
  maskAccountNumber,
  formatCurrency,
  getOTPExpiry,
  getSecureLinkExpiry,
  getOnboardingLinkExpiry,
  isExpired,
  sanitizeInput,
  generateReferralCode,
  luhnCheckDigit,
  isLuhnValid,
  generateCardNumber,
  detectCardNetwork,
  generateCVV,
  generateCardExpiry,
  maskCardNumber,
  minimumBalanceForType,
  detectDevice,
  paginate,
};
