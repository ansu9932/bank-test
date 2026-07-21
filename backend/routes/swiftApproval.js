const router = require('express').Router();
const { swiftApprovalLimiter, otpLimiter } = require('../middleware/security');
const swiftApprovalController = require('../controllers/swiftApprovalController');

// ─── SWIFT email self-approval (PUBLIC, token-gated) ─────────────────────────
// All three endpoints are reachable without auth — the emailed one-time token
// is the credential — so every one of them is strictly rate-limited.

// Review the pending transfer behind an approval token.
router.get('/review', swiftApprovalLimiter, swiftApprovalController.review);
// Send the email OTP for this approval (extra OTP ceiling on top).
router.post('/send-otp', swiftApprovalLimiter, otpLimiter, swiftApprovalController.sendOtp);
// Verify the OTP → settle the transfer instantly.
router.post('/verify', swiftApprovalLimiter, swiftApprovalController.verify);

module.exports = router;
