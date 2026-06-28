const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const createStorage = (subDir) => multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads', subDir);
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

// Accept a file if EITHER its reported MIME type OR its file extension is in
// the allow-list. The extension fallback is important: macOS/iPhone HEIC files
// are frequently delivered by the browser with an empty or
// "application/octet-stream" MIME type, which would otherwise be rejected.
//
// IMPORTANT: a rejected file is reported with a TAGGED 400 error (code
// 'INVALID_FILE_TYPE', status 400) — NOT a bare `new Error`. A bare Error is
// not a MulterError, so the global error handler in server.js let it fall
// through to a confusing HTTP 500. This produces a clear, actionable 400 that
// tells the user exactly which formats are accepted.
const fileFilter = (allowedTypes, allowedExts) => (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const okByMime = allowedTypes.includes(file.mimetype);
  const okByExt = allowedExts.includes(ext);
  if (okByMime || okByExt) {
    cb(null, true);
  } else {
    const err = new Error('Unsupported file type. Please upload a JPG, PNG, HEIC, WebP, or PDF file.');
    err.code = 'INVALID_FILE_TYPE';
    err.status = 400;
    cb(err, false);
  }
};

// NOTE: HEIC/HEIF and WebP are accepted because real devices (especially Macs
// and iPhones) commonly produce them. KYC files are stored as-is (not
// transcoded), so accepting these formats is safe and unblocks onboarding.
const documentTypes = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif', 'application/pdf',
];
const imageTypes = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
  'image/heic', 'image/heif',
];
const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];

// Extension fallbacks (lower-case, with leading dot) used when the browser
// reports a missing/generic MIME type (common for HEIC on macOS/iPhone).
// NOTE: these were accidentally dropped during a merge; without them the
// fileFilter(...) calls below reference undefined variables and the whole
// module throws ReferenceError on load, crashing the server at boot.
const documentExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.pdf'];
const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
const videoExts = ['.mp4', '.webm', '.mov'];

const MAX_DOC_SIZE = 15 * 1024 * 1024; // 15MB (safety net; client compresses images)
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

const kycUpload = multer({
  storage: createStorage('documents'),
  limits: { fileSize: MAX_DOC_SIZE },
  fileFilter: fileFilter(documentTypes, documentExts),
});

const selfieUpload = multer({
  storage: createStorage('selfies'),
  limits: { fileSize: MAX_DOC_SIZE },
  fileFilter: fileFilter(imageTypes, imageExts),
});

const videoUpload = multer({
  storage: createStorage('kyc-videos'),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: fileFilter(videoTypes, videoExts),
});

const profileUpload = multer({
  storage: createStorage('profiles'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter(imageTypes, imageExts),
});

// KYC multi-document upload fields. Covers every country's document set
// (India + Nepal/Bhutan/Bangladesh national IDs). Only the fields relevant to
// the chosen country are actually sent; the rest are simply absent.
const kycFields = [
  // India
  { name: 'aadhaar', maxCount: 1 },
  { name: 'pan', maxCount: 1 },
  // Nepal / Bhutan / Bangladesh
  { name: 'citizenship_certificate', maxCount: 1 },
  { name: 'cid', maxCount: 1 },
  { name: 'national_id', maxCount: 1 },
  { name: 'tin', maxCount: 1 },
  // Common
  { name: 'passport', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
  { name: 'signature', maxCount: 1 },
  { name: 'address_proof', maxCount: 1 },
];

module.exports = { kycUpload, selfieUpload, videoUpload, profileUpload, kycFields };
