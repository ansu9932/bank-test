const router = require('express').Router();
const kycController = require('../controllers/kycController');
const { panVerifyLimiter } = require('../middleware/security');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · KYC ROUTES (Cashfree Secure ID)
   Public (pre-login) onboarding verification helpers. The PAN endpoint is
   rate-limited with a dedicated, relaxed validation limiter (30 req / 15 min /
   IP) — generous enough for typo corrections and step navigation, while still
   protecting the metered Cashfree verification suite that this proxies.
   ────────────────────────────────────────────────────────────────────────── */

// POST /api/kyc/verify-pan — PAN → registered-name lookup via Cashfree
// synchronous PAN verify (/verification/pan). Validates ONLY the PAN string;
// independent of the multi-step registration form's validation.
router.post('/verify-pan', panVerifyLimiter, kycController.verifyPanController);

module.exports = router;
