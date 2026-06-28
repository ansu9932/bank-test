const router = require('express').Router();
const { protect } = require('../middleware/auth');
const verifyLimits = require('../middleware/verifyLimits');
const payoutController = require('../controllers/payoutController');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · PAYOUTS (thin alias)
   A clean alias endpoint that pipes straight into the EXISTING, fully-hardened
   payout pipeline. No transaction/disbursement logic lives here — it reuses the
   identical middleware chain as POST /api/payments/disburse-payout so all
   security guarantees are preserved verbatim:
     protect       → authenticate the user (JWT)
     verifyLimits  → roll the 24h window + enforce the daily ceiling
     disbursePayout→ PIN check, balance check, atomic row-locked ledger debit,
                     Opfin dispatch, NEFT settlement, notifications, audit log
   ────────────────────────────────────────────────────────────────────────── */

// POST /api/payouts/initiate — alias of the guarded disburse-payout flow.
router.post('/initiate', protect, verifyLimits, payoutController.disbursePayout);

module.exports = router;
