/**
 * SWIFT international-transfer country ruleset (DEMO / simulated).
 *
 * ⚠️ IMPORTANT: This app is a DEMO. No real international payment is ever made.
 * These delivery-time windows are realistic, illustrative estimates for a
 * cross-border SWIFT wire (they depend on correspondent banks, currency,
 * cut-off times, weekends and local bank holidays) — they are shown to the
 * user for realism only. Every SWIFT email also states clearly that the
 * transfer is simulated.
 *
 * Supported corridors: India, Nepal, Bhutan, Bangladesh.
 */

// Shared disclaimer appended to every SWIFT email + shown in the UI.
const SWIFT_DEMO_DISCLAIMER =
  'This is a simulated transfer inside an Alister Bank demo environment. '
  + 'No real money is sent and no real international payment is processed.';

const SWIFT_COUNTRIES = Object.freeze({
  IN: Object.freeze({
    code: 'IN',
    name: 'India',
    currency: 'INR',
    // Typical inbound SWIFT wire to India.
    deliveryLabel: '1–3 business days',
    note: 'Credited after the beneficiary bank clears the inward remittance (RBI/AD-bank processing).',
  }),
  NP: Object.freeze({
    code: 'NP',
    name: 'Nepal',
    currency: 'NPR',
    deliveryLabel: '2–4 business days',
    note: 'Routed via a correspondent bank; Nepal Rastra Bank inward-remittance rules apply.',
  }),
  BT: Object.freeze({
    code: 'BT',
    name: 'Bhutan',
    currency: 'BTN',
    deliveryLabel: '3–5 business days',
    note: 'Fewer direct correspondent links; usually cleared via an intermediary bank (RMA oversight).',
  }),
  BD: Object.freeze({
    code: 'BD',
    name: 'Bangladesh',
    currency: 'BDT',
    deliveryLabel: '2–4 business days',
    note: 'Inward remittance cleared per Bangladesh Bank guidelines via the beneficiary bank.',
  }),
});

const SWIFT_COUNTRY_CODES = Object.freeze(Object.keys(SWIFT_COUNTRIES));

// SWIFT/BIC structural check: 8 or 11 chars — AAAA BB CC (XXX). Uppercase.
const BIC_REGEX = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

function isValidBic(bic) {
  return typeof bic === 'string' && BIC_REGEX.test(String(bic).trim().toUpperCase());
}

function getSwiftCountry(code) {
  return SWIFT_COUNTRIES[String(code || '').trim().toUpperCase()] || null;
}

// Human-readable ETA label used in emails / UI, e.g.
// "typically 2–4 business days (Nepal)". Includes the demo nature implicitly
// via the accompanying disclaimer.
function swiftEtaLabel(code) {
  const c = getSwiftCountry(code);
  if (!c) return 'typically 1–5 business days';
  return `typically ${c.deliveryLabel} to reach a beneficiary in ${c.name}`;
}

module.exports = {
  SWIFT_COUNTRIES,
  SWIFT_COUNTRY_CODES,
  SWIFT_DEMO_DISCLAIMER,
  BIC_REGEX,
  isValidBic,
  getSwiftCountry,
  swiftEtaLabel,
};
