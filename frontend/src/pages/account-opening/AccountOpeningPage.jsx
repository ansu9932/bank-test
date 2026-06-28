import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RiBankLine, RiCheckLine, RiArrowLeftLine, RiArrowRightLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import useEntryPageGuard from '../../hooks/useEntryPageGuard';
import BackToHome from '../../components/common/BackToHome';
import { getDocsForCountry, getCountryByCode, ALL_DOC_ID_KEYS } from '../../config/kycRequirements';

// Step components
import StepPersonal from './steps/StepPersonal';
import StepAddress from './steps/StepAddress';
import StepDocuments from './steps/StepDocuments';
import StepOTPVerify from './steps/StepOTPVerify';
import StepReview from './steps/StepReview';

const STEPS = [
  { id: 1, label: 'Personal Info', icon: '👤' },
  { id: 2, label: 'Address',       icon: '📍' },
  { id: 3, label: 'Documents',     icon: '📄' },
  { id: 4, label: 'Verification',  icon: '🔐' },
  { id: 5, label: 'Review',        icon: '✅' },
];

// ── Field validation patterns (shared with the step components) ───────────────
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE   = /^[6-9]\d{9}$/;          // Indian mobile: 10 digits, starts 6-9
const GEN_PHONE_RE = /^\d{7,15}$/;          // Generic intl mobile (non-India)
const PINCODE_RE = /^\d{6}$/;               // Indian PIN: 6 digits

/**
 * Validate a single step's required fields. Returns a map of
 * { fieldKey: 'message' }. An empty map means the step is valid and the user
 * may advance. File-upload errors are keyed as `file_<docKey>`.
 *
 * The Documents step (3) is fully country-driven: only the selected country's
 * documents are validated, using the config in kycRequirements.js.
 */
export function getStepErrors(step, form, otpVerified) {
  const e = {};
  const isIndia = (form.countryCode || 'IN') === 'IN';

  if (step === 1) {
    if (!form.countryCode) e.countryCode = 'Please choose your country.';
    if (!form.firstName?.trim()) e.firstName = 'First name is required.';
    if (!form.lastName?.trim()) e.lastName = 'Last name is required.';
    if (!form.email?.trim()) e.email = 'Email address is required.';
    else if (!EMAIL_RE.test(form.email.trim())) e.email = 'Enter a valid email address.';
    if (!form.phone?.trim()) e.phone = 'Mobile number is required.';
    else if (isIndia && !PHONE_RE.test(form.phone.trim())) e.phone = 'Enter a valid 10-digit mobile number.';
    else if (!isIndia && !GEN_PHONE_RE.test(form.phone.trim())) e.phone = 'Enter a valid mobile number.';
    if (!form.dateOfBirth) e.dateOfBirth = 'Date of birth is required.';
    if (!form.gender) e.gender = 'Please select your gender.';
    if (!form.accountType) e.accountType = 'Please select an account type.';
  } else if (step === 2) {
    if (!form.addressLine1?.trim()) e.addressLine1 = 'Address line 1 is required.';
    if (!form.city?.trim()) e.city = 'City is required.';
    if (!form.state?.trim()) e.state = isIndia ? 'Please select a state.' : 'State / province is required.';
    if (!form.pincode?.trim()) e.pincode = isIndia ? 'PIN code is required.' : 'Postal code is required.';
    else if (isIndia && !PINCODE_RE.test(form.pincode.trim())) e.pincode = 'Enter a valid 6-digit PIN code.';
  } else if (step === 3) {
    // Country-driven document validation — only the selected country's docs.
    const docs = getDocsForCountry(form.countryCode);
    docs.forEach((d) => {
      // ID-number field validation (when the doc has one).
      if (d.idKey) {
        const val = (form[d.idKey] || '').trim();
        if (d.required && !val) {
          e[d.idKey] = `${d.label} number is required.`;
        } else if (val && d.pattern && !new RegExp(d.pattern).test(val)) {
          e[d.idKey] = d.patternMsg || `Enter a valid ${d.label} number.`;
        }
      }
      // File upload validation.
      if (d.required && !form.files?.[d.key]) {
        e[`file_${d.key}`] = `${d.label} upload is required.`;
      }
    });
  } else if (step === 4) {
    if (!otpVerified) e.otp = 'Please verify your email with the OTP before continuing.';
  }

  return e;
}

const initForm = {
  // Country (drives KYC document requirements)
  countryCode: 'IN', country: 'India',
  // Personal
  firstName: '', lastName: '', email: '', phone: '',
  dateOfBirth: '', gender: '', fatherName: '', motherName: '',
  maritalStatus: '', nationality: 'Indian', occupation: '', annualIncome: '',
  accountType: 'savings',
  // Address
  addressLine1: '', addressLine2: '', city: '', state: '', pincode: '',
  // Document ID numbers (per-country; only the relevant ones are shown)
  aadhaarNumber: '', panNumber: '', passportNumber: '',
  citizenshipNumber: '', cidNumber: '', nationalIdNumber: '', tinNumber: '',
  // Files
  files: {},
};

// Decorative, non-interactive red glow orbs sitting behind all page content.
function GlowOrbs() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed rounded-full"
        style={{ width: 500, height: 500, top: -100, right: -100, background: 'rgba(204,0,0,0.10)', filter: 'blur(100px)', zIndex: 0 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed rounded-full"
        style={{ width: 400, height: 400, bottom: -80, left: -80, background: 'rgba(204,0,0,0.07)', filter: 'blur(120px)', zIndex: 0 }}
      />
    </>
  );
}

const PAGE_BG = { background: 'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 50%, #2D0000 100%)' };

// Reusable button class strings (Alister Bank design system).
const PRIMARY_BTN =
  'min-w-[140px] w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-[14px] rounded-[12px] ' +
  'text-white font-semibold text-[15px] cursor-pointer transition-colors duration-200 ' +
  'disabled:opacity-40 disabled:cursor-not-allowed ' +
  'bg-[linear-gradient(135deg,#CC0000,#FF3333)] hover:bg-[linear-gradient(135deg,#990000,#CC0000)]';

const SECONDARY_BTN =
  'w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-[13px] rounded-[12px] ' +
  'text-[15px] font-medium cursor-pointer transition-colors duration-200 bg-transparent ' +
  'border border-white/[0.15] text-white/70 hover:border-white/[0.35] hover:text-white ' +
  'disabled:opacity-30 disabled:cursor-not-allowed';

export default function AccountOpeningPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(initForm);
  const [loading, setLoading] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [customerId, setCustomerId] = useState('');
  // Inline per-step validation errors. Populated only after a blocked "Next"
  // (or submit) so the form doesn't shout at the user before they've typed.
  const [errors, setErrors] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  // Set true once the PAN auto-fetch returns a verified legal name, which locks
  // the First/Last name fields from manual editing (Step 3 → reflected in Step 1).
  const [nameLocked, setNameLocked] = useState(false);

  // Navigation guard: if the user abandons onboarding (link, nav, back button,
  // refresh/close), wipe ALL in-memory registration vars + any temp signup
  // storage and redirect to the homepage on a non-whitelisted exit.
  const { allowNavigation, runCleanup } = useEntryPageGuard({
    resetState: () => {
      setForm(initForm);
      setStep(1);
      setOtpVerified(false);
      setNameLocked(false);
      setErrors({});
      setShowErrors(false);
      setCustomerId('');
    },
  });

  const updateForm = (updates) => setForm(prev => ({ ...prev, ...updates }));

  // Changing the country resets all document-dependent state (uploaded files,
  // ID numbers, PAN name-lock) so one country's docs never carry into another.
  const changeCountry = (code) => {
    const c = getCountryByCode(code);
    setForm(prev => {
      const cleared = ALL_DOC_ID_KEYS.reduce((acc, k) => ({ ...acc, [k]: '' }), {});
      return {
        ...prev,
        ...cleared,
        countryCode: code,
        country: c.name,
        nationality: code === 'IN' ? 'Indian' : prev.nationality,
        files: {},
      };
    });
    setNameLocked(false);
  };

  // Live validation for the current step; drives the disabled Next button.
  const currentErrors = getStepErrors(step, form, otpVerified);
  const currentStepValid = Object.keys(currentErrors).length === 0;

  const next = () => {
    const stepErrors = getStepErrors(step, form, otpVerified);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      setShowErrors(true);
      toast.error('Please complete the required fields before continuing.');
      return;
    }
    setErrors({});
    setShowErrors(false);
    setStep(s => Math.min(s + 1, 5));
  };

  const prev = () => {
    setErrors({});
    setShowErrors(false);
    setStep(s => Math.max(s - 1, 1));
  };

  const handleSubmit = async () => {
    // Final guard: re-validate every step so a user who somehow reached Review
    // with a gap (or edited back) can't submit an incomplete payload → 500.
    const allErrors = [1, 2, 3, 4].reduce(
      (acc, s) => ({ ...acc, ...getStepErrors(s, form, otpVerified) }), {});
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors);
      setShowErrors(true);
      const firstBadStep = [1, 2, 3, 4].find(
        s => Object.keys(getStepErrors(s, form, otpVerified)).length > 0);
      toast.error('Some required details are missing. Returning to fix them.');
      if (firstBadStep) setStep(firstBadStep);
      return;
    }
    if (!otpVerified) { toast.error('Please verify your email first.'); return; }

    setLoading(true);
    try {
      const fd = new FormData();
      // Append all form fields
      Object.entries(form).forEach(([k, v]) => {
        if (k !== 'files' && v) fd.append(k, v);
      });
      // Append files
      Object.entries(form.files).forEach(([k, v]) => { if (v) fd.append(k, v); });

      const { data } = await api.post('/account/open', fd, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        // Document uploads can be several MB. The global 30s axios timeout is
        // fine for JSON calls but too short for a multi-MB multipart upload on
        // a slow/remote network — it aborted client-side (ECONNABORTED) and
        // surfaced as a generic "Submission failed". Give the upload a generous
        // 3-minute window so it completes reliably on weaker connections.
        timeout: 180000,
      });
      setCustomerId(data.data.customerId);
      setSubmitted(true);
      // Onboarding succeeded — sanction any onward navigation from the success
      // screen so the exit guard does not redirect the user to the homepage.
      allowNavigation();
    } catch (err) {
      // Distinguish a real server rejection (has a response body) from a
      // network/timeout failure (no response) so the user gets actionable
      // guidance instead of a vague message.
      let msg = err.response?.data?.message;
      if (!msg) {
        if (err.code === 'ECONNABORTED') {
          msg = 'The upload timed out — your network looks slow. Please retry on a more stable connection.';
        } else if (!err.response) {
          msg = 'Network error while submitting. Please check your internet connection and try again.';
        } else {
          msg = 'Submission failed. Please try again.';
        }
      }
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 relative" style={PAGE_BG}>
        <BackToHome />
        <GlowOrbs />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="relative z-[1] w-full max-w-md rounded-[20px] border border-white/[0.07] sm:backdrop-blur-[20px] text-center px-8 sm:px-10 py-14"
          style={{ background: 'rgba(255,255,255,0.03)', borderTop: '2px solid rgba(204,0,0,0.5)', boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(204,0,0,0.06)' }}
        >
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.15 }}
            className="w-[72px] h-[72px] rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 30px rgba(204,0,0,0.4)' }}
          >
            <RiCheckLine className="text-white text-[32px]" />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-2">Application Submitted!</h2>
          <p className="text-[15px] mb-5 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Your application is under review. Check your email for updates.
          </p>
          <div className="rounded-xl p-4 mb-6" style={{ background: 'rgba(204,0,0,0.08)', border: '1px solid rgba(204,0,0,0.25)' }}>
            <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Your Customer ID</p>
            <p className="text-2xl font-bold tracking-widest" style={{ color: '#FF3333' }}>{customerId}</p>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Save this for future reference</p>
          </div>
          <div className="text-left rounded-xl p-4 mb-6 space-y-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            {[
              { icon: '📧', text: 'KYC review email sent to your inbox' },
              { icon: '🎥', text: 'Video KYC link will arrive shortly' },
              { icon: '💳', text: 'Then: deposit the minimum balance to activate' },
              { icon: '✅', text: 'Account setup link follows your activation deposit' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <span>{item.icon}</span><span>{item.text}</span>
              </div>
            ))}
          </div>
          <Link to="/login" className={`${PRIMARY_BTN} w-full`}>Go to Login</Link>
        </motion.div>
      </div>
    );
  }

  // Filled width of the progress track, derived from the existing step state.
  const progressPct = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen py-8 px-4 relative" style={PAGE_BG}>
      <BackToHome />
      <GlowOrbs />

      <div className="relative z-[1]">
        {/* Top bar — brand + back link */}
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 18px rgba(204,0,0,0.4)' }}
              >
                <RiBankLine className="text-white text-lg" />
              </div>
              <p className="font-700 text-white tracking-wide">ALISTER BANK</p>
            </div>
            <Link to="/login" className="text-white/50 hover:text-white text-sm transition-colors flex items-center gap-1.5">
              <RiArrowLeftLine /> Back to Login
            </Link>
          </div>
        </div>

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="text-center pt-8 sm:pt-12 mb-8"
        >
          <span
            className="inline-block rounded-full text-xs font-medium mb-3 px-3.5 py-1"
            style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)', color: '#CC0000' }}
          >
            🏦 Invitation-Only Program
          </span>
          <h1 className="text-[22px] sm:text-[32px] font-bold text-white leading-tight">
            Open Your{' '}
            <span style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Account
            </span>
          </h1>
          <p className="text-[15px] mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Complete in 5 simple steps — takes about 5 minutes
          </p>
        </motion.div>

        {/* Step indicators */}
        <div className="max-w-[600px] mx-auto mb-4 px-2">
          <div className="flex items-start justify-between">
            {STEPS.map((s) => {
              const isCompleted = step > s.id;
              const isActive = step === s.id;
              const circleStyle = isCompleted
                ? { background: 'linear-gradient(135deg, #CC0000, #FF3333)', color: '#fff', border: '2px solid transparent', boxShadow: '0 0 12px rgba(204,0,0,0.5)' }
                : isActive
                ? { background: 'transparent', border: '2px solid #CC0000', color: '#CC0000', boxShadow: '0 0 0 4px rgba(204,0,0,0.15)' }
                : { background: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' };
              return (
                <div key={s.id} className="flex flex-col items-center">
                  <div
                    className="w-[30px] h-[30px] sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-[11px] sm:text-[13px] font-semibold transition-all duration-300"
                    style={circleStyle}
                  >
                    {isCompleted ? <RiCheckLine /> : <span>{s.id}</span>}
                  </div>
                  <p
                    className="text-[11px] mt-1.5 hidden sm:block transition-colors"
                    style={{ color: isActive ? '#CC0000' : 'rgba(255,255,255,0.4)' }}
                  >
                    {s.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-[600px] mx-auto mb-8 px-2">
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #CC0000, #FF3333)' }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Step content */}
        <div className="max-w-[680px] mx-auto">
          <div
            className="rounded-[20px] p-6 sm:p-10 sm:backdrop-blur-[20px]"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderTop: '2px solid rgba(204,0,0,0.5)', boxShadow: '0 20px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(204,0,0,0.06)' }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3 }}
              >
                {step === 1 && (
                  <StepPersonal
                    form={form} update={updateForm}
                    errors={showErrors ? errors : {}}
                    nameLocked={nameLocked}
                    onCountryChange={changeCountry}
                  />
                )}
                {step === 2 && (
                  <StepAddress
                    form={form} update={updateForm}
                    errors={showErrors ? errors : {}}
                  />
                )}
                {step === 3 && (
                  <StepDocuments
                    form={form} update={updateForm}
                    errors={showErrors ? errors : {}}
                    nameLocked={nameLocked}
                    setNameLocked={setNameLocked}
                  />
                )}
                {step === 4 && (
                  <StepOTPVerify
                    email={form.email}
                    verified={otpVerified}
                    onVerified={() => setOtpVerified(true)}
                    onEmailChange={(newEmail) => {
                      // Inline email correction from Step 4 — update the form and
                      // invalidate any prior verification so the new address must
                      // be OTP-verified before the user can submit.
                      updateForm({ email: newEmail });
                      setOtpVerified(false);
                    }}
                  />
                )}
                {step === 5 && <StepReview form={form} />}
              </motion.div>
            </AnimatePresence>

            {/* Navigation */}
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-8 pt-6 border-t border-white/[0.07]">
              <motion.button
                onClick={prev} disabled={step === 1}
                whileTap={{ scale: 0.98 }}
                className={SECONDARY_BTN}
              >
                <RiArrowLeftLine /> Previous
              </motion.button>

              {step < 5 ? (
                <motion.button
                  onClick={next}
                  disabled={!currentStepValid}
                  title={currentStepValid ? '' : 'Complete the required fields to continue'}
                  whileHover={{ y: -2, boxShadow: '0 8px 25px rgba(204,0,0,0.35)' }}
                  whileTap={{ scale: 0.97 }}
                  className={PRIMARY_BTN}
                >
                  Next <RiArrowRightLine />
                </motion.button>
              ) : (
                <motion.button
                  onClick={handleSubmit} disabled={loading || !otpVerified}
                  whileHover={{ y: -2, boxShadow: '0 8px 25px rgba(204,0,0,0.35)' }}
                  whileTap={{ scale: 0.97 }}
                  className={PRIMARY_BTN}
                >
                  {loading ? <><div className="spinner w-4 h-4" /> Submitting...</> : '🚀 Submit Application'}
                </motion.button>
              )}
            </div>
          </div>

          {/* Bottom security trust bar (cosmetic) */}
          <div className="mt-6 flex justify-center gap-3 flex-wrap">
            {[
              ['🔒', '256-bit Encrypted'],
              ['🏛️', 'FDIC Regulated'],
              ['🛡️', 'OCC Supervised'],
            ].map(([icon, label]) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}
              >
                <span>{icon}</span> {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
