const router = require('express').Router();
const { swiftApprovalLimiter, otpLimiter } = require('../middleware/security');
const swiftApprovalController = require('../controllers/swiftApprovalController');

// ─── SWIFT email self-approval (PUBLIC, token-gated) ─────────────────────────
// All three endpoints are reachable without auth — the emailed one-time token
// is the credential — so every one of them is strictly rate-limited.

// NEVER let browsers/CDNs cache these responses. Without this, Chrome disk-
// caches an early 410 for GET /review and replays it ("from disk cache") even
// after the link becomes valid — the user permanently sees "Link not available".
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
  });
  next();
});

// Review the pending transfer behind an approval token.
router.get('/review', swiftApprovalLimiter, swiftApprovalController.review);
// Send the email OTP for this approval (extra OTP ceiling on top).
router.post('/send-otp', swiftApprovalLimiter, otpLimiter, swiftApprovalController.sendOtp);
// Verify the OTP → settle the transfer instantly.
router.post('/verify', swiftApprovalLimiter, swiftApprovalController.verify);

module.exports = router;
