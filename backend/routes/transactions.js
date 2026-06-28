const router = require('express').Router();
const { body } = require('express-validator');
const txController = require('../controllers/transactionController');
const { protect, requireActiveAccount } = require('../middleware/auth');
const { transferLimiter } = require('../middleware/security');

router.use(protect);

router.get('/', txController.getTransactions);
router.get('/mini-statement', txController.getMiniStatement);
router.get('/download-statement', txController.downloadStatement);

router.post('/transfer', requireActiveAccount, transferLimiter, [
  body('toAccountNumber').notEmpty().withMessage('Recipient account number is required'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('transferMode').isIn(['NEFT', 'RTGS', 'IMPS', 'INTERNAL']).withMessage('Invalid transfer mode'),
  body('securityPin').isLength({ min: 4, max: 4 }).isNumeric().withMessage('Valid 4-digit PIN required'),
], txController.initiateTransfer);

router.get('/beneficiaries', txController.getBeneficiaries);
router.post('/beneficiaries', requireActiveAccount, txController.addBeneficiary);
router.delete('/beneficiaries/:id', requireActiveAccount, txController.deleteBeneficiary);

router.get('/notifications', txController.getNotifications);
router.put('/notifications/read', txController.markNotificationsRead);

router.post('/support-tickets', txController.createTicket);
router.get('/support-tickets', txController.getTickets);

module.exports = router;
