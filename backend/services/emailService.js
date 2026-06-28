const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter;

const createTransporter = () => {
  if (transporter) return transporter;

  // Brevo (smtp-relay.brevo.com) uses port 587 + STARTTLS. Generic logic:
  // port 465 → implicit TLS (secure:true); 587/2525 → STARTTLS (secure:false).
  const smtpPort = parseInt(process.env.SMTP_PORT, 10) || 587;
  const isSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    port: smtpPort,
    secure: isSecure,
    // Force STARTTLS upgrade when not using implicit TLS (correct for 587).
    requireTLS: !isSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // ── Connection pooling + rate limiting ──────────────────────────────────
    // Critical under load: pooling reuses a few SMTP connections and the rate
    // limiter smooths bursts (e.g. 20 signups at once) so the relay doesn't
    // reject/throttle us. Tuned conservatively for Brevo's transactional relay.
    pool: true,
    maxConnections: parseInt(process.env.SMTP_MAX_CONNECTIONS, 10) || 5,
    maxMessages: parseInt(process.env.SMTP_MAX_MESSAGES, 10) || 100,
    rateDelta: 1000,
    rateLimit: parseInt(process.env.SMTP_RATE_LIMIT, 10) || 10, // ≤10 msgs/sec
    tls: {
      rejectUnauthorized: false,
    },
  });
  return transporter;
};

// Sleep helper for the retry backoff.
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fault-tolerant email dispatch.
 *
 * Every onboarding email (KYC link, account-setup link, OTP, alerts) flows
 * through here, so the retry/backoff hardening protects the entire pipeline.
 * - Up to 3 attempts with a 1-second delay between tries.
 * - Each failure logs the EXACT error via both the file logger and console.error
 *   (so drops are visible live on the Hostinger dashboard).
 * - NEVER throws: returns a { success } result object so a mail outage can never
 *   crash or short-circuit the surrounding backend execution flow.
 */
const MAX_EMAIL_ATTEMPTS = 3;
const EMAIL_RETRY_DELAY_MS = 1000;

const sendEmail = async ({ to, subject, html, text }) => {
  // IMPORTANT (Brevo): the "From" must be a VERIFIED sender on your domain
  // (e.g. info@alisterbank.online), NOT the SMTP login (…@smtp-brevo.com).
  // Set EMAIL_FROM to a sender you've verified in the Brevo dashboard.
  const senderEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@alisterbank.online';
  const senderName = process.env.EMAIL_FROM_NAME || 'Alister Bank';
  const mailOptions = {
    from: `"${senderName}" <${senderEmail}>`,
    to,
    subject,
    html,
    text: text || subject,
  };

  let lastError;
  for (let attempt = 1; attempt <= MAX_EMAIL_ATTEMPTS; attempt += 1) {
    try {
      const transport = createTransporter();
      const info = await transport.sendMail(mailOptions);
      logger.info(`Email sent to ${to} (attempt ${attempt}/${MAX_EMAIL_ATTEMPTS}): ${info.messageId}`);
      return { success: true, messageId: info.messageId, attempts: attempt };
    } catch (err) {
      lastError = err;
      logger.error(`Email attempt ${attempt}/${MAX_EMAIL_ATTEMPTS} to ${to} failed: ${err.message}`);
      console.error(`[EMAIL] Attempt ${attempt}/${MAX_EMAIL_ATTEMPTS} to ${to} (subject: "${subject}") failed:`, err);
      if (attempt < MAX_EMAIL_ATTEMPTS) {
        await delay(EMAIL_RETRY_DELAY_MS);
      }
    }
  }

  // All attempts exhausted — log loudly but keep the backend flow alive.
  logger.error(`Email PERMANENTLY failed to ${to} after ${MAX_EMAIL_ATTEMPTS} attempts: ${lastError?.message}`);
  console.error(`[EMAIL] PERMANENT FAILURE to ${to} after ${MAX_EMAIL_ATTEMPTS} attempts:`, lastError);
  return { success: false, error: lastError?.message, attempts: MAX_EMAIL_ATTEMPTS };
};

// ─── Email Templates ──────────────────────────────────────────────────────────
//
// Gmail-compatible architecture: Gmail (web + app) STRIPS <style> blocks and
// most class selectors, so every visual rule below is INLINE and the layout is
// built with nested <table> elements (the only reliably-rendered box model in
// email clients). A single small <style> block is kept ONLY for the responsive
// @media fallback; if Gmail drops it the inline widths still render correctly.

const BRAND = {
  crimson: '#c8102e',
  crimsonDark: '#8b0000',
  ink: '#0d0d14',
  panel: '#111118',
  panelAlt: '#1a1a2e',
  border: '#1e1e2e',
  text: '#ffffff',
  muted: '#a0a0b0',
  faint: '#666666',
};

/**
 * Render a premium, Gmail-safe email. `content` is a string of <tr> rows that
 * slot into the central body table (each cell already inline-styled).
 */
const baseTemplate = (content) => `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <title>Alister Bank</title>
  <style>
    /* Responsive fallback only — all critical styling is inline below. */
    @media only screen and (max-width:620px){
      .alb-wrap{ width:100% !important; }
      .alb-pad{ padding-left:24px !important; padding-right:24px !important; }
      .alb-h1{ font-size:20px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#0a0a0f; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <!-- Preheader spacing + outer background -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0f;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="alb-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; font-family:'Segoe UI',Arial,Helvetica,sans-serif;">

          <!-- Header -->
          <tr>
            <td class="alb-pad" align="center" style="background:linear-gradient(135deg,${BRAND.crimson} 0%,${BRAND.crimsonDark} 100%); background-color:${BRAND.crimson}; padding:32px 40px; border-radius:16px 16px 0 0;">
              <h1 class="alb-h1" style="margin:0; color:#ffffff; font-size:22px; font-weight:700; letter-spacing:1px; font-family:'Segoe UI',Arial,Helvetica,sans-serif;">&#11041; ALISTER BANK</h1>
              <p style="margin:6px 0 0; color:rgba(255,255,255,0.78); font-size:13px;">Secure Banking &middot; Trusted Worldwide</p>
            </td>
          </tr>

          <!-- Body -->
          ${content}

          <!-- Footer -->
          <tr>
            <td class="alb-pad" align="center" style="background-color:${BRAND.ink}; padding:24px 40px; border-radius:0 0 16px 16px; border:1px solid ${BRAND.border}; border-top:none;">
              <p style="margin:0 0 6px; color:#555555; font-size:12px; line-height:1.6;">&copy; ${new Date().getFullYear()} Alister Bank. All rights reserved.</p>
              <p style="margin:0 0 6px; color:#555555; font-size:12px; line-height:1.6;">This is an automated message. Please do not reply to this email.</p>
              <p style="margin:0 0 12px; font-size:12px;">
                <a href="${process.env.FRONTEND_URL || '#'}/privacy" style="color:${BRAND.crimson}; text-decoration:none;">Privacy Policy</a>
                &nbsp;|&nbsp;
                <a href="${process.env.FRONTEND_URL || '#'}/terms" style="color:${BRAND.crimson}; text-decoration:none;">Terms of Service</a>
                &nbsp;|&nbsp;
                <a href="${process.env.FRONTEND_URL || '#'}/support" style="color:${BRAND.crimson}; text-decoration:none;">Contact Support</a>
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:#0a0a0f; border:1px solid ${BRAND.border}; border-radius:8px; padding:12px 16px;">
                    <p style="margin:0; color:#666666; font-size:11px; line-height:1.6;">&#128274; <strong style="color:#888;">Anti-Phishing Notice:</strong> Alister Bank will never ask for your password, PIN, or OTP via phone or email. If you did not request this email, please ignore it.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/**
 * Body shell — wraps inner HTML in the dark content panel cell. Returns the
 * <tr> the baseTemplate expects.
 */
const bodyShell = (innerHtml) => `
  <tr>
    <td class="alb-pad" style="background-color:${BRAND.panel}; padding:36px 40px; border-left:1px solid ${BRAND.border}; border-right:1px solid ${BRAND.border};">
      ${innerHtml}
    </td>
  </tr>`;

/** A pill badge. */
const badge = (label) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;"><tr><td style="background-color:rgba(200,16,46,0.15); color:${BRAND.crimson}; padding:5px 14px; border-radius:20px; font-size:12px; font-weight:600;">${label}</td></tr></table>`;

/** A crimson CTA button built bulletproof (table cell) so it renders in Gmail. */
const button = (label, href) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;"><tr>
    <td align="center" style="background:linear-gradient(135deg,${BRAND.crimson},${BRAND.crimsonDark}); background-color:${BRAND.crimson}; border-radius:8px;">
      <a href="${href}" target="_blank" style="display:inline-block; padding:14px 36px; color:#ffffff; text-decoration:none; font-weight:600; font-size:15px; font-family:'Segoe UI',Arial,Helvetica,sans-serif;">${label}</a>
    </td>
  </tr></table>`;

/** An info callout box. */
const infoBox = (innerHtml) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;"><tr>
    <td style="background-color:${BRAND.panelAlt}; border-left:3px solid ${BRAND.crimson}; border-radius:6px; padding:16px 20px;">
      <p style="margin:0; color:#c0c0d0; font-size:14px; line-height:1.6;">${innerHtml}</p>
    </td>
  </tr></table>`;

/** A label/value detail row for transaction-style tables. */
const detailRow = (label, value, valueColor) => `
  <tr>
    <td style="padding:10px 0; border-bottom:1px solid ${BRAND.border}; color:${BRAND.faint}; font-size:13px;">${label}</td>
    <td align="right" style="padding:10px 0; border-bottom:1px solid ${BRAND.border}; color:${valueColor || '#ffffff'}; font-size:13px; font-weight:600;">${value}</td>
  </tr>`;

const heading = (text) => `<h2 style="margin:0 0 16px; font-size:20px; color:#ffffff; font-weight:700; font-family:'Segoe UI',Arial,Helvetica,sans-serif;">${text}</h2>`;
const para = (html) => `<p style="margin:0 0 14px; color:${BRAND.muted}; font-size:15px; line-height:1.7;">${html}</p>`;
const hl = (text) => `<span style="color:${BRAND.crimson}; font-weight:600;">${text}</span>`;

// ─── Individual Email Senders ─────────────────────────────────────────────────

const sendOTPEmail = async (email, otp, purpose = 'verification') => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#128272; Verification Required')}
    ${heading('Your One-Time Password')}
    ${para(`You requested an OTP for <strong>${purpose}</strong>. Use the code below to proceed:`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr>
      <td align="center" style="background-color:#1a0a10; border:1px solid rgba(200,16,46,0.3); border-radius:12px; padding:24px;">
        <div style="font-size:40px; font-weight:800; letter-spacing:10px; color:${BRAND.crimson}; font-family:'Courier New',monospace;">${otp}</div>
        <p style="margin:10px 0 0; color:#666; font-size:12px;">&#9201; This OTP expires in <strong>5 minutes</strong></p>
      </td>
    </tr></table>
    ${infoBox('&#9888;&#65039; Never share this OTP with anyone — including Alister Bank staff. Our team will never ask for your OTP.')}
    <p style="margin:0; color:#555; font-size:13px;">If you didn't request this OTP, your account may be at risk. Please contact support immediately.</p>
  `));
  return sendEmail({ to: email, subject: `${otp} — Your Alister Bank OTP (expires in 5 min)`, html });
};

const sendKYCUnderReviewEmail = async (email, name, customerId) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#128203; Application Received')}
    ${heading('Documents Under Review')}
    ${para(`Dear ${hl(name)},`)}
    ${para('Thank you for applying to <strong>Alister Bank</strong>. We have received your application and documents. Our KYC team is currently reviewing them.')}
    ${infoBox(`<strong>Customer ID:</strong> ${customerId}<br/><span style="display:inline-block; margin-top:8px;">Please keep this ID safe for future reference.</span>`)}
    ${para('You will receive a notification shortly to complete your <strong>Video KYC</strong> verification. This is a mandatory step to activate your account.')}
    ${para(`Expected review time: ${hl('10–15 minutes')}`)}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — Your Application is Under Review', html });
};

const sendVideoKYCEmail = async (email, name, kycLink) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#127909; Video KYC Required')}
    ${heading('Complete Your Video KYC')}
    ${para(`Dear ${hl(name)},`)}
    ${para('Your documents have been reviewed. To proceed with account activation, please complete your <strong>Video KYC</strong> verification.')}
    ${button('Start Video KYC →', kycLink)}
    ${infoBox('&#9201; This link expires in <strong>24 hours</strong>. Do not share this link with anyone.')}
    ${para('<strong>What you\'ll need:</strong>')}
    ${para('• Good lighting and a clear background<br/>• Your original ID document ready<br/>• A stable internet connection')}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — Complete Your Video KYC Now', html });
};

const sendAccountApprovedEmail = async (email, name, setupLink, accountNumber) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#9989; Account Approved!')}
    ${heading('Welcome to Alister Bank! 🎉')}
    ${para(`Dear ${hl(name)},`)}
    ${para('Congratulations! Your bank account has been <strong>approved and activated</strong>. You\'re now part of the Alister Bank family.')}
    ${infoBox(`<strong>Account Number:</strong> ${accountNumber}<br/><span style="display:inline-block; margin-top:6px;"><strong>SWIFT Code:</strong> ${process.env.BANK_SWIFT || 'ALSTINBB'}</span><br/><span style="display:inline-block; margin-top:6px;"><strong>Bank:</strong> Alister Bank</span>`)}
    ${para('Click the secure button below to set up your <strong>username, password, and security PIN</strong>:')}
    ${button('Set Up My Account →', setupLink)}
    ${infoBox('&#9201; This setup link expires in <strong>24 hours</strong>. Please complete setup immediately.')}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — Your Account is Approved! Set Up Now', html });
};

const sendLoginAlertEmail = async (email, name, loginData) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#128276; Login Detected')}
    ${heading('New Login to Your Account')}
    ${para(`Dear ${hl(name)},`)}
    ${para('A new login was detected on your Alister Bank account.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('Date &amp; Time', loginData.time)}
      ${detailRow('IP Address', loginData.ip)}
      ${detailRow('Device', loginData.device)}
      ${detailRow('Location', loginData.location || 'Unknown')}
    </table>
    ${para('If this was you, no action is needed. If you don\'t recognize this login, please change your password immediately.')}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — New Login Detected', html });
};

const sendTransferAlertEmail = async (email, name, txData) => {
  const isDebit = txData.type === 'debit';
  // Prefer an explicit, human-written description (e.g. an admin's note on a
  // manual credit/debit). Fall back to the system reference when none is given.
  const hasDescription = txData.description != null && String(txData.description).trim() !== '';
  const noteRow = hasDescription
    ? detailRow('Description', String(txData.description).trim())
    : detailRow('Reference', txData.reference);
  const html = baseTemplate(bodyShell(`
    ${badge(isDebit ? '&#128184; Money Sent' : '&#128176; Money Received')}
    ${heading(`Transaction ${isDebit ? 'Debit' : 'Credit'} Alert`)}
    ${para(`Dear ${hl(name)},`)}
    ${para(`A transaction has been ${isDebit ? 'debited from' : 'credited to'} your account.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('Amount', `$${txData.amount}`, isDebit ? '#ef4444' : '#22c55e')}
      ${noteRow}
      ${detailRow(isDebit ? 'To Account' : 'From', txData.counterparty)}
      ${detailRow('Mode', txData.mode)}
      ${detailRow('Balance', `$${txData.balance}`)}
      ${detailRow('Date &amp; Time', txData.time)}
    </table>
  `));
  return sendEmail({ to: email, subject: `Alister Bank — ${isDebit ? 'Debit' : 'Credit'} Alert: $${txData.amount}`, html });
};

const sendPasswordResetEmail = async (email, name, resetLink) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#128273; Password Reset')}
    ${heading('Reset Your Password')}
    ${para(`Dear ${hl(name)},`)}
    ${para('We received a request to reset your Alister Bank password. Click the button below to proceed:')}
    ${button('Reset Password →', resetLink)}
    ${infoBox('&#9201; This link expires in <strong>5 minutes</strong>. If you did not request a password reset, please ignore this email.')}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — Password Reset Request', html });
};

/**
 * Service-request confirmation (debit card / cheque book). Sent when a request
 * passes the duplicate gate. `serviceLabel` is human-readable (e.g. "Debit Card").
 */
const sendServiceRequestEmail = async (email, name, { serviceLabel, requestId, createdAt }) => {
  const when = createdAt ? new Date(createdAt).toLocaleString('en-US') : new Date().toLocaleString('en-US');
  const html = baseTemplate(bodyShell(`
    ${badge('&#128221; Request Received')}
    ${heading(`Your ${serviceLabel} Request is Under Review`)}
    ${para(`Dear ${hl(name)},`)}
    ${para(`We've received your request for a <strong>${serviceLabel}</strong>. Our team is reviewing it and will update you as it progresses.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('Service', serviceLabel)}
      ${detailRow('Reference', requestId)}
      ${detailRow('Status', 'Pending Review', '#f59e0b')}
      ${detailRow('Requested On', when)}
    </table>
    ${infoBox('You\'ll receive another notification once your request has been processed. No action is needed from you right now.')}
  `));
  return sendEmail({ to: email, subject: `Alister Bank — ${serviceLabel} Request Received`, html });
};

/**
 * Card issued — sent on admin approval. Renders the tier, network, masked
 * number and expiry. The full PAN/CVV are NEVER emailed.
 */
const sendCardIssuedEmail = async (email, name, { tier, network, maskedNumber, expiry }) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#128179; Card Issued')}
    ${heading(`Your ${tier || ''} ${network || ''} Card is Active`)}
    ${para(`Dear ${hl(name)},`)}
    ${para(`Great news — your <strong>${tier || ''} ${network || ''}</strong> debit card has been issued and is now <strong style="color:#22c55e;">active</strong>. You can manage it from your Cards dashboard.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('Network', network || '—')}
      ${detailRow('Tier', tier || '—')}
      ${detailRow('Card Number', maskedNumber || 'XXXX XXXX XXXX XXXX')}
      ${detailRow('Valid Thru', expiry || '—')}
      ${detailRow('Status', 'Active', '#22c55e')}
    </table>
    ${infoBox('&#128274; For your security, your full card number and CVV are shown only inside the secure app — never in email. Manage freeze, ATM, domestic &amp; international controls anytime from your Cards dashboard.')}
  `));
  return sendEmail({ to: email, subject: `Alister Bank — Your ${tier || ''} Card is Active`, html });
};

/**
 * Card rejected — sent on admin decline. Includes the reason and, when the
 * issuance fee was refunded, confirms the credited amount.
 */
const sendCardRejectedEmail = async (email, name, { tier, reason, refundAmount }) => {
  const refunded = Number(refundAmount) > 0;
  const html = baseTemplate(bodyShell(`
    ${badge('&#10060; Application Declined')}
    ${heading('Debit Card Application Declined')}
    ${para(`Dear ${hl(name)},`)}
    ${para(`We're sorry — your <strong>${tier || ''}</strong> debit card application could not be approved at this time.`)}
    ${infoBox(`<strong>Reason:</strong> ${reason || 'Your application did not meet the current issuance criteria.'}`)}
    ${refunded
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
          ${detailRow('Issuance Fee Refunded', `$${Number(refundAmount).toLocaleString('en-US')}`, '#22c55e')}
          ${detailRow('Credited To', 'Your Alister Bank account')}
        </table>`
      : ''}
    ${para('You\'re welcome to re-apply once the noted criteria are met. Our support team is happy to help.')}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — Debit Card Application Update', html });
};

/**
 * Cheque-book rejected — specific legal reason mandated by ops:
 * "Signature not updated in system records. Please update your signature to re-apply."
 */
const sendCheckbookRejectedEmail = async (email, name) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#10060; Request Declined')}
    ${heading('Cheque Book Request Declined')}
    ${para(`Dear ${hl(name)},`)}
    ${para('We were unable to process your Cheque Book request.')}
    ${infoBox('<strong>Reason:</strong> Signature not updated in system records. Please update your signature to re-apply.')}
    ${para('Once your signature is updated in our records, you may submit a new Cheque Book request.')}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — Cheque Book Request Declined', html });
};

/**
 * Card-control modification alert — real-time fraud-prevention notice sent
 * whenever a card control state changes. `changes` is an array of summary lines.
 */
const sendCardControlAlertEmail = async (email, name, { tier, maskedNumber, changes, time }) => {
  const list = (changes || []).map((c) => `• ${c}`).join('<br/>');
  const html = baseTemplate(bodyShell(`
    ${badge('&#128272; Card Control Updated')}
    ${heading('Your Card Settings Changed')}
    ${para(`Dear ${hl(name)},`)}
    ${para(`A change was just made to your <strong>${tier || ''}</strong> card${maskedNumber ? ` (${maskedNumber})` : ''}:`)}
    ${infoBox(list || 'Card controls were updated.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('When', time || new Date().toLocaleString('en-US'))}
    </table>
    ${infoBox('&#9888;&#65039; If you did NOT make this change, freeze your card immediately and contact support — your account security may be at risk.')}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — Card Control Updated', html });
};

/**
 * Activation-deposit invitation — sent after Video KYC is approved. Tells the
 * user their account is approved and invites them to make the minimum-balance
 * "activation deposit" via the secure link.
 */
const sendActivationDepositEmail = async (email, name, { depositLink, minimumBalance, accountNumber }) => {
  const minLabel = `$${Number(minimumBalance || 0).toLocaleString('en-US')}`;
  const html = baseTemplate(bodyShell(`
    ${badge('&#9989; Account Approved')}
    ${heading('Activate Your Account — Minimum Balance Deposit')}
    ${para(`Dear ${hl(name)},`)}
    ${para('Great news — your identity verification is complete and your account has been <strong>approved</strong>. One final step remains: fund your account with the minimum opening balance to activate it.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('Account Number', accountNumber || '—')}
      ${detailRow('Minimum Activation Deposit', minLabel, '#22c55e')}
    </table>
    ${button('Make Activation Deposit →', depositLink)}
    ${para('Once your activation deposit is received, you\'ll get a confirmation and then a secure link to set up your username, password and security PIN.')}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — Account Approved: Deposit Minimum Balance to Activate', html });
};

/**
 * Deposit credit confirmation — sent after an activation deposit succeeds.
 * Shows the payment mode as "Credit Card" with the last 4 digits and
 * cardholder name.
 */
const sendSimulatedDepositCreditEmail = async (email, name, { amount, last4, cardHolder, balance, reference, time }) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#128176; Deposit Received')}
    ${heading('Activation Deposit Confirmed')}
    ${para(`Dear ${hl(name)},`)}
    ${para('Your activation deposit has been received and credited to your account.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('Amount Credited', `$${amount}`, '#22c55e')}
      ${detailRow('Payment Mode', 'Credit Card')}
      ${detailRow('Card', `Credit Card ending ${last4 || '••••'}`)}
      ${detailRow('Card Holder', cardHolder || '—')}
      ${detailRow('Reference', reference || '—')}
      ${detailRow('Account Balance', `$${balance}`)}
      ${detailRow('Date &amp; Time', time)}
    </table>
    ${para('Your account setup link will arrive in your inbox shortly so you can complete your login credentials.')}
  `));
  return sendEmail({ to: email, subject: `Alister Bank — Activation Deposit Confirmed: $${amount}`, html });
};

/**
 * KYC rejection notice — sent when an admin flags a user's identity profile or
 * documents as 'rejected'. Explains the verification could not be approved and
 * guides them to re-upload clear, legible documents. Gmail-safe inline styles.
 */
const sendKYCRejectedEmail = async (email, name, reason) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#10060; Verification Not Approved')}
    ${heading('KYC Verification Could Not Be Approved')}
    ${para(`Dear ${hl(name)},`)}
    ${para('Thank you for submitting your KYC details to <strong>Alister Bank</strong>. After review, we were unable to approve your identity verification at this time.')}
    ${infoBox(`<strong>Reason:</strong> ${reason || 'The submitted documents could not be verified.'}`)}
    ${para('To proceed, please re-upload <strong>clear, legible, and valid</strong> verification documents, ensuring:')}
    ${para('• All four corners of each document are visible<br/>• Text and photos are sharp and in focus (no glare or blur)<br/>• Details match the information on your application<br/>• Files are recent and not expired')}
    ${para('Once you re-submit, our compliance team will review your application again promptly.')}
    ${infoBox('&#128274; Need help? Contact Alister Bank support and we\'ll guide you through re-submission.')}
  `));
  return sendEmail({ to: email, subject: 'Alister Bank — Action Needed: KYC Verification Not Approved', html });
};

/**
 * NEFT transfer INITIATED — sent the moment a NEFT payout is requested. Tells
 * the user the transfer is being processed and how long NEFT typically takes,
 * and that a completion email will follow.
 */
const sendNeftInitiatedEmail = async (email, name, { amount, reference, beneficiary, accountNumber, ifsc, eta, balance, time }) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#128338; NEFT Initiated')}
    ${heading('Your NEFT Transfer Has Been Initiated')}
    ${para(`Dear ${hl(name)},`)}
    ${para(`We've received your NEFT transfer request and it is now being processed. NEFT is settled in batches, so it usually completes <strong>${eta || 'within a couple of hours'}</strong>. Your account has been debited and the amount is on its way.`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('Amount', `$${amount}`, '#f59e0b')}
      ${detailRow('Beneficiary', beneficiary || '—')}
      ${detailRow('Account Number', accountNumber || '—')}
      ${detailRow('IFSC', ifsc || '—')}
      ${detailRow('Reference', reference || '—')}
      ${detailRow('Status', 'Processing', '#f59e0b')}
      ${detailRow('Expected to complete', eta || '—')}
      ${detailRow('Date &amp; Time', time)}
    </table>
    ${infoBox('&#9201; No action is needed from you. We\'ll send you another email as soon as your NEFT transfer is completed.')}
  `));
  return sendEmail({ to: email, subject: `Alister Bank — NEFT Transfer Initiated: $${amount}`, html });
};

/**
 * NEFT transfer COMPLETED — sent when an admin approves the NEFT payout.
 */
const sendNeftCompletedEmail = async (email, name, { amount, reference, beneficiary, accountNumber, ifsc, balance, time }) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#9989; NEFT Completed')}
    ${heading('Your NEFT Transfer Is Complete')}
    ${para(`Dear ${hl(name)},`)}
    ${para('Good news — your NEFT transfer has been processed and credited to the beneficiary successfully.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('Amount', `$${amount}`, '#22c55e')}
      ${detailRow('Beneficiary', beneficiary || '—')}
      ${detailRow('Account Number', accountNumber || '—')}
      ${detailRow('IFSC', ifsc || '—')}
      ${detailRow('Reference', reference || '—')}
      ${detailRow('Status', 'Completed', '#22c55e')}
      ${balance != null ? detailRow('Account Balance', `$${balance}`) : ''}
      ${detailRow('Date &amp; Time', time)}
    </table>
    ${para('Thank you for banking with Alister Bank.')}
  `));
  return sendEmail({ to: email, subject: `Alister Bank — NEFT Transfer Completed: $${amount}`, html });
};

/**
 * NEFT transfer FAILED + REFUNDED — sent when an admin rejects the NEFT payout.
 * Communicates the failure reason (e.g. bank server down / beneficiary bank not
 * responding) and confirms the full amount was refunded.
 */
const sendNeftFailedEmail = async (email, name, { amount, reference, beneficiary, reason, refundAmount, balance, time }) => {
  const html = baseTemplate(bodyShell(`
    ${badge('&#10060; NEFT Failed')}
    ${heading('Your NEFT Transfer Could Not Be Completed')}
    ${para(`Dear ${hl(name)},`)}
    ${para('We\'re sorry — your NEFT transfer could not be completed and has been reversed.')}
    ${infoBox(`<strong>Reason:</strong> ${reason || 'The beneficiary bank did not respond.'}`)}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.panelAlt}; border-radius:10px; padding:4px 20px; margin:20px 0;">
      ${detailRow('Amount', `$${amount}`, '#ef4444')}
      ${detailRow('Beneficiary', beneficiary || '—')}
      ${detailRow('Reference', reference || '—')}
      ${detailRow('Refunded to your account', `$${refundAmount}`, '#22c55e')}
      ${balance != null ? detailRow('Account Balance', `$${balance}`) : ''}
      ${detailRow('Date &amp; Time', time)}
    </table>
    ${para('The full amount has been refunded to your Alister Bank account. You\'re welcome to try the transfer again later, or contact support if the issue continues.')}
  `));
  return sendEmail({ to: email, subject: `Alister Bank — NEFT Transfer Failed (Refunded): $${amount}`, html });
};

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendKYCUnderReviewEmail,
  sendVideoKYCEmail,
  sendAccountApprovedEmail,
  sendActivationDepositEmail,
  sendSimulatedDepositCreditEmail,
  sendLoginAlertEmail,
  sendTransferAlertEmail,
  sendPasswordResetEmail,
  sendServiceRequestEmail,
  sendCardIssuedEmail,
  sendCardRejectedEmail,
  sendCheckbookRejectedEmail,
  sendCardControlAlertEmail,
  sendKYCRejectedEmail,
  sendNeftInitiatedEmail,
  sendNeftCompletedEmail,
  sendNeftFailedEmail,
};