const { randomUUID } = require('crypto');
const { Account, Transaction } = require('../models');
const { createOrder, isConfigured } = require('../utils/razorpay');
const { createAuditLog } = require('../middleware/auditLogger');
const { success, error, badRequest, notFound } = require('../utils/apiResponse');
const { normalizeTransferMethods } = require('../utils/transferMethods');
const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · CONDITIONAL DEPOSIT GATEWAY
   High-value deposits (> $100,000) cannot use UPI/QR (NPCI per-txn cap), so
   they open the Razorpay Checkout widget against a server-created Order with a
   forced method preference (Card or Net Banking). The shared webhook in
   paymentController credits the balance on `payment.captured`.
   ────────────────────────────────────────────────────────────────────────── */

// $100,000 — the UPI/QR per-transaction ceiling.
const UPI_QR_CAP = 100000;
const MIN_DEPOSIT = 1;
// Razorpay hard cap for a single order ($50,000,000). Keeps payloads sane.
const MAX_DEPOSIT = 50000000;

// Methods routed through the Checkout Order flow (this controller).
const CHECKOUT_METHODS = ['card', 'netbanking'];
// Methods that belong to the QR flow and must be rejected above the cap.
const QR_METHODS = ['upi', 'qr'];

// Allow-listed Net Banking partner codes (mirror of the frontend grid). The
// selected code is echoed back so the hosted widget can route straight to the
// chosen bank's login, skipping Razorpay's bank-picker screen. No cardholder
// data is involved, so this stays within PCI SAQ A scope.
const NETBANKING_BANK_CODES = new Set([
  'HDFC', // HDFC Bank
  'ICIC', // ICICI Bank
  'SBIN', // State Bank of India
  'UTIB', // Axis Bank
  'KKBK', // Kotak Mahindra Bank
  'YESB', // Yes Bank
  'IDFB', // IDFC FIRST Bank
  'INDB', // IndusInd Bank
]);

const DEPOSIT_PENDING_DESCRIPTION = 'Deposit via Razorpay Checkout (awaiting payment)';

/** Compact, unique order reference embedded in Razorpay notes + reference_number. */
function buildOrderRef() {
  return `DEP-${randomUUID().replace(/-/g, '').slice(0, 22)}`;
}

// ─── Create a Checkout deposit order ──────────────────────────────────────────
// POST /api/payments/create-deposit-order   (protected)
// Body: { amount, paymentMethod }  where paymentMethod ∈ 'card' | 'netbanking'
//       (and 'upi'/'qr' are explicitly rejected above the $1L cap).
exports.createDepositOrder = async (req, res) => {
  try {
    if (!isConfigured()) {
      return error(res, 'Payment gateway is not configured. Please try again later.', 503);
    }

    // ── Add Money lock ────────────────────────────────────────────────────────
    // Deposits are an admin-activated feature, disabled by default per account.
    const depositAccount = await Account.findOne({ where: { user_id: req.user.id } });
    if (!depositAccount) return notFound(res, 'No active bank account found for this profile.');
    if (!normalizeTransferMethods(depositAccount.transfer_methods).add_money) {
      return error(res, 'Add Money is currently disabled on your account. Please contact Alister Bank to enable it.', 403);
    }

    const amount = parseFloat(req.body.amount);
    const paymentMethod = String(req.body.paymentMethod || '').toLowerCase().trim();
    // Optional Net Banking partner code (e.g. 'HDFC', 'SBIN'). Upper-cased and
    // validated against the allow-list only when method === 'netbanking'.
    const bankCode = String(req.body.bank || '').toUpperCase().trim();

    // ── Amount validation ─────────────────────────────────────────────────────
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return badRequest(res, 'Please enter a valid deposit amount.');
    }
    if (amount < MIN_DEPOSIT) return badRequest(res, `Minimum deposit is $${MIN_DEPOSIT}.`);
    if (amount > MAX_DEPOSIT) {
      return badRequest(res, `Maximum deposit per transaction is $${MAX_DEPOSIT.toLocaleString('en-US')}.`);
    }

    // ── Conditional rule: UPI/QR is hard-capped at $100,000 ──────────────────
    if (amount > UPI_QR_CAP && QR_METHODS.includes(paymentMethod)) {
      return badRequest(
        res,
        `UPI/QR payments are capped at $${UPI_QR_CAP.toLocaleString('en-US')}. Please choose Card or Net Banking for this amount.`
      );
    }

    // This controller only services the Checkout rails (card / netbanking).
    // UPI/QR deposits continue to use POST /api/payments/create-qr.
    if (!CHECKOUT_METHODS.includes(paymentMethod)) {
      return badRequest(res, 'Select a valid payment method: Card or Net Banking.');
    }

    // ── Net Banking: validate the optional partner code (if supplied) ─────────
    // The code is optional — when omitted the widget shows the bank list; when
    // present it must be one we recognise so we never forward a bad routing hint.
    if (paymentMethod === 'netbanking' && bankCode && !NETBANKING_BANK_CODES.has(bankCode)) {
      return badRequest(res, 'Unsupported bank selection. Please choose a bank from the list.');
    }

    const account = await Account.findOne({ where: { user_id: req.user.id } });
    if (!account) return notFound(res, 'No active bank account found for this profile.');

    const userName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Customer';
    const orderRef = buildOrderRef();

    const notes = {
      orderRef,
      userId: String(req.user.id),
      accountId: String(account.id),
      userName,
      purpose: 'wallet_topup',
      method: paymentMethod,
      ...(paymentMethod === 'netbanking' && bankCode ? { bank: bankCode } : {}),
    };

    // ── Create the Razorpay Order (amount mapped to paise inside createOrder) ─
    const order = await createOrder({ amount, receipt: orderRef, notes });

    // Pre-create the PENDING ledger record keyed on orderRef. The shared webhook
    // (payment.captured) flips this to completed and credits the balance.
    try {
      await Transaction.create({
        account_id: account.id,
        reference_number: orderRef,
        transaction_type: 'credit',
        transfer_mode: 'IMPS',
        amount,
        description: DEPOSIT_PENDING_DESCRIPTION,
        narration: `Razorpay ${paymentMethod} · ${orderRef}`,
        category: 'deposit',
        status: 'pending',
        from_account_name: `${paymentMethod === 'card' ? 'Card' : 'Net Banking'} Deposit`,
        tags: {
          provider: 'razorpay',
          rzpOrderId: order.id,
          orderRef,
          method: paymentMethod,
          userId: String(req.user.id),
        },
      });
    } catch (txErr) {
      // Non-fatal: the webhook has a fallback that creates the record on credit.
      logger.error(`Pending deposit record creation failed (${orderRef}): ${txErr.message}`);
    }

    // Method config forwarded to the Razorpay Checkout widget so the chosen rail
    // is preferred/forced in the UI.
    const methodConfig = paymentMethod === 'card'
      ? { card: true, netbanking: false, upi: false, wallet: false, paylater: false }
      : { netbanking: true, card: false, upi: false, wallet: false, paylater: false };

    logger.info(`Deposit order created: orderRef=${orderRef} rzpOrder=${order.id} amount=$${amount} method=${paymentMethod} user=${req.user.id}`);

    createAuditLog({
      userId: req.user.id,
      action: 'DEPOSIT_ORDER_CREATED',
      entityType: 'Transaction',
      entityId: orderRef,
      ipAddress: req.ip,
      status: 'success',
      description: `Checkout deposit order of $${amount} via ${paymentMethod}.`,
    }).catch(() => {});

    return success(res, {
      orderRef,
      orderId: order.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount,
      amountPaise: order.amount,
      currency: order.currency || 'USD',
      paymentMethod,
      methodConfig,
      // Echoed back so the client can route the hosted widget straight to the
      // chosen bank's login (null when no specific bank was selected).
      bank: paymentMethod === 'netbanking' && bankCode ? bankCode : null,
      name: 'Alister Bank',
      description: `Wallet top-up · ${userName}`,
      prefill: {
        name: userName,
        email: req.user.email || '',
        contact: req.user.phone || '',
      },
    }, 'Deposit order created. Complete payment to credit your account.');
  } catch (err) {
    // Razorpay SDK errors arrive as `StatusCodeError` with a `statusCode` and a
    // nested `error.description`. Forward the real status + reason so genuine
    // gateway/validation failures stop surfacing as opaque 500s to the client.
    const rzpStatus = err?.statusCode;
    const rzpDescription = err?.error?.description || err?.error?.reason;

    if (err.message === 'RAZORPAY_NOT_CONFIGURED') {
      logger.error('create-deposit-order: gateway not configured');
      return error(res, 'Payment gateway is not configured. Please try again later.', 503);
    }

    if (rzpStatus) {
      logger.error(`create-deposit-order gateway error [${rzpStatus}]: ${rzpDescription || err.message}`);
      // Map 4xx gateway responses (e.g. bad amount, auth) to a 400 so the client
      // shows an actionable message; anything else stays a 502 (upstream fault).
      const clientStatus = rzpStatus >= 400 && rzpStatus < 500 ? 400 : 502;
      return error(
        res,
        rzpDescription || 'The payment gateway rejected this deposit. Please try again.',
        clientStatus
      );
    }

    logger.error(`create-deposit-order error: ${err.message}`);
    return error(res, 'Could not create the deposit order. Please try again.');
  }
};
