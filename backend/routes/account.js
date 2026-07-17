const router = require('express').Router();
const { body } = require('express-validator');
const accountController = require('../controllers/accountController');
const activationDepositController = require('../controllers/activationDepositController');
const { protect, requireActiveAccount } = require('../middleware/auth');
const { kycUpload, kycFields, videoUpload, profileUpload } = require('../middleware/upload');
const { openAccountLimiter } = require('../middleware/security');
const { validateOpenAccount } = require('../middleware/validateOpenAccount');

// Ephemeral anti-CSRF registration nonce for the secure onboarding gateway
// (HDFC-style). The "Open Account" wizard fetches this when its first step
// mounts, reflects it into the URL, and echoes it back on submit.
router.get('/registration-handshake', accountController.registrationHandshake);

// Layered protection on the public account-opening pipeline:
//   1. openAccountLimiter — max 5 applications/hour/IP, rejected BEFORE multer
//      so throttled bots can't even write upload files to disk.
//   2. kycUpload.fields  — existing typed/size-capped file upload handling.
//   3. validateOpenAccount — strict server-side format + whitelist validation
//      (email, phone, adult DOB, PAN/Aadhaar formats, account type, lengths)
//      so direct-to-API payloads can't bypass the frontend wizard's checks.
router.post('/open',
  openAccountLimiter,
  kycUpload.fields(kycFields),
  validateOpenAccount,
  accountController.openAccount
);

router.get('/verify-video-kyc/:token', accountController.verifyVideoKYCLink);
router.post('/submit-video-kyc',
  videoUpload.single('video'),
  accountController.submitVideoKYC
);

// Cyber Video KYC — still-image capture upload (accepts PNG/JPG snapshot).
// Auth is resolved inside the controller via secure-link token OR Bearer JWT,
// so it serves both the pre-login onboarding flow and logged-in users.
// Use `.fields()` so the optional accompanying `selfie` file (and any text
// fields like `token`) are accepted gracefully instead of triggering a Multer
// "Unexpected field" error.
router.post('/kyc/upload',
  kycUpload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'selfie', maxCount: 1 },
  ]),
  accountController.uploadKYCCapture
);

router.get('/verify-setup/:token', accountController.verifySetupLink);

// ─── Activation deposit (SANDBOX simulation) ──────────────────────────────────
// Public: gated by a signed JWT token emailed after Video KYC approval.
router.get('/activation-deposit/verify/:token', activationDepositController.verifyLink);
router.post('/activation-deposit/submit', activationDepositController.submitDeposit);

// Protected routes
router.get('/details', protect, accountController.getAccountDetails);
router.put('/profile', protect, accountController.updateProfile);
router.post('/request-card', protect, requireActiveAccount, accountController.requestCard);

module.exports = router;
