import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RiCheckLine } from 'react-icons/ri';
import BackToHome from '../../components/common/BackToHome';

const STEPS = [
  { id: 1, label: 'User ID' },
  { id: 2, label: 'Account Details' },
  { id: 3, label: 'Verification' },
];

const PAGE_BG = { background: 'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 50%, #2D0000 100%)' };

// Shared button class strings (Alister Bank design system).
const PRIMARY_BTN =
  'w-full inline-flex items-center justify-center gap-1 h-[52px] rounded-[12px] text-white font-semibold text-[15px] ' +
  'cursor-pointer transition-colors duration-200 disabled:opacity-75 disabled:cursor-not-allowed ' +
  'bg-[linear-gradient(135deg,#CC0000,#FF3333)] hover:bg-[linear-gradient(135deg,#990000,#CC0000)]';

const GHOST_BTN =
  'inline-flex items-center justify-center gap-1.5 h-[52px] px-6 rounded-[12px] text-[15px] font-medium ' +
  'cursor-pointer transition-colors duration-200 bg-transparent border border-white/[0.15] text-white/70 ' +
  'hover:border-white/[0.35] hover:text-white';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1
  const [userId, setUserId] = useState('');

  // Step 2
  const [accountNumber, setAccountNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');

  // Success
  const [maskedEmail, setMaskedEmail] = useState('');

  // ── Step 1: verify the NetBanking User ID ─────────────────────────────────
  const verifyUserId = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-userid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'User ID not found. Please check and try again.');
      setCurrentStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 2: verify account number + date of birth ─────────────────────────
  const verifyAccountDetails = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-account-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, accountNumber, dateOfBirth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Details do not match our records. Please try again.');
      setMaskedEmail(data.maskedEmail || '');
      setCurrentStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 3: send the password reset link ──────────────────────────────────
  const sendResetLink = async () => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/send-reset-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, accountNumber, dateOfBirth }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send reset link. Please try again.');
      setCurrentStep('success');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Numeric position used to drive the step indicator (success = all complete).
  const stepNum = currentStep === 'success' ? 4 : currentStep;
  const showHeaderAndSteps = currentStep !== 'success';

  return (
    <div style={PAGE_BG} className="min-h-screen flex items-center justify-center px-4 py-10 relative">
      {/* Scoped styles: dark inputs with red focus + button spinner */}
      <style>{`
        .fp-input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 10px;
          color: #FFFFFF;
          padding: 13px 16px;
          font-size: 15px;
          font-family: Inter, sans-serif;
          transition: all 0.2s ease;
        }
        .fp-input::placeholder { color: rgba(255,255,255,0.3); }
        .fp-input:focus {
          border-color: #CC0000;
          box-shadow: 0 0 0 3px rgba(204,0,0,0.12);
          outline: none;
        }
        .fp-input[type="date"] { color-scheme: dark; }
        @keyframes fp-spin { to { transform: rotate(360deg); } }
        .fp-spin {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #FFFFFF;
          border-radius: 50%;
          animation: fp-spin 0.7s linear infinite;
          display: inline-block;
          margin-right: 8px;
        }
        @media (max-width: 380px) { .fp-step-label { display: none; } }
      `}</style>

      {/* Back to Home (fixed top-left) */}
      <BackToHome />

      {/* Decorative blurred red orb */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed rounded-full"
        style={{ top: -100, right: -100, width: 500, height: 500, background: 'rgba(204,0,0,0.10)', filter: 'blur(100px)', zIndex: 0 }}
      />

      <div className="relative z-[1] w-full flex flex-col items-center">
        {/* Page header */}
        {showHeaderAndSteps && (
          <div className="text-center mb-7">
            <span
              className="inline-block rounded-full text-xs font-medium mb-3 px-3.5 py-1"
              style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)', color: '#CC0000' }}
            >
              🔒 Secure Identity Verification
            </span>
            <h1 className="text-[28px] font-bold text-white leading-tight">
              Reset Your{' '}
              <span style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Password
              </span>
            </h1>
            <p className="text-[14px] mt-2 max-w-sm mx-auto" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Complete all 3 verification steps to receive your secure password reset link.
            </p>
          </div>
        )}

        {/* Step indicator */}
        {showHeaderAndSteps && (
          <div className="w-full max-w-[400px] mx-auto mb-8 px-2">
            <div className="flex items-center">
              {STEPS.map((s, i) => {
                const isCompleted = stepNum > s.id;
                const isActive = stepNum === s.id;
                const circleStyle = isCompleted
                  ? { background: 'linear-gradient(135deg, #CC0000, #FF3333)', color: '#fff', border: '2px solid transparent', boxShadow: '0 0 12px rgba(204,0,0,0.4)' }
                  : isActive
                  ? { background: 'transparent', border: '2px solid #CC0000', color: '#CC0000', boxShadow: '0 0 0 4px rgba(204,0,0,0.12)' }
                  : { background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' };
                return (
                  <React.Fragment key={s.id}>
                    <div className="flex flex-col items-center shrink-0">
                      <div
                        className="flex items-center justify-center text-[13px] font-semibold transition-all duration-300"
                        style={{ width: 38, height: 38, borderRadius: '50%', ...circleStyle }}
                      >
                        {isCompleted ? <RiCheckLine /> : <span>{s.id}</span>}
                      </div>
                      <p
                        className="fp-step-label text-[11px] mt-1.5 whitespace-nowrap"
                        style={{ color: isActive ? '#CC0000' : 'rgba(255,255,255,0.35)', fontWeight: isActive ? 600 : 400 }}
                      >
                        {s.label}
                      </p>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 h-0.5 mx-2 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-[400ms]"
                          style={{ width: stepNum > s.id ? '100%' : '0%', background: '#CC0000' }}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Card */}
        <div className="w-full max-w-[460px] mx-auto">
          <div
            className="rounded-[20px] p-6 sm:p-10 sm:backdrop-blur-[20px]"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderTop: '2px solid rgba(204,0,0,0.5)', boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(204,0,0,0.05)' }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                {/* ── STEP 1 ─────────────────────────────────────────────── */}
                {currentStep === 1 && (
                  <div>
                    <h2 className="text-[18px] font-bold text-white mb-1">Step 1 of 3 — Enter Your User ID</h2>
                    <p className="text-[14px] mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Enter the User ID you use to log in to NetBanking.
                    </p>

                    {error && <ErrorBanner message={error} />}

                    <div className="mb-[18px]">
                      <label className="block text-[13px] font-medium mb-[7px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        User ID <span style={{ color: '#CC0000' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="fp-input"
                        placeholder="Enter your User ID"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                      />
                    </div>

                    <motion.button
                      type="button"
                      onClick={verifyUserId}
                      disabled={isLoading}
                      whileHover={{ y: -2, boxShadow: '0 8px 25px rgba(204,0,0,0.35)' }}
                      whileTap={{ scale: 0.97 }}
                      className={PRIMARY_BTN}
                    >
                      {isLoading ? <><span className="fp-spin" /> Verifying User ID...</> : 'Verify User ID →'}
                    </motion.button>
                  </div>
                )}

                {/* ── STEP 2 ─────────────────────────────────────────────── */}
                {currentStep === 2 && (
                  <div>
                    <h2 className="text-[18px] font-bold text-white mb-1">Step 2 of 3 — Verify Account Details</h2>
                    <p className="text-[14px] mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Enter your registered account number and date of birth to confirm your identity.
                    </p>

                    {error && <ErrorBanner message={error} />}

                    <div className="mb-[18px]">
                      <label className="block text-[13px] font-medium mb-[7px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        Account Number <span style={{ color: '#CC0000' }}>*</span>
                      </label>
                      <input
                        type="text"
                        className="fp-input"
                        placeholder="Enter your Account Number"
                        value={accountNumber}
                        onChange={(e) => setAccountNumber(e.target.value)}
                      />
                    </div>

                    <div className="mb-[18px]">
                      <label className="block text-[13px] font-medium mb-[7px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                        Date of Birth <span style={{ color: '#CC0000' }}>*</span>
                      </label>
                      <input
                        type="date"
                        className="fp-input"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                      />
                    </div>

                    <p className="text-[12px] mb-6 flex items-start gap-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      <span>🔒</span>
                      <span>Your details are verified against our encrypted records. Never shared.</span>
                    </p>

                    <div className="flex flex-col-reverse sm:flex-row gap-3">
                      <motion.button
                        type="button"
                        onClick={() => { setCurrentStep(1); setError(''); }}
                        whileTap={{ scale: 0.97 }}
                        className={`${GHOST_BTN} w-full sm:w-auto`}
                      >
                        ← Back
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={verifyAccountDetails}
                        disabled={isLoading}
                        whileHover={{ y: -2, boxShadow: '0 8px 25px rgba(204,0,0,0.35)' }}
                        whileTap={{ scale: 0.97 }}
                        className={`${PRIMARY_BTN} flex-1`}
                      >
                        {isLoading ? <><span className="fp-spin" /> Verifying Details...</> : 'Verify Details →'}
                      </motion.button>
                    </div>
                  </div>
                )}

                {/* ── STEP 3 ─────────────────────────────────────────────── */}
                {currentStep === 3 && (
                  <div>
                    <h2 className="text-[18px] font-bold text-white mb-1">Step 3 of 3 — Send Reset Link</h2>
                    <p className="text-[14px] mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Your identity has been verified successfully. Click below to send the password reset link to your registered email address.
                    </p>

                    {error && <ErrorBanner message={error} />}

                    {/* Verified badge */}
                    <div
                      className="rounded-[10px] px-4 py-3 mb-5 text-[14px] flex items-center gap-2"
                      style={{ background: 'rgba(0,200,100,0.08)', border: '1px solid rgba(0,200,100,0.3)', color: 'rgba(100,255,180,0.9)' }}
                    >
                      ✅ Identity Verified Successfully
                    </div>

                    {/* Email display box */}
                    <div
                      className="rounded-[10px] px-4 py-3.5 mb-6"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <p className="text-[12px] mb-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                        📧 Reset link will be sent to:
                      </p>
                      <p className="text-[15px] font-bold text-white">{maskedEmail || 'your registered email'}</p>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row gap-3">
                      <motion.button
                        type="button"
                        onClick={() => { setCurrentStep(2); setError(''); }}
                        whileTap={{ scale: 0.97 }}
                        className={`${GHOST_BTN} w-full sm:w-auto`}
                      >
                        ← Back
                      </motion.button>
                      <motion.button
                        type="button"
                        onClick={sendResetLink}
                        disabled={isLoading}
                        whileHover={{ y: -2, boxShadow: '0 8px 25px rgba(204,0,0,0.35)' }}
                        whileTap={{ scale: 0.97 }}
                        className={`${PRIMARY_BTN} flex-1`}
                      >
                        {isLoading ? <><span className="fp-spin" /> Sending Reset Link...</> : 'Send Reset Link →'}
                      </motion.button>
                    </div>
                  </div>
                )}

                {/* ── SUCCESS ────────────────────────────────────────────── */}
                {currentStep === 'success' && (
                  <div className="text-center">
                    <motion.div
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                      className="mx-auto flex items-center justify-center"
                      style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 30px rgba(204,0,0,0.35)' }}
                    >
                      <RiCheckLine className="text-white text-[32px]" />
                    </motion.div>

                    <h2 className="text-[22px] font-bold text-white mt-5">Reset Link Sent!</h2>
                    <p className="text-[14px] mt-2 leading-[1.7]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      We've sent a password reset link to{' '}
                      <span className="text-white font-bold">{maskedEmail || 'your registered email'}</span>.
                      The link expires in 30 minutes. Check your spam folder if you don't see it.
                    </p>

                    <div className="my-5 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }} />

                    <div
                      className="rounded-[10px] px-4 py-3.5 my-5 text-[13px] text-left flex items-start gap-2"
                      style={{ background: 'rgba(204,0,0,0.07)', border: '1px solid rgba(204,0,0,0.2)', color: 'rgba(255,255,255,0.5)' }}
                    >
                      <span>🔒</span>
                      <span>Never share this reset link with anyone, including Alister Bank staff. Alister Bank will never ask for your password.</span>
                    </div>

                    <motion.button
                      type="button"
                      onClick={() => navigate('/login')}
                      whileTap={{ scale: 0.97 }}
                      className={`${GHOST_BTN} w-full`}
                    >
                      ← Back to Login
                    </motion.button>

                    <p className="text-[13px] mt-3" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      Didn't receive it?{' '}
                      <span
                        onClick={() => setCurrentStep(3)}
                        className="cursor-pointer font-medium hover:underline"
                        style={{ color: '#CC0000' }}
                      >
                        Resend Link
                      </span>
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

// Red-tinted inline error banner (animated in).
function ErrorBanner({ message }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-[10px] px-4 py-3 mb-5 text-[14px] flex items-center gap-2.5"
      style={{ background: 'rgba(204,0,0,0.10)', border: '1px solid rgba(204,0,0,0.35)', color: '#FF6666' }}
    >
      <span>⚠</span>
      <span>{message}</span>
    </motion.div>
  );
}
