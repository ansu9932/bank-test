const router = require('express').Router();
const { protect, requireActiveAccount } = require('../middleware/auth');
const requestController = require('../controllers/requestController');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · SERVICE REQUEST ROUTES (user-facing)
   Premium debit-card (issuance-fee gated) + cheque-book submission, the user's
   own card view, and PIN-gated card controls. Every route requires an
   authenticated, active account (controls/list require auth only). Admin review
   routes are mounted under /api/admin (see admin.js).
   ────────────────────────────────────────────────────────────────────────── */

// Submissions (active account required).
router.post('/debit-card', protect, requireActiveAccount, requestController.requestDebitCard);
router.post('/checkbook', protect, requireActiveAccount, requestController.requestCheckbook);

// Read.
router.get('/mine', protect, requestController.getMyRequests);
router.get('/my-card', protect, requestController.getMyCard);

// PIN-gated card controls (freeze, ATM, domestic, international, limits).
router.patch('/card/:id/controls', protect, requireActiveAccount, requestController.updateCardControls);

// PIN-gated secure reveal of full card number + CVV (temporary client display).
router.post('/card/:id/reveal', protect, requireActiveAccount, requestController.revealCard);

module.exports = router;
