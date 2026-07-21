require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const sequelize = require('./config/database');
const logger = require('./utils/logger');
const { securityHeaders, sanitizeRequest, securityResponseHeaders, apiLimiter, hpp } = require('./middleware/security');
const { runKYCWorkflow } = require('./jobs/kycWorkflow');

// ─── Boot-time secret validation (fail fast, fail loud) ──────────────────────
// The server refuses to start with missing/weak security-critical config so a
// misconfigured deploy can never silently run with (for example) an undefined
// JWT secret. Checked BEFORE any middleware or route is wired up.
function validateRequiredSecrets() {
  const problems = [];

  const required = {
    JWT_SECRET: process.env.JWT_SECRET,
    DB_NAME: process.env.DB_NAME,
    DB_USER: process.env.DB_USER,
    DB_PASS: process.env.DB_PASS,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
  };

  for (const [key, value] of Object.entries(required)) {
    if (!value || String(value).trim().length === 0) {
      problems.push(`${key} is not set`);
    }
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    problems.push(`JWT_SECRET is too short (${process.env.JWT_SECRET.length} chars) — must be at least 32 characters`);
  }

  if (problems.length > 0) {
    const banner = [
      '❌ FATAL: refusing to start — security configuration is invalid:',
      ...problems.map((p) => `   • ${p}`),
      '   Fix the environment (.env / PM2 env) and restart.',
    ].join('\n');
    logger.error(banner);
    console.error(banner);
    process.exit(1);
  }
}
validateRequiredSecrets();

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Trust proxy (for Nginx) ──────────────────────────────────────────────────
app.set('trust proxy', 1);

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(securityHeaders);
app.use(securityResponseHeaders);
app.use(hpp());

// ─── CORS (multi-origin allowlist) ────────────────────────────────────────────
// Allowed: the configured frontend domain (+ www), any extra origins from
// CORS_EXTRA_ORIGINS (comma-separated), and Cloudflare test/preview domains
// (*.workers.dev / *.pages.dev) so the site can be verified before the custom
// domain is attached.
const STATIC_ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'https://alisterbank.online',
  'https://alisterbank.online',
  'https://www.alisterbank.online',
  // Capacitor native app WebView origins. 'https://localhost' is the Android
  // WebView origin (androidScheme: 'https' in capacitor.config.ts) and
  // 'capacitor://localhost' covers the capacitor scheme (iOS/custom builds).
  'capacitor://localhost',
  'https://localhost',
  ...(process.env.CORS_EXTRA_ORIGINS
    ? process.env.CORS_EXTRA_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    : []),
];

const isAllowedOrigin = (origin) => {
  // No Origin header → non-browser client (curl, server-to-server) → allow.
  if (!origin) return true;
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const host = new URL(origin).hostname;
    // Cloudflare Workers/Pages test + preview domains.
    if (host.endsWith('.workers.dev') || host.endsWith('.pages.dev')) return true;
  } catch {
    /* malformed origin → fall through to deny */
  }
  return false;
};

app.use(cors({
  origin: (origin, cb) => (isAllowedOrigin(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'))),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  // 'Cache-Control' MUST stay in this list: the SWIFT approval page sends it
  // on its review request, and a preflight that doesn't allow the header makes
  // the browser hard-block the call as a CORS error (seen as "invalid or
  // expired link" even though the token was never checked).
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Registration-Token', 'X-Chat-Token', 'Cache-Control', 'Pragma'],
}));

// ─── Body Parsing ─────────────────────────────────────────────────────────────
// `verify` captures the EXACT raw bytes of every JSON request into req.rawBody.
// This is required to cryptographically validate the Razorpay webhook signature,
// which must be computed over the unmodified request body.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Compression & Logging ────────────────────────────────────────────────────
app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ─── Sanitize Input ───────────────────────────────────────────────────────────
app.use(sanitizeRequest);

// ─── Uploaded docs (AUTHENTICATED — no public static exposure) ───────────────
// KYC documents contain government IDs, selfies, and KYC videos. They are now
// served ONLY through an authenticated route that verifies the requester owns
// the file (via the KYCDocument DB record) or is an active admin. The public
// express.static mount was removed deliberately — do not re-add it.
// ensureUploadDirs() (run at boot, below) guarantees the tree exists.
const { serveUpload, UPLOADS_ROOT } = require('./middleware/secureUploads');
app.use('/uploads', serveUpload);

// ─── Rate Limiting ────────────────────────────────────────────────────────────
app.use('/api/', apiLimiter);

// ─── Block stray .php calls (this is a Node.js backend — no PHP exists) ───────
// DevTools sometimes shows 404s for paths like `bank-transfer.php`. These do
// NOT originate from this app (there are zero .php files in the codebase) —
// they come from third-party scripts (e.g. Razorpay Checkout internals) or a
// browser extension. This guard simply returns a clean JSON 404 instead of the
// generic HTML fall-through, and keeps such noise out of the real route table.
app.use((req, res, next) => {
  if (req.path.toLowerCase().endsWith('.php')) {
    return res.status(404).json({ success: false, message: 'Not found.' });
  }
  next();
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/app', require('./routes/appAuth'));
app.use('/api/account', require('./routes/account'));
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/payments', require('./routes/payment'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/payouts', require('./routes/payouts'));
app.use('/api/admin', require('./routes/admin'));
// AVA chatbot — public intent engine + in-chat email OTP identity verification.
app.use('/api/chat', require('./routes/chat'));
// QR-code login — scan on the website, approve with swipe + MPIN in the app.
app.use('/api/qr-login', require('./routes/qrLogin'));
// SWIFT email self-approval — public, token-gated review + OTP endpoints
// (strictly rate-limited; the emailed one-time token is the credential).
app.use('/api/swift-approval', require('./routes/swiftApproval'));

// ─── Mobile App: version check + APK download ─────────────────────────────────
// GET /api/version — the Android app calls this on launch and compares the
// installed version. Override values via env without redeploying code:
//   APP_LATEST_VERSION=1.0.0  APP_APK_URL=...  APP_FORCE_UPDATE=true
// Also returns the APK's SHA-256 checksum + byte size (computed once and
// cached until the file's mtime changes) so the download page can display
// integrity-verification info alongside the download button.
let apkChecksumCache = { mtime: 0, sha256: null, size: 0 };
function getApkChecksum() {
  const apkPath = path.join(__dirname, 'downloads', 'AlisterBank.apk');
  try {
    const stat = fs.statSync(apkPath);
    if (stat.mtimeMs !== apkChecksumCache.mtime) {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex');
      apkChecksumCache = { mtime: stat.mtimeMs, sha256: hash, size: stat.size };
    }
    return { sha256: apkChecksumCache.sha256, sizeBytes: apkChecksumCache.size };
  } catch {
    return { sha256: null, sizeBytes: 0 }; // APK not uploaded yet
  }
}

app.get('/api/version', (req, res) => {
  const { sha256, sizeBytes } = getApkChecksum();
  res.json({
    latestVersion: process.env.APP_LATEST_VERSION || '1.0.0',
    apkUrl: process.env.APP_APK_URL || 'https://api.alisterbank.online/downloads/AlisterBank.apk',
    forceUpdate: process.env.APP_FORCE_UPDATE === 'true',
    sha256,
    sizeBytes,
  });
});

// GET /downloads/AlisterBank.apk — serves the signed release APK with the
// correct Android package MIME type so browsers download (never render) it.
// Place the APK at backend/downloads/AlisterBank.apk on the server.
const DOWNLOADS_ROOT = path.join(__dirname, 'downloads');
app.get('/downloads/:file', (req, res) => {
  // Only ever serve the known APK name — no directory traversal surface.
  if (req.params.file !== 'AlisterBank.apk') {
    return res.status(404).json({ success: false, message: 'Not found.' });
  }
  const apkPath = path.join(DOWNLOADS_ROOT, 'AlisterBank.apk');
  if (!fs.existsSync(apkPath)) {
    return res.status(404).json({ success: false, message: 'APK not uploaded yet.' });
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="AlisterBank.apk"');
  // CRITICAL: never let Cloudflare (or browsers) cache the APK. Without this,
  // the edge kept serving stale builds after new uploads and users installed
  // an outdated app.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.sendFile(apkPath);
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    app: 'Alister Bank API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found.` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}\n${err.stack}`);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'One of your files is too large. Please keep each file under 15 MB (photos are compressed automatically in the latest app version — refresh and try again).' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  // Unsupported upload file type (tagged by middleware/upload.js fileFilter).
  // Without this branch a rejected file surfaces as a confusing 500.
  if (err.code === 'INVALID_FILE_TYPE') {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'field';
    return res.status(400).json({ success: false, message: `${field} already exists.` });
  }
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({ success: false, message: err.errors[0]?.message || 'Validation error.' });
  }

  // Honor any explicit client-actionable status set by upstream middleware
  // (e.g. validation guards) so they don't get masked as a generic 500.
  if (err.status === 400 || err.statusCode === 400) {
    return res.status(400).json({ success: false, message: err.message || 'Bad request.' });
  }

  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message,
  });
});

// ─── Database & Server Start ──────────────────────────────────────────────────
/**
 * Ensure the uploads directory tree exists on disk at boot.
 *
 * Multer creates a sub-folder lazily on first upload, but the express.static
 * mount + any direct fetch can 404 if the tree was never created (e.g. a fresh
 * Hostinger container, or after a deploy that doesn't ship empty dirs). We
 * recursively create the uploads root + every known KYC/media sub-folder so
 * assets are always servable immediately, with no manual intervention.
 */
function ensureUploadDirs() {
  const subDirs = ['documents', 'selfies', 'kyc-videos', 'profiles', 'email-attachments'];
  const targets = [UPLOADS_ROOT, ...subDirs.map((d) => path.join(UPLOADS_ROOT, d))];
  targets.forEach((dir) => {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`📁 Created missing upload directory: ${dir}`);
      }
    } catch (e) {
      logger.error(`Failed to create upload directory ${dir}: ${e.message}`);
    }
  });
}

/**
 * Idempotently add the premium debit-card columns to an EXISTING card_requests
 * table. Plain sequelize.sync() won't add columns to a table that already
 * exists, and full alter-sync risks the MySQL 64-index overflow — so we add
 * only the named columns, only when absent, with zero index changes.
 */
async function ensureCardRequestColumns() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');

  // If the table doesn't exist yet, sync() already created it WITH these
  // columns (fresh deploy) — nothing to backfill.
  let table;
  try {
    table = await qi.describeTable('card_requests');
  } catch {
    return; // table absent; plain sync will create it complete.
  }

  const columns = {
    card_network: { type: DataTypes.STRING(20), allowNull: true },
    card_tier: { type: DataTypes.STRING(20), allowNull: true },
    card_number: { type: DataTypes.STRING(16), allowNull: true },
    cvv: { type: DataTypes.STRING(4), allowNull: true },
    expiry_date: { type: DataTypes.STRING(5), allowNull: true },
    controls: { type: DataTypes.JSON, allowNull: true },
    issuance_fee: { type: DataTypes.DECIMAL(10, 2), allowNull: true, defaultValue: 0.00 },
    fee_status: { type: DataTypes.STRING(20), allowNull: true, defaultValue: 'none' },
    fee_reference: { type: DataTypes.STRING(30), allowNull: true },
  };

  for (const [name, def] of Object.entries(columns)) {
    if (!table[name]) {
      try {
        await qi.addColumn('card_requests', name, def);
        logger.info(`card_requests: added column '${name}'.`);
      } catch (e) {
        logger.error(`card_requests: could not add column '${name}': ${e.message}`);
      }
    }
  }

  // The status ENUM gained 'active'. On MySQL the column may be a constrained
  // ENUM; widen it to a plain STRING so 'active' is accepted without an ENUM
  // migration. Best-effort and non-fatal.
  try {
    await qi.changeColumn('card_requests', 'status', { type: DataTypes.STRING(20), allowNull: true });
  } catch (e) {
    logger.warn(`card_requests: status column widen skipped: ${e.message}`);
  }
}

/**
 * Idempotently add the activation-deposit columns to an EXISTING accounts
 * table. Mirrors ensureCardRequestColumns(): only adds the named columns when
 * absent, with no index changes, so it cannot trigger the 64-index overflow.
 */
async function ensureAccountColumns() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');

  let table;
  try {
    table = await qi.describeTable('accounts');
  } catch {
    return; // table absent; plain sync will create it complete.
  }

  const columns = {
    activation_deposit_done: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
    activation_deposit_at: { type: DataTypes.DATE, allowNull: true },
    // Per-user transfer-method locks (IMPS/NEFT/UPI default-off, internal on).
    // Added with NO DB-level default (avoids MySQL JSON-default constraints on
    // older versions); application code normalizes NULL → the secure default.
    transfer_methods: { type: DataTypes.JSON, allowNull: true },
  };

  for (const [name, def] of Object.entries(columns)) {
    if (!table[name]) {
      try {
        await qi.addColumn('accounts', name, def);
        logger.info(`accounts: added column '${name}'.`);
      } catch (e) {
        logger.error(`accounts: could not add column '${name}': ${e.message}`);
      }
    }
  }

  // accounts.account_type has the same stale-ENUM problem as users.account_type
  // (created as ENUM('savings','current') before 'business_elite' existed, and
  // sync is locked to alter:false). The Account row is created by the KYC
  // approval workflow — a constrained ENUM there would fail approval for
  // Business Elite applicants. Widen to a plain STRING; best-effort, non-fatal.
  try {
    await qi.changeColumn('accounts', 'account_type', {
      type: DataTypes.STRING(30), allowNull: false, defaultValue: 'savings',
    });
    logger.info("accounts: widened 'account_type' to STRING(30).");
  } catch (e) {
    logger.warn(`accounts: account_type widen skipped: ${e.message}`);
  }
}

/**
 * Idempotently add the country-specific national-ID columns to an EXISTING
 * users table (Nepal / Bhutan / Bangladesh). Mirrors the other ensure*()
 * helpers: only adds named columns when absent, no index changes.
 */
async function ensureUserColumns() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');

  let table;
  try {
    table = await qi.describeTable('users');
  } catch {
    return; // table absent; plain sync will create it complete.
  }

  const columns = {
    citizenship_number: { type: DataTypes.STRING(30), allowNull: true },
    cid_number: { type: DataTypes.STRING(20), allowNull: true },
    national_id_number: { type: DataTypes.STRING(20), allowNull: true },
    tin_number: { type: DataTypes.STRING(20), allowNull: true },
    // Mobile app MPIN quick-login (native app onboarding).
    mpin_hash: { type: DataTypes.STRING(255), allowNull: true },
    mpin_set_at: { type: DataTypes.DATE, allowNull: true },
    mpin_attempts: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
    mpin_locked_until: { type: DataTypes.DATE, allowNull: true },
    // SWIFT email self-approval eligibility flag (admin-toggled). The approval
    // token itself lives hashed in the transaction's tags — no other schema
    // change is needed for the email self-approval flow.
    swift_email_approval: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
  };

  for (const [name, def] of Object.entries(columns)) {
    if (!table[name]) {
      try {
        await qi.addColumn('users', name, def);
        logger.info(`users: added column '${name}'.`);
      } catch (e) {
        logger.error(`users: could not add column '${name}': ${e.message}`);
      }
    }
  }

  // The account_type ENUM gained 'business_elite' AFTER the live table was
  // created, and schema sync is locked to alter:false — so on the production
  // DB the column is still ENUM('savings','current'). Inserting
  // 'business_elite' then throws "Data truncated for column 'account_type'"
  // (SequelizeDatabaseError → 400 "One or more submitted details are invalid")
  // on POST /api/account/open. Widen it to a plain STRING — the same fix used
  // for card_requests.status / transactions.transfer_mode — so any current or
  // future account tier is accepted with no ENUM migration. Best-effort,
  // non-fatal, adds NO indexes.
  try {
    await qi.changeColumn('users', 'account_type', {
      type: DataTypes.STRING(30), allowNull: false, defaultValue: 'savings',
    });
    logger.info("users: widened 'account_type' to STRING(30).");
  } catch (e) {
    logger.warn(`users: account_type widen skipped: ${e.message}`);
  }
}

/**
 * Idempotently prepare the EXISTING transactions table for SWIFT international
 * transfers. The SWIFT feature was added after the original table shipped, so
 * on a live (un-altered) DB two things break the ledger INSERT and surface as a
 * 500 on POST /api/payments/swift-transfer:
 *
 *   1. `transfer_mode` was a constrained ENUM created WITHOUT 'SWIFT' (and
 *      'REVERSAL'/'SYSTEM'), so inserting transfer_mode='SWIFT' throws
 *      "Data truncated for column 'transfer_mode'". We widen it to a plain
 *      STRING — the same fix used for card_requests.status / kyc document_type
 *      — so any current/future rail value is accepted with no ENUM migration.
 *   2. `to_bank_name` (beneficiary bank on a SWIFT wire) may not exist on the
 *      old table; a missing column makes the INSERT fail with
 *      "Unknown column 'to_bank_name'". We add it only when absent.
 *
 * Also widen `category` to STRING (SWIFT uses the 'swift' discriminator) in case
 * it was created as a constrained ENUM. All steps are best-effort and non-fatal
 * so a boot never crashes on them, and they add NO indexes (no 64-index risk).
 */
async function ensureTransactionColumns() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');

  let table;
  try {
    table = await qi.describeTable('transactions');
  } catch {
    return; // table absent; plain sync creates it complete from the model.
  }

  // Add beneficiary-bank column for SWIFT wires if the old table lacks it.
  if (!table.to_bank_name) {
    try {
      await qi.addColumn('transactions', 'to_bank_name', { type: DataTypes.STRING(200), allowNull: true });
      logger.info("transactions: added column 'to_bank_name'.");
    } catch (e) {
      logger.error(`transactions: could not add column 'to_bank_name': ${e.message}`);
    }
  }

  // Widen transfer_mode ENUM → STRING so 'SWIFT' (and any future rail) inserts
  // without an ENUM migration. Preserve the existing default of 'INTERNAL'.
  try {
    await qi.changeColumn('transactions', 'transfer_mode', {
      type: DataTypes.STRING(20), allowNull: true, defaultValue: 'INTERNAL',
    });
    logger.info("transactions: widened 'transfer_mode' to STRING(20).");
  } catch (e) {
    logger.warn(`transactions: transfer_mode widen skipped: ${e.message}`);
  }

  // Widen category → STRING in case it was originally a constrained ENUM
  // (the SWIFT queue uses the 'swift' category discriminator).
  try {
    await qi.changeColumn('transactions', 'category', { type: DataTypes.STRING(100), allowNull: true });
    logger.info("transactions: widened 'category' to STRING(100).");
  } catch (e) {
    logger.warn(`transactions: category widen skipped: ${e.message}`);
  }

  // Idempotency key for duplicate-transfer prevention (native app retries).
  // Deliberately NO unique index (64-index overflow risk) — uniqueness is
  // enforced in application code with a pre-insert lookup.
  if (!table.idempotency_key) {
    try {
      await qi.addColumn('transactions', 'idempotency_key', { type: DataTypes.STRING(100), allowNull: true });
      logger.info("transactions: added column 'idempotency_key'.");
    } catch (e) {
      logger.error(`transactions: could not add column 'idempotency_key': ${e.message}`);
    }
  }
}

/**
 * Idempotently add the refresh-token-rotation and device-binding columns to an
 * EXISTING sessions table. Mirrors ensureCardRequestColumns(): named columns
 * only, added when absent, zero index changes.
 */
async function ensureSessionColumns() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');

  let table;
  try {
    table = await qi.describeTable('sessions');
  } catch {
    return; // table absent; plain sync creates it complete from the model.
  }

  const columns = {
    refresh_token_hash: { type: DataTypes.STRING(255), allowNull: true },
    refresh_expires_at: { type: DataTypes.DATE, allowNull: true },
    device_id: { type: DataTypes.STRING(100), allowNull: true },
    // 'web' | 'app' — which channel created the session (mutual exclusion).
    channel: { type: DataTypes.STRING(10), allowNull: true, defaultValue: 'web' },
  };

  for (const [name, def] of Object.entries(columns)) {
    if (!table[name]) {
      try {
        await qi.addColumn('sessions', name, def);
        logger.info(`sessions: added column '${name}'.`);
      } catch (e) {
        logger.error(`sessions: could not add column '${name}': ${e.message}`);
      }
    }
  }
}

/**
 * The kyc_documents.document_type column was originally a constrained ENUM. New
 * country document types (citizenship_certificate, cid, national_id, tin) would
 * be rejected by an existing ENUM column, so widen it to a plain STRING — the
 * same approach used for card_requests.status. Best-effort and non-fatal.
 */
async function ensureKycDocumentTypeColumn() {
  const qi = sequelize.getQueryInterface();
  const { DataTypes } = require('sequelize');
  try {
    await qi.describeTable('kyc_documents');
  } catch {
    return; // table absent; plain sync creates it with the full model ENUM.
  }
  try {
    await qi.changeColumn('kyc_documents', 'document_type', { type: DataTypes.STRING(40), allowNull: false });
    logger.info("kyc_documents: widened 'document_type' to STRING(40).");
  } catch (e) {
    logger.warn(`kyc_documents: document_type widen skipped: ${e.message}`);
  }
}

const start = async () => {
  try {
    // Guarantee the uploads tree exists before anything serves/writes to it.
    ensureUploadDirs();

    await sequelize.authenticate();
    logger.info('✅ Database connected successfully.');
    console.log('✅ Database connected successfully.');

    // ─── Schema sync (durable + safe-fallback) ─────────────────────────────────
    // IMPORTANT: alter:true must NOT run on every boot. On MySQL, alter cannot
    // reliably detect existing unique indexes, so it re-adds a new copy
    // (email_2, email_3, …) on each restart until the table exceeds MySQL's hard
    // limit of 64 indexes and sync() crashes with "Too many keys specified".
    //
    // Normal boots use plain sync() — it still auto-creates any MISSING tables
    // (what Hostinger needs) but never re-adds indexes to existing tables.
    //
    // To intentionally realign the schema (e.g. after a model change), do a
    // SINGLE deploy with DB_SYNC_ALTER=true, then remove the flag again. Even in
    // that mode we keep a safe fallback so a failed alter degrades gracefully to
    // a plain sync() instead of crashing the whole server.
    const useAlter = process.env.DB_SYNC_ALTER === 'true';
    if (useAlter) {
      try {
        await sequelize.sync({ alter: false });
        logger.info('✅ Database models synchronized (alter mode).');
        console.log('✅ Database models synchronized (alter mode).');
      } catch (syncErr) {
        // Surface the exact MySQL reason to the Hostinger live dashboard.
        logger.error(`❌ CRITICAL SYNC ERROR: ${syncErr.message}`);
        console.error(`❌ CRITICAL SYNC ERROR: ${syncErr.message}`);
        if (syncErr.original) {
          logger.error(`Raw MySQL Error: ${syncErr.original.message}`);
          console.error(`Raw MySQL Error: ${syncErr.original.message}`);
        }
        console.log('⚠️ Falling back to standard sync to prevent crash...');
        // Plain sync: creates missing tables, leaves existing tables untouched.
        await sequelize.sync();
        logger.info('✅ Database models synchronized using safe fallback.');
        console.log('✅ Database models synchronized using safe fallback.');
      }
    } else {
      // Guardrail: schema sync is explicitly LOCKED to alter:false so existing
      // table schemas are fully protected. Plain sync still auto-creates any
      // MISSING tables, but never alters/re-indexes existing ones.
      await sequelize.sync({ alter: false });
      logger.info('✅ Database models synchronized.');
      console.log('✅ Database models synchronized.');
    }

    // ─── Targeted, idempotent column backfill for card_requests ───────────────
    // Plain sync() never adds columns to an EXISTING table, so the new premium
    // debit-card fields must be added explicitly. This is surgical (only the
    // named columns, only if absent) and adds NO indexes — so it cannot trigger
    // the 64-index overflow that full alter sync does. Safe to run every boot.
    try {
      await ensureCardRequestColumns();
    } catch (colErr) {
      logger.error(`card_requests column backfill failed (non-fatal): ${colErr.message}`);
      console.error(`card_requests column backfill failed (non-fatal): ${colErr.message}`);
    }

    // Activation-deposit columns on accounts (sandbox onboarding simulation).
    try {
      await ensureAccountColumns();
    } catch (colErr) {
      logger.error(`accounts column backfill failed (non-fatal): ${colErr.message}`);
      console.error(`accounts column backfill failed (non-fatal): ${colErr.message}`);
    }

    // Country-specific national-ID columns on users (Nepal/Bhutan/Bangladesh).
    try {
      await ensureUserColumns();
    } catch (colErr) {
      logger.error(`users column backfill failed (non-fatal): ${colErr.message}`);
      console.error(`users column backfill failed (non-fatal): ${colErr.message}`);
    }

    // Widen kyc_documents.document_type so new country doc types are accepted.
    try {
      await ensureKycDocumentTypeColumn();
    } catch (colErr) {
      logger.error(`kyc_documents column backfill failed (non-fatal): ${colErr.message}`);
      console.error(`kyc_documents column backfill failed (non-fatal): ${colErr.message}`);
    }

    // Prepare transactions table for SWIFT: widen transfer_mode/category ENUMs
    // to STRING and add to_bank_name if missing (fixes SWIFT-transfer 500s).
    try {
      await ensureTransactionColumns();
    } catch (colErr) {
      logger.error(`transactions column backfill failed (non-fatal): ${colErr.message}`);
      console.error(`transactions column backfill failed (non-fatal): ${colErr.message}`);
    }

    // Refresh-token rotation + device binding columns for the native app.
    try {
      await ensureSessionColumns();
    } catch (colErr) {
      logger.error(`sessions column backfill failed (non-fatal): ${colErr.message}`);
      console.error(`sessions column backfill failed (non-fatal): ${colErr.message}`);
    }

    // ─── Background jobs — SINGLE INSTANCE ONLY ────────────────────────────────
    // In PM2 cluster mode, runKYCWorkflow()/node-cron schedules inside EVERY
    // worker, so each job (Video KYC, activation-deposit, and account-setup
    // emails, cleanup, daily limit reset) would fire N times per minute. That
    // sends duplicate emails AND multiplies SMTP volume — which on Hostinger's
    // capped mailbox can exhaust the daily send limit and silently drop the LAST
    // email in the funnel (the account-setup link). PM2 exposes a per-worker
    // index in NODE_APP_INSTANCE ('0','1',…); in fork/single mode it's undefined.
    // Run the schedulers (and the one-shot NEFT re-arm) on instance 0 / single
    // mode only so every job executes exactly once.
    const workerInstance = process.env.NODE_APP_INSTANCE;
    const isPrimaryWorker = workerInstance === undefined || workerInstance === '0';

    if (isPrimaryWorker) {
      // Start cron jobs (KYC automated workflow, cleanup, daily limit reset).
      // Wrapped so any background crash is piped explicitly to stdout for the
      // Hostinger live tracking dashboard.
      try {
        runKYCWorkflow();
        logger.info('✅ Background workflows (runKYCWorkflow) started.');
        console.log('✅ Background workflows (runKYCWorkflow) started.');
      } catch (workflowErr) {
        logger.error(`Background workflow failed to start: ${workflowErr.message}`);
        console.error(workflowErr);
      }

      // Re-arm settlement timers for any NEFT payouts left 'processing' by a
      // restart, so they still transition to completed after their delay window.
      try {
        const { resumePendingNeftSettlements } = require('./controllers/payoutController');
        await resumePendingNeftSettlements();
      } catch (neftErr) {
        logger.error(`Failed to resume NEFT settlements: ${neftErr.message}`);
      }
    } else {
      logger.info(`Cluster worker ${workerInstance}: background cron jobs skipped (run only on instance 0).`);
      console.log(`Cluster worker ${workerInstance}: background cron jobs skipped (run only on instance 0).`);
    }

    app.listen(PORT, () => {
      logger.info(`\n🏦 ══════════════════════════════════════════════`);
      logger.info(`   ALISTER BANK API SERVER RUNNING`);
      logger.info(`   Port: ${PORT} | Env: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`   Live: ${process.env.FRONTEND_URL || 'https://alisterbank.online'}`);
      logger.info(`   URL:  http://localhost:${PORT}`);
      logger.info(`══════════════════════════════════════════════\n`);

      console.log('\n🏦 ════════════════════════════════════�����════════');
      console.log('   ALISTER BANK API SERVER RUNNING');
      console.log(`   Port: ${PORT} | Env: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Live: ${process.env.FRONTEND_URL || 'https://alisterbank.online'}`);
      console.log(`   URL:  http://localhost:${PORT}`);
      console.log('══════════════════════════════════════════════\n');
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    console.error(err);
    process.exit(1);
  }
};

start();

module.exports = app;
