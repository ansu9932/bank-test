const axios = require('axios');
const logger = require('./logger');

/**
 * USD → INR conversion for the Alister Bank deposit pipeline.
 *
 * The ledger/balance is denominated in USD (shown with a "$" in the UI), but the
 * UPI / Razorpay rail settles in INR. A "$1" top-up therefore has to be minted
 * as a QR for its live-rate INR equivalent (e.g. 1 USD → ₹95) so the customer
 * pays the correct rupee amount in their UPI app, while their wallet is still
 * credited the USD value they asked for.
 */

// Primary live FX source — no API key required. Returns { rates: { INR: <n> } }.
const FX_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
const FX_TIMEOUT_MS = 6000;
const RATE_TTL_MS = 10 * 60 * 1000; // re-fetch at most once every 10 minutes

// Hard fallback used ONLY when the live API is unreachable and there is no
// previously cached rate. Configurable via env so ops can pin a rate without a
// code change.
const FALLBACK_RATE = Number(process.env.USD_INR_FALLBACK_RATE) || 90;

// In-memory cache of the last successfully fetched rate.
let cached = { rate: null, fetchedAt: 0 };

/**
 * Fetch the current USD→INR rate from the live FX provider.
 * @returns {Promise<number>} A positive INR-per-USD rate.
 */
async function fetchLiveRate() {
  const { data } = await axios.get(FX_ENDPOINT, { timeout: FX_TIMEOUT_MS });
  const rate = Number(data && data.rates && data.rates.INR);
  if (!rate || Number.isNaN(rate) || rate <= 0) {
    throw new Error('FX response did not contain a valid INR rate');
  }
  return rate;
}

/**
 * Current USD→INR market rate.
 *
 * Cached for RATE_TTL_MS. If a live refresh fails it degrades gracefully to the
 * last known-good cached rate, then to the configured FALLBACK_RATE — so a
 * deposit is never blocked purely because the FX provider is briefly down.
 *
 * @returns {Promise<number>}
 */
async function getUsdToInrRate() {
  const now = Date.now();
  if (cached.rate && now - cached.fetchedAt < RATE_TTL_MS) {
    return cached.rate;
  }
  try {
    const rate = await fetchLiveRate();
    cached = { rate, fetchedAt: now };
    logger.info(`USD→INR rate refreshed from live FX feed: ${rate}`);
    return rate;
  } catch (err) {
    logger.error(`Live USD→INR fetch failed: ${err.message}`);
    if (cached.rate) {
      logger.warn(`Using last cached USD→INR rate: ${cached.rate}`);
      return cached.rate;
    }
    logger.warn(`Using fallback USD→INR rate: ${FALLBACK_RATE}`);
    return FALLBACK_RATE;
  }
}

/**
 * Convert a USD amount to its current INR equivalent at the live market rate.
 *
 * @param {number} usdAmount  Amount in USD (the value the user typed).
 * @returns {Promise<{ usdAmount:number, inrAmount:number, rate:number }>}
 *          usdAmount: the original USD value,
 *          inrAmount: USD × rate, rounded to 2 decimals (paise precision),
 *          rate: the USD→INR rate applied.
 */
async function convertUsdToInr(usdAmount) {
  const usd = Number(usdAmount);
  const rate = await getUsdToInrRate();
  const inrAmount = Math.round(usd * rate * 100) / 100; // 2-dp / paise precision
  return { usdAmount: usd, inrAmount, rate };
}

module.exports = {
  getUsdToInrRate,
  convertUsdToInr,
};
