const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const {
  User, Account, Transaction, CardRequest, SupportTicket, ChatOTP,
} = require('../models');
const { success, badRequest, unauthorized } = require('../utils/apiResponse');
const { generateOTP, hashValue, maskAccountNumber } = require('../utils/helpers');
const { sendOTPEmail } = require('../services/emailService');
const logger = require('../utils/logger');

// ─── Constants ────────────────────────────────────────────────────────────────
const OTP_TTL_MS = 5 * 60 * 1000;          // OTP valid for 5 minutes
const CHAT_TOKEN_TTL = '15m';               // chat token hard-expires in 15 min
const MAX_OTP_ATTEMPTS = 5;                 // permanent lock after 5 wrong guesses

// Identical reply whether or not the email exists → anti-enumeration.
const OTP_SENT_REPLY = 'If that email is registered with Alister Bank, a 6-digit verification code has been sent to it. The code is valid for 5 minutes. Please enter it here.';

// ─── Chat token helpers ───────────────────────────────────────────────────────

/** Issue a short-lived, read-only, type-scoped chat token. */
const issueChatToken = (userId) => jwt.sign(
  { userId, type: 'chat', scope: 'read' },
  process.env.JWT_SECRET,
  { expiresIn: CHAT_TOKEN_TTL },
);

/**
 * Verify a chat token from the X-Chat-Token header. Returns the user or null.
 * STRICTLY requires type === 'chat' so user/admin JWTs can never be replayed
 * here, and chat tokens carry no sessionId so they are rejected by every other
 * protected endpoint in the app.
 */
const resolveChatUser = async (req) => {
  const token = req.headers['x-chat-token'];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'chat') return null;
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password_hash', 'security_pin'] },
    });
    return user || null;
  } catch {
    return null;
  }
};

// ─── Intent engine ────────────────────────────────────────────────────────────

/** Each intent: name, personal (needs verification), and keyword matchers. */
const INTENTS = [
  { name: 'greeting', personal: false, match: /\b(hi|hii+|hello|hey|hola|namaste|good\s*(morning|afternoon|evening)|greetings)\b/i },
  { name: 'thanks', personal: false, match: /\b(thanks?|thank\s*you|thx|appreciated?|great|awesome|nice|cool|ok(ay)?|got\s*it)\b/i },
  { name: 'balance', personal: true, match: /\b(balance|how\s*much\s*(money|funds)|available\s*(funds|amount)|account\s*balance)\b/i },
  { name: 'transactions', personal: true, match: /\b(transactions?|statement|recent\s*(activity|payments?)|last\s*\d*\s*(transactions?|payments?)|mini\s*statement|history)\b/i },
  { name: 'cards', personal: true, match: /\b(my\s*cards?|card\s*(status|list|details)|debit\s*card|credit\s*card|freeze|frozen|block(ed)?\s*card)\b/i },
  { name: 'new_card', personal: true, match: /\b(new\s*card|request\s*(a\s*)?card|apply\s*(for\s*)?(a\s*)?card|order\s*(a\s*)?card|replace\s*card)\b/i },
  { name: 'cheque_book', personal: true, match: /\b(cheque|check\s*book|chequebook|checkbook)\b/i },
  { name: 'limits', personal: true, match: /\b(transfer\s*limits?|daily\s*limit|spending\s*limit|how\s*much\s*can\s*i\s*(send|transfer))\b/i },
  { name: 'account_status', personal: true, match: /\b(account\s*status|is\s*my\s*account\s*(active|frozen|ok)|account\s*(active|frozen|blocked))\b/i },
  { name: 'kyc_status', personal: true, match: /\b(kyc|verification\s*status|video\s*kyc|identity\s*verification)\b/i },
  { name: 'tickets', personal: true, match: /\b(tickets?|complaints?|my\s*(support\s*)?(requests?|issues?))\b/i },
  { name: 'loans', personal: false, match: /\b(loans?|emi|borrow|mortgage|personal\s*loan|home\s*loan|car\s*loan|interest\s*rate)\b/i },
  { name: 'transfer_help', personal: false, match: /\b(how\s*(do|to|can)\s*i?\s*(send|transfer|wire)|neft|imps|rtgs|swift|upi|send\s*money|make\s*a\s*(payment|transfer))\b/i },
  { name: 'branch', personal: false, match: /\b(branch(es)?|ifsc|swift\s*code|address|location|where\s*(are|is))\b/i },
  { name: 'hours', personal: false, match: /\b(hours|timing|open|close[ds]?|working\s*(hours|days)|when\s*(are|is))\b/i },
  { name: 'support', personal: false, match: /\b(support|help|contact|customer\s*(care|service)|talk\s*to\s*(someone|human|agent)|phone\s*number|email\s*address)\b/i },
  { name: 'open_account', personal: false, match: /\b(open\s*(an?\s*)?account|new\s*account|sign\s*up|register|create\s*account)\b/i },
  { name: 'end_session', personal: false, match: /\b(end\s*session|log\s*me\s*out|logout|sign\s*out|forget\s*me|stop)\b/i },
];

const classifyIntent = (message) => {
  const text = String(message || '').slice(0, 500);
  for (const intent of INTENTS) {
    if (intent.match.test(text)) return intent;
  }
  return { name: 'unknown', personal: false };
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmtAmount = (amount, currency = 'USD') => {
  const n = Number(amount || 0);
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const maskCard = (num) => (num ? `•••• •••• •••• ${String(num).slice(-4)}` : '•••• ••••');

// ─── Personal-data answer builders (read-only) ────────────────────────────────

const answerBalance = async (user) => {
  const account = await Account.findOne({ where: { user_id: user.id } });
  if (!account) return { reply: 'I could not find an account linked to your profile. Please contact support.' };
  return {
    reply: `Here is your account summary, ${user.first_name}:\n\n`
      + `Account ${maskAccountNumber(account.account_number)} (${account.account_type})\n`
      + `• Balance: ${fmtAmount(account.balance, account.currency)}\n`
      + `• Available: ${fmtAmount(account.available_balance, account.currency)}\n`
      + `• Status: ${account.status}`,
    actions: [{ label: 'Open Dashboard', href: '/dashboard' }],
  };
};

const answerTransactions = async (user) => {
  const account = await Account.findOne({ where: { user_id: user.id } });
  if (!account) return { reply: 'I could not find an account linked to your profile.' };
  const txs = await Transaction.findAll({
    where: { account_id: account.id },
    order: [['created_at', 'DESC']],
    limit: 5,
  });
  if (txs.length === 0) return { reply: 'You have no transactions yet.', actions: [{ label: 'View Transactions', href: '/dashboard/transactions' }] };
  const lines = txs.map((t) => {
    const dir = t.transaction_type === 'credit' ? '+' : '-';
    return `• ${fmtDate(t.created_at)} — ${dir}${fmtAmount(t.amount, account.currency)} (${t.status})${t.description ? ` — ${String(t.description).slice(0, 60)}` : ''}`;
  });
  return {
    reply: `Your last ${txs.length} transactions:\n\n${lines.join('\n')}`,
    actions: [{ label: 'View All Transactions', href: '/dashboard/transactions' }],
  };
};

const answerCards = async (user) => {
  const cards = await CardRequest.findAll({
    where: { user_id: user.id, request_type: 'debit_card', status: { [Op.in]: ['active', 'dispatched', 'delivered'] } },
    order: [['created_at', 'DESC']],
  });
  if (cards.length === 0) {
    return {
      reply: 'You have no active cards yet. You can request one from the Cards page.',
      actions: [{ label: 'Request a Card', href: '/dashboard/cards' }],
    };
  }
  const lines = cards.map((c) => {
    const frozen = c.controls && (c.controls.frozen === true || c.controls.freeze === true);
    return `• ${maskCard(c.card_number)} — ${c.card_tier || 'Debit'} ${c.card_network || ''} (${frozen ? 'FROZEN' : 'active'})`;
  });
  return {
    reply: `Your cards:\n\n${lines.join('\n')}`,
    actions: [{ label: 'Manage Cards', href: '/dashboard/cards' }],
  };
};

const answerNewCard = async (user) => {
  const pending = await CardRequest.findAll({
    where: { user_id: user.id, request_type: 'debit_card', status: { [Op.in]: ['pending', 'processing'] } },
    order: [['created_at', 'DESC']],
  });
  if (pending.length > 0) {
    return {
      reply: `You already have ${pending.length} card request${pending.length > 1 ? 's' : ''} in progress (status: ${pending[0].status}). You can track or manage it on the Cards page.`,
      actions: [{ label: 'Go to Cards', href: '/dashboard/cards' }],
    };
  }
  return {
    reply: 'You have no pending card requests. You can request a new debit card from the Cards page — it only takes a minute.',
    actions: [{ label: 'Request New Card', href: '/dashboard/cards' }],
  };
};

const answerChequeBook = async (user) => {
  const reqs = await CardRequest.findAll({
    where: { user_id: user.id, request_type: 'cheque_book' },
    order: [['created_at', 'DESC']],
    limit: 3,
  });
  if (reqs.length === 0) {
    return {
      reply: 'You have no cheque book requests on file. You can request one from your dashboard.',
      actions: [{ label: 'Open Dashboard', href: '/dashboard' }],
    };
  }
  const lines = reqs.map((r) => {
    let line = `• Requested ${fmtDate(r.created_at)} — status: ${r.status}`;
    if (r.tracking_number) line += `, tracking: ${r.tracking_number}`;
    if (r.expected_delivery) line += `, expected delivery: ${fmtDate(r.expected_delivery)}`;
    return line;
  });
  return { reply: `Your cheque book requests:\n\n${lines.join('\n')}` };
};

const answerLimits = async (user) => {
  const account = await Account.findOne({ where: { user_id: user.id } });
  if (!account) return { reply: 'I could not find an account linked to your profile.' };
  const used = Number(account.daily_transferred || 0);
  const limit = Number(account.daily_transfer_limit || 0);
  return {
    reply: 'Your transfer limits:\n\n'
      + `• Daily transfer limit: ${fmtAmount(limit, account.currency)}\n`
      + `• Used today: ${fmtAmount(used, account.currency)}\n`
      + `• Remaining today: ${fmtAmount(Math.max(limit - used, 0), account.currency)}`,
    actions: [{ label: 'Make a Transfer', href: '/dashboard/transfer' }],
  };
};

const answerAccountStatus = async (user) => {
  const account = await Account.findOne({ where: { user_id: user.id } });
  return {
    reply: `Your account status:\n\n`
      + `• Profile: ${user.account_status}\n`
      + `• Account: ${account ? account.status : 'not found'}\n`
      + `• KYC: ${user.kyc_status}`,
  };
};

const answerKycStatus = async (user) => {
  const labels = {
    pending: 'Pending — your KYC has not been completed yet.',
    under_review: 'Under review — our team is verifying your documents.',
    video_kyc_pending: 'Video KYC pending — please complete your video KYC from the link emailed to you.',
    approved: 'Approved — your identity is fully verified.',
    rejected: 'Rejected — please contact support to re-submit your KYC.',
  };
  return { reply: `KYC status: ${labels[user.kyc_status] || user.kyc_status}` };
};

const answerTickets = async (user) => {
  const tickets = await SupportTicket.findAll({
    where: { user_id: user.id },
    order: [['created_at', 'DESC']],
    limit: 5,
  });
  if (tickets.length === 0) {
    return {
      reply: 'You have no support tickets. You can raise one from the Support page.',
      actions: [{ label: 'Open Support', href: '/dashboard/support' }],
    };
  }
  const lines = tickets.map((t) => `• ${t.ticket_number} — ${String(t.subject).slice(0, 60)} (${t.status || 'open'})`);
  return {
    reply: `Your recent support tickets:\n\n${lines.join('\n')}`,
    actions: [{ label: 'Open Support', href: '/dashboard/support' }],
  };
};

const PERSONAL_ANSWERS = {
  balance: answerBalance,
  transactions: answerTransactions,
  cards: answerCards,
  new_card: answerNewCard,
  cheque_book: answerChequeBook,
  limits: answerLimits,
  account_status: answerAccountStatus,
  kyc_status: answerKycStatus,
  tickets: answerTickets,
};

// ─── Public (non-personal) answers ────────────────────────────────────────────

const PUBLIC_ANSWERS = {
  greeting: () => ({
    reply: "Hello! I'm AVA, your Alister Bank virtual assistant. I can help with balances, transactions, cards, cheque books, transfer limits, KYC status and more. What would you like to know?",
    suggestions: ['Check my balance', 'Last 5 transactions', 'My cards', 'Working hours'],
  }),
  thanks: () => ({
    reply: "You're welcome! Is there anything else I can help you with?",
    suggestions: ['Check my balance', 'Transfer limits', 'Contact support'],
  }),
  loans: () => ({
    reply: 'Alister Bank offers personal, home and vehicle loans with competitive interest rates. You can explore all loan products and eligibility details on our Loans page.',
    actions: [{ label: 'Explore Loans', href: '/loans' }],
  }),
  transfer_help: () => ({
    reply: 'You can send money via Internal transfer, NEFT, IMPS or SWIFT (international) from your dashboard:\n\n1. Log in and go to Transfer\n2. Choose or add a beneficiary\n3. Pick the transfer method and amount\n4. Confirm — you will get an email receipt.',
    actions: [{ label: 'Go to Transfer', href: '/dashboard/transfer' }],
  }),
  branch: () => ({
    reply: 'Alister Bank Main Branch\n\nFor your personal IFSC/SWIFT code, check the Account Details section of your dashboard — every account shows its own codes there.',
    actions: [{ label: 'Open Dashboard', href: '/dashboard' }],
  }),
  hours: () => ({
    reply: 'Online banking and I (AVA) are available 24/7. Customer support is available Monday to Saturday, 9:00 AM – 6:00 PM.',
  }),
  support: () => ({
    reply: 'You can reach our support team by raising a ticket from the Support page in your dashboard, or via the Contact page. For account-specific queries you can also ask me right here after a quick email verification.',
    actions: [{ label: 'Contact Page', href: '/contact' }, { label: 'Support (Dashboard)', href: '/dashboard/support' }],
  }),
  open_account: () => ({
    reply: 'Opening an account with Alister Bank is fully digital: fill in your details, complete video KYC and set up your credentials — all online.',
    actions: [{ label: 'Open an Account', href: '/open-account' }],
  }),
  end_session: () => ({ reply: 'Your secure session has been ended and this conversation will be cleared.', endSession: true }),
  unknown: () => ({
    reply: "I'm not sure I understood that. I can help with: account balance, recent transactions, cards, cheque books, transfer limits, KYC status, loans, branch details and support.",
    suggestions: ['Check my balance', 'My cards', 'How do I transfer money?', 'Contact support'],
  }),
};

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/chat/message
 * Body: { message }
 * Optional header: X-Chat-Token (verified session)
 */
const handleMessage = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return badRequest(res, 'Message is required.');
    }

    const intent = classifyIntent(message);

    // Personal intents require a valid chat token.
    if (intent.personal) {
      const user = await resolveChatUser(req);
      if (!user) {
        return success(res, {
          requiresAuth: true,
          intent: intent.name,
          reply: 'For your security, I need to verify your identity first. Please enter your registered email address and I will send you a one-time code.',
        });
      }
      const builder = PERSONAL_ANSWERS[intent.name];
      const answer = await builder(user);
      return success(res, { intent: intent.name, verified: true, ...answer });
    }

    const builder = PUBLIC_ANSWERS[intent.name] || PUBLIC_ANSWERS.unknown;
    return success(res, { intent: intent.name, ...builder() });
  } catch (err) {
    logger.error(`Chat message error: ${err.message}`);
    return success(res, { intent: 'error', reply: 'Sorry, something went wrong on my side. Please try again.' });
  }
};

/**
 * POST /api/chat/otp/send
 * Body: { email }
 * ALWAYS returns the same message (anti-enumeration).
 */
const sendChatOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
    if (!valid) return badRequest(res, 'Please enter a valid email address.');

    const user = await User.findOne({ where: { email: cleanEmail } });

    // Only actually send when the email exists — but the response is IDENTICAL
    // either way so registered emails cannot be discovered.
    if (user) {
      // Invalidate all previous outstanding chat OTPs for this email.
      await ChatOTP.update(
        { used: true },
        { where: { email: cleanEmail, used: false } },
      );

      const otp = generateOTP();
      await ChatOTP.create({
        email: cleanEmail,
        otp_hash: hashValue(otp),
        expires_at: new Date(Date.now() + OTP_TTL_MS),
        ip_address: req.ip,
      });

      // Fire-and-forget: sendEmail never throws, and awaiting would make the
      // response time leak whether the email exists.
      sendOTPEmail(cleanEmail, otp, 'AVA chat verification').catch(() => {});
    } else {
      logger.info(`Chat OTP requested for unknown email (masked): ${cleanEmail.slice(0, 2)}***`);
    }

    return success(res, { reply: OTP_SENT_REPLY });
  } catch (err) {
    logger.error(`Chat OTP send error: ${err.message}`);
    // Same shape on failure too — never leak state.
    return success(res, { reply: OTP_SENT_REPLY });
  }
};

/**
 * POST /api/chat/otp/verify
 * Body: { email, otp }
 * On success returns a 15-minute read-only chat token.
 */
const verifyChatOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanOtp = String(otp || '').trim();

    if (!/^\d{6}$/.test(cleanOtp)) {
      return badRequest(res, 'Please enter the 6-digit code from your email.');
    }

    const record = await ChatOTP.findOne({
      where: { email: cleanEmail, used: false },
      order: [['created_at', 'DESC']],
    });

    const genericFail = 'That code is incorrect or has expired. Please check and try again, or ask me to resend a new code.';

    if (!record) return unauthorized(res, genericFail);
    if (record.locked) return unauthorized(res, 'This code has been locked after too many wrong attempts. Please request a new code.');
    if (new Date() > new Date(record.expires_at)) {
      await record.update({ used: true });
      return unauthorized(res, genericFail);
    }

    if (record.otp_hash !== hashValue(cleanOtp)) {
      const attempts = record.attempts + 1;
      const locked = attempts >= MAX_OTP_ATTEMPTS;
      await record.update({ attempts, locked });
      if (locked) {
        return unauthorized(res, 'Too many wrong attempts — this code is now permanently locked. Please request a new code.');
      }
      return unauthorized(res, `${genericFail} (${MAX_OTP_ATTEMPTS - attempts} attempts remaining)`);
    }

    // Success — burn the OTP and issue the scoped chat token.
    await record.update({ used: true });

    const user = await User.findOne({ where: { email: cleanEmail } });
    if (!user) return unauthorized(res, genericFail);

    const chatToken = issueChatToken(user.id);
    return success(res, {
      chatToken,
      expiresInSeconds: 15 * 60,
      firstName: user.first_name,
      reply: `You're verified, ${user.first_name}! I can now securely answer questions about your account. This secure session auto-ends after 15 minutes (or 3 minutes of inactivity).`,
    });
  } catch (err) {
    logger.error(`Chat OTP verify error: ${err.message}`);
    return unauthorized(res, 'Verification failed. Please try again.');
  }
};

module.exports = { handleMessage, sendChatOtp, verifyChatOtp };
