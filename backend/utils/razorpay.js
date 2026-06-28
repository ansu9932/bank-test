const logger = require('./logger');

/**
 * Razorpay SDK wrapper — Alister Bank UPI deposit pipeline.
 *
 * The SDK is required defensively: if the `razorpay` package is not yet
 * installed (e.g. fresh clone before `npm install`) the whole server must NOT
 * crash on boot. Instead we degrade gracefully and the payment endpoints
 * surface a clean 503 until the dependency + keys are present.
 */
let Razorpay = null;
try {
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  Razorpay = require('razorpay');
} catch (err) {
  logger.warn(
    'Razorpay SDK not installed. Run `npm install razorpay` to enable UPI deposits. '
    + 'Payment endpoints will respond with 503 until the SDK and keys are configured.'
  );
}

let instance = null;

/**
 * Lazily build (and cache) a singleton Razorpay client from env keys.
 * @returns {object|null} configured client, or null when unavailable.
 */
function getRazorpayInstance() {
  if (!Razorpay) return null;
  if (instance) return instance;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    logger.warn('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not configured.');
    return null;
  }

  instance = new Razorpay({ key_id, key_secret });
  return instance;
}

/**
 * Whether the payment pipeline is fully ready (SDK installed + keys present).
 * @returns {boolean}
 */
function isConfigured() {
  return Boolean(getRazorpayInstance());
}

/**
 * Create a dynamic, single-use UPI QR code for a fixed deposit amount.
 *
 * @param {object} params
 * @param {number} params.amount      Amount in INR (rupees).
 * @param {string} params.description Human-readable label shown on UPI apps.
 * @param {object} params.notes       Metadata propagated to the captured payment.
 * @param {number} [params.closeBy]   Unix epoch (seconds) when the QR expires.
 * @returns {Promise<object>} The Razorpay QR code entity.
 */
async function createUpiQr({ amount, description, notes, closeBy }) {
  const client = getRazorpayInstance();
  if (!client) throw new Error('RAZORPAY_NOT_CONFIGURED');

  const payload = {
    type: 'upi_qr',
    name: 'Alister Bank',
    usage: 'single_use',
    fixed_amount: true,
    payment_amount: Math.round(Number(amount) * 100), // paise
    description,
    notes,
  };
  if (closeBy) payload.close_by = closeBy;

  return client.qrCode.create(payload);
}

/**
 * Create a Razorpay Order for a Checkout-based deposit (Card / Net Banking).
 *
 * Unlike the UPI QR flow (which is fixed-amount and polled), high-value deposits
 * open the Razorpay Checkout widget against an Order. We pass the amount in
 * PAISE (rupees * 100) per Razorpay's contract and attach tracking notes so the
 * webhook can resolve the user + credit the balance on capture.
 *
 * @param {object} params
 * @param {number} params.amount     Amount in INR (rupees).
 * @param {string} params.receipt    Our internal order reference (<=40 chars).
 * @param {object} params.notes      Metadata propagated to the captured payment.
 * @returns {Promise<object>} The Razorpay Order entity.
 */
async function createOrder({ amount, receipt, notes }) {
  const client = getRazorpayInstance();
  if (!client) throw new Error('RAZORPAY_NOT_CONFIGURED');

  return client.orders.create({
    amount: Math.round(Number(amount) * 100), // rupees → paise
    currency: 'USD',
    receipt: String(receipt).slice(0, 40),
    payment_capture: 1, // auto-capture on successful authorization
    notes,
  });
}

/**
 * Cryptographically validate an incoming Razorpay webhook signature.
 *
 * @param {string|Buffer} body      The RAW request body (exact bytes received).
 * @param {string} signature        Value of the `x-razorpay-signature` header.
 * @param {string} secret           The configured webhook secret.
 * @returns {boolean} true only when the signature is authentic.
 */
function validateWebhookSignature(body, signature, secret) {
  if (!Razorpay || typeof Razorpay.validateWebhookSignature !== 'function') {
    logger.error('Razorpay SDK unavailable — cannot validate webhook signature.');
    return false;
  }
  if (!signature || !secret) return false;

  try {
    const rawBody = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
    return Razorpay.validateWebhookSignature(rawBody, signature, secret);
  } catch (err) {
    logger.error(`Razorpay signature validation error: ${err.message}`);
    return false;
  }
}

module.exports = {
  getRazorpayInstance,
  isConfigured,
  createUpiQr,
  createOrder,
  validateWebhookSignature,
};
