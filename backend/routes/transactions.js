const router = require('express').Router();
const { body } = require('express-validator');
const txController = require('../controllers/transactionController');
const { protect, requireActiveAccount } = require('../middleware/auth');
const { transferLimiter, otpLimiter, receiptLimiter, statementEmailLimiter } = require('../middleware/security');

router.use(protect);

router.get('/', txController.getTransactions);
router.get('/mini-statement', txController.getMiniStatement);
router.get('/download-statement', txController.downloadStatement);
// Email statement — layered anti-bot protection: per-IP rate limit (3/15min)
// here, plus per-user cooldown + daily cap inside the controller. The PDF is
// only ever sent to the user's REGISTERED email address.
router.post('/email-statement', statementEmailLimiter, txController.emailStatement);
// Receipt PDF — auth (router-level protect) + ownership check in controller
// + per-IP rate limit against transaction-ID enumeration.
router.get('/:id/receipt', receiptLimiter, txController.downloadReceipt);

router.post('/transfer', requireActiveAccount, transferLimiter, [
  body('toAccountNumber').notEmpty().withMessage('Recipient account number is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('transferMode').isIn(['NEFT', 'RTGS', 'IMPS', 'INTERNAL']).withMessage('Invalid transfer mode'),
  body('securityPin').isLength({ min: 4, max: 4 }).isNumeric().withMessage('Valid 4-digit PIN required'),
], txController.initiateTransfer);

// Email OTP for large transfers (server enforces the threshold in
// initiateTransfer — this endpoint just mints and mails the code).
router.post('/transfer-otp', requireActiveAccount, otpLimiter, txController.requestTransferOTP);

router.get('/beneficiaries', txController.getBeneficiaries);
router.post('/beneficiaries', requireActiveAccount, txController.addBeneficiary);
router.delete('/beneficiaries/:id', requireActiveAccount, txController.deleteBeneficiary);

router.get('/notifications', txController.getNotifications);
router.put('/notifications/read', txController.markNotificationsRead);

router.post('/support-tickets', txController.createTicket);
router.get('/support-tickets', txController.getTickets);

module.exports = router;
