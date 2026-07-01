/**
 * ─── Per-user transfer-method locks ──────────────────────────────────────────
 *
 * Every Alister account carries a `transfer_methods` JSON flag set that decides
 * which outgoing rails the customer may use. By PRODUCT POLICY the three
 * external rails — IMPS, NEFT and UPI — are LOCKED (disabled) by default for
 * every new account; only the on-us "Alister Internal" transfer is enabled.
 * An admin must explicitly activate IMPS / NEFT / UPI per user (see
 * adminController.modifyTransferMethods) before those rails can be used.
 *
 * The flags live on Account.transfer_methods. Because the DB column is added
 * later (schema sync is alter:false) existing rows may be NULL — normalize()
 * treats any missing/NULL value as the secure default (externals locked,
 * internal open), so the lock is fail-safe even before the backfill runs.
 */

// Default flag set for a brand-new (or un-backfilled) account.
const DEFAULT_TRANSFER_METHODS = Object.freeze({
  imps: false,
  neft: false,
  upi: false,
  internal: true,
  // "Add Money" (deposit / top-up) is an admin-activated feature, locked by
  // default for every account — only an admin can switch it on.
  add_money: false,
  // SWIFT international transfer — locked by default; admin enables per user.
  swift: false,
});

// Human-readable labels for messages / UI.
const METHOD_LABELS = Object.freeze({
  imps: 'IMPS',
  neft: 'NEFT',
  upi: 'UPI',
  internal: 'Alister Internal',
  add_money: 'Add Money',
  swift: 'SWIFT',
});

// The canonical method keys.
const METHOD_KEYS = Object.freeze(['imps', 'neft', 'upi', 'internal', 'add_money', 'swift']);

/**
 * Map a transfer mode/string (as used by the controllers / frontend) to the
 * canonical method key. Returns null for unrecognised modes (e.g. legacy RTGS),
 * which the callers treat as "not one of the locked rails — allow through".
 * @param {string} mode
 * @returns {('imps'|'neft'|'upi'|'internal'|null)}
 */
function methodKeyFromMode(mode) {
  switch (String(mode || '').trim().toUpperCase()) {
    case 'IMPS': return 'imps';
    case 'NEFT': return 'neft';
    case 'UPI': return 'upi';
    case 'ALISTER':
    case 'INTERNAL': return 'internal';
    case 'SWIFT': return 'swift';
    default: return null;
  }
}

/**
 * Coerce a raw stored value (object, JSON string, or NULL) into a complete,
 * trusted flag set. External rails default to FALSE (locked); internal defaults
 * to TRUE unless it was explicitly disabled.
 * @param {object|string|null} raw
 * @returns {{imps:boolean, neft:boolean, upi:boolean, internal:boolean}}
 */
function normalizeTransferMethods(raw) {
  let parsed = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed !== 'object') parsed = {};
  return {
    imps: parsed.imps === true,
    neft: parsed.neft === true,
    upi: parsed.upi === true,
    // Internal on-us transfers stay enabled unless explicitly turned off.
    internal: parsed.internal !== false,
    // Add Money is locked unless explicitly enabled by an admin.
    add_money: parsed.add_money === true,
    // SWIFT international transfer is locked unless explicitly enabled.
    swift: parsed.swift === true,
  };
}

/**
 * Whether the given account may use the given transfer mode.
 * Unknown modes (key === null) are NOT one of the locked rails, so they pass.
 * @param {object} account  Sequelize Account instance (or plain object)
 * @param {string} mode
 * @returns {boolean}
 */
function isMethodEnabled(account, mode) {
  const key = methodKeyFromMode(mode);
  if (!key) return true; // not a managed rail — leave to other validation
  const methods = normalizeTransferMethods(account && account.transfer_methods);
  return methods[key] === true;
}

/**
 * Standard customer-facing block message for a disabled rail.
 * @param {string} mode
 * @returns {string}
 */
function methodBlockedMessage(mode) {
  const key = methodKeyFromMode(mode);
  const label = (key && METHOD_LABELS[key]) || String(mode || 'This').toUpperCase();
  return `${label} transfers are currently disabled on your account. Please contact Alister Bank to enable this transfer method.`;
}

module.exports = {
  DEFAULT_TRANSFER_METHODS,
  METHOD_LABELS,
  METHOD_KEYS,
  methodKeyFromMode,
  normalizeTransferMethods,
  isMethodEnabled,
  methodBlockedMessage,
};
