const router = require('express').Router();
const { protect } = require('../middleware/auth');
const verifyLimits = require('../middleware/verifyLimits');
const paymentController = require('../controllers/paymentController');
const payoutController = require('../controllers/payoutController');
const depositController = require('../controllers/depositController');

// ─── Public webhook ───────────────────────────────────────────────────────────
// Razorpay → server-to-server notifications. No user auth; integrity is enforced
// cryptographically via the x-razorpay-signature header inside the controller.
router.post('/webhook', paymentController.webhook);

// ─── Authenticated deposit endpoints (UPI QR top-up) ──────────────────────────
router.post('/create-qr', protect, paymentController.createQR);
router.get('/status/:orderRef', protect, paymentController.getStatus);
// High-value Checkout deposit (Card / Net Banking) for amounts > $1L.
router.post('/create-deposit-order', protect, depositController.createDepositOrder);

// ─── Outgoing payouts (Opfin / RazorpayX Payroll unified API) ─────────────────
// Real-time UPI provider lookup (debounced from the client).
router.post('/lookup-upi-provider', protect, payoutController.lookupUpiProvider);
// Real-time IFSC branch verification (debounced from the client).
router.get('/verify-ifsc/:ifscCode', protect, payoutController.verifyIfsc);
// Current daily transfer-limit usage for the dashboard header chip.
router.get('/transfer-limit', protect, payoutController.getTransferLimit);
// Disburse: protect → verifyLimits (24h reset + ceiling) → controller.
router.post('/disburse-payout', protect, verifyLimits, payoutController.disbursePayout);
// Internal on-us transfer (Alister → Alister): protect → verifyLimits → controller.
router.post('/internal-transfer', protect, verifyLimits, payoutController.internalTransfer);

module.exports = router;
