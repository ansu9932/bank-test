const router = require('express').Router();
const adminController = require('../controllers/adminController');
const requestController = require('../controllers/requestController');
const payoutController = require('../controllers/payoutController');
const { adminProtect, requireRole } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');

router.post('/login', authLimiter, adminController.adminLogin);
// Public device gate — the frontend calls this to decide whether to show the
// admin panel at all (unapproved devices see a 404 page).
router.post('/device-check', authLimiter, adminController.checkAdminDevice);

// All routes below require admin auth
router.use(adminProtect);

router.get('/dashboard', adminController.getDashboardStats);

// Users
router.get('/users', adminController.getUsers);
// Onboarding progress dashboard — per-step status for every new signup.
router.get('/onboarding', adminController.getOnboardingProgress);
// Admin device approval (super-admin only) — controls which devices can log in.
router.get('/devices', requireRole('super_admin'), adminController.getAdminDevices);
router.post('/devices/:id/approve', requireRole('super_admin'), adminController.approveAdminDevice);
router.post('/devices/:id/revoke', requireRole('super_admin'), adminController.revokeAdminDevice);
router.get('/users/:id', adminController.getUserDetails);
// Re-send a specific onboarding step's email (verification / video-KYC / deposit / setup).
router.post('/users/:id/resend-step', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.resendOnboardingStep);
// Stream a user's KYC document (Aadhaar/PAN/passport) — admin-token + role protected.
router.get('/users/:id/documents/:docId', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.getUserDocument);
router.post('/users/:id/approve-kyc', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.approveKYC);
router.post('/users/:id/reject-kyc', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.rejectKYC);

// Dedicated Video-KYC review dashboard
router.get('/kyc-queue', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.getKYCQueue);
router.post('/users/:id/kyc-review', requireRole('super_admin', 'admin', 'kyc_officer'), adminController.reviewKYC);

router.post('/users/:id/freeze', requireRole('super_admin', 'admin'), adminController.toggleFreezeAccount);
router.post('/users/:id/manual-transaction', requireRole('super_admin', 'admin'), adminController.manualTransaction);
router.post('/modify-user-ceiling/:userId', requireRole('super_admin', 'admin'), adminController.modifyUserCeiling);
// Activate/deactivate a user's outgoing rails (IMPS/NEFT/UPI locked by default).
router.post('/users/:userId/transfer-methods', requireRole('super_admin', 'admin'), adminController.modifyTransferMethods);

// Transactions
router.get('/transactions', adminController.getAllTransactions);
router.post('/transactions/:id/flag', requireRole('super_admin', 'admin'), adminController.flagTransaction);

// NEFT transfers — admin approval queue. Approve = mark completed + notify;
// Reject = refund the debit + notify. (IMPS/UPI/internal never appear here.)
router.get('/neft-requests', requireRole('super_admin', 'admin'), payoutController.adminListNeftRequests);
router.post('/neft-requests/:id/review', requireRole('super_admin', 'admin'), payoutController.adminReviewNeftTransfer);

// SWIFT international transfers — admin approval queue (DEMO/simulated).
// Approve = mark completed + notify; Reject = refund the debit + notify.
router.get('/swift-requests', requireRole('super_admin', 'admin'), payoutController.adminListSwiftRequests);
router.post('/swift-requests/:id/review', requireRole('super_admin', 'admin'), payoutController.adminReviewSwiftTransfer);

// Manual / broadcast email — admin composes a message and sends it to one,
// many, or all users (individual emails; addresses never shared across users).
router.post('/send-email', requireRole('super_admin', 'admin'), adminController.sendManualEmail);

// Audit & Tickets
router.get('/audit-logs', requireRole('super_admin', 'admin'), adminController.getAuditLogs);
router.get('/tickets', adminController.getAdminTickets);
router.put('/tickets/:id', adminController.updateTicket);

// Service Requests (Debit Card / Cheque Book) — list + process (approve/decline)
router.get('/service-requests', requestController.adminListRequests);
router.patch('/service-requests/:id', requireRole('super_admin', 'admin'), requestController.adminProcessRequest);

// Permanently delete a specific user's card.
router.delete('/user/:userId/card/:cardId', requireRole('super_admin', 'admin'), requestController.adminDeleteUserCard);

// Approved Cards — sandbox allow-list for the activation-deposit simulator.
router.get('/approved-cards', adminController.listApprovedCards);
router.post('/approved-cards', requireRole('super_admin', 'admin'), adminController.addApprovedCard);
router.patch('/approved-cards/:id', requireRole('super_admin', 'admin'), adminController.toggleApprovedCard);
router.delete('/approved-cards/:id', requireRole('super_admin', 'admin'), adminController.deleteApprovedCard);

module.exports = router;
