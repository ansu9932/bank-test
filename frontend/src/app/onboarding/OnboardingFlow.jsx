/**
 * First-run onboarding: Welcome → Customer ID + DOB → email OTP →
 * one-time password confirm → MPIN setup → done (straight into the app).
 *
 * Single stateful flow (no sub-routes) so step tokens never live in the URL.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, KeyRound, PartyPopper, Eye, EyeOff } from 'lucide-react';
import { secureFieldProps } from '../../services/biometric';
import {
  verifyCustomer, verifyOtp, resendOtp, verifyPassword, setupMpin,
} from '../services/appAuth';
import {
  Screen, AppHeader, Card, PrimaryButton, Field, TextInput,
  OTPBoxes, PinDots, NumberPad, BrandMark, useSubmit,
} from '../components/AppUI';

const STEPS = ['welcome', 'identify', 'otp', 'password', 'mpin', 'confirm-mpin', 'done'];

export default function OnboardingFlow() {
  const navigate = useNavigate();
  const [step, setStep] = useState('welcome');
  const [stepToken, setStepToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');

  // form state
  const [customerId, setCustomerId] = useState('');
  const [dob, setDob] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [mpin, setMpin] = useState('');
  const [mpinConfirm, setMpinConfirm] = useState('');
  const [pinError, setPinError] = useState(false);

  const { run, loading, error, setError } = useSubmit(async (action) => action());

  const stepIndex = STEPS.indexOf(step);

  // ── Step handlers ───────────────────────────────────────────────────────────
  const submitIdentify = () =>
    run(async () => {
      const data = await verifyCustomer(customerId.trim().toUpperCase(), dob);
      setStepToken(data.onboardingToken);
      setMaskedEmail(data.maskedEmail);
      setOtp('');
      setStep('otp');
    }).catch(() => {});

  const submitOtp = (code) =>
    run(async () => {
      const data = await verifyOtp(code, stepToken);
      setStepToken(data.onboardingToken);
      setStep('password');
    }).catch(() => setOtp(''));

  // Auto-submit when all 6 digits are in.
  useEffect(() => {
    if (step === 'otp' && otp.length === 6 && !loading) submitOtp(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step]);

  const submitPassword = () =>
    run(async () => {
      const data = await verifyPassword(password, stepToken);
      setStepToken(data.onboardingToken);
      setPassword('');
      setStep('mpin');
    }).catch(() => {});

  const handleMpinDigit = (d) => {
    setError('');
    setPinError(false);
    if (step === 'mpin' && mpin.length < 4) {
      const next = mpin + d;
      setMpin(next);
      if (next.length === 4) setTimeout(() => setStep('confirm-mpin'), 250);
    } else if (step === 'confirm-mpin' && mpinConfirm.length < 4) {
      const next = mpinConfirm + d;
      setMpinConfirm(next);
      if (next.length === 4) {
        if (next !== mpin) {
          setPinError(true);
          setError('MPINs do not match. Try again.');
          setTimeout(() => {
            setMpin('');
            setMpinConfirm('');
            setPinError(false);
            setStep('mpin');
          }, 700);
        } else {
          run(async () => {
            await setupMpin(next, stepToken);
            setStep('done');
          }).catch(() => {
            setMpin('');
            setMpinConfirm('');
            setStep('mpin');
          });
        }
      }
    }
  };

  const handleMpinDelete = () => {
    if (step === 'mpin') setMpin((p) => p.slice(0, -1));
    else setMpinConfirm((p) => p.slice(0, -1));
  };

  // ── Screens ─────────────────────────────────────────────────────────────────
  if (step === 'welcome') {
    return (
      <Screen className="justify-between px-6 pb-10 safe-top">
        <div className="flex flex-col items-center gap-4 pt-24 text-center">
          <BrandMark size={72} />
          <h1 className="text-2xl font-bold text-balance" style={{ color: 'var(--app-text)' }}>Alister Bank</h1>
          <p className="text-sm leading-relaxed max-w-[280px]" style={{ color: 'var(--app-text-dim)' }}>
            Banking that fits in your pocket. Secure, fast, and always with you.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 justify-center">
            <ShieldCheck size={16} style={{ color: 'var(--app-success)' }} />
            <span className="text-xs" style={{ color: 'var(--app-text-dim)' }}>
              Protected with device binding and MPIN
            </span>
          </div>
          <PrimaryButton onClick={() => setStep('identify')}>Get Started</PrimaryButton>
        </div>
      </Screen>
    );
  }

  if (step === 'identify') {
    return (
      <Screen>
        <AppHeader title="Verify your account" onBack={() => setStep('welcome')} />
        <div className="flex flex-col gap-5 px-5 pt-4">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--app-text-dim)' }}>
            Enter your Customer ID and date of birth to begin.
          </p>
          <Field label="Customer ID" hint="Starts with ALB — find it in your welcome email">
            <TextInput
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value.toUpperCase())}
              placeholder="ALB26199227"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={18}
            />
          </Field>
          <Field label="Date of birth">
            <TextInput
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          {error && <p className="text-sm" style={{ color: 'var(--app-danger)' }}>{error}</p>}
          <PrimaryButton
            onClick={submitIdentify}
            loading={loading}
            disabled={!customerId.trim() || !dob}
          >
            Continue
          </PrimaryButton>
        </div>
      </Screen>
    );
  }

  if (step === 'confirm') {
    return (
      <Screen>
        <AppHeader title="Confirm your account" onBack={() => setStep('identify')} />
        <div className="flex flex-col gap-5 px-5 pt-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full" style={{ background: 'var(--app-surface)' }}>
              <UserCheck size={24} style={{ color: 'var(--app-success)' }} />
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--app-text-dim)' }}>
              We found your account. Please confirm this is you.
            </p>
          </div>

          <Card className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-dim)' }}>Account holder</span>
              <span className="text-base font-semibold" style={{ color: 'var(--app-text)' }}>
                {accountPreview?.name || '—'}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--app-text-dim)' }}>Account number</span>
              <span className="text-base font-semibold tabular-nums" style={{ color: 'var(--app-text)' }}>
                {accountPreview?.last6 ? `•••• ${accountPreview.last6}` : '—'}
              </span>
            </div>
          </Card>

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--app-primary)]"
            />
            <span className="text-sm leading-relaxed" style={{ color: 'var(--app-text-dim)' }}>
              {'I confirm this is my account and I accept the '}
              <a href="https://alisterbank.online/terms-of-service" target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--app-primary)' }}>Terms of Service</a>
              {' and '}
              <a href="https://alisterbank.online/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold underline" style={{ color: 'var(--app-primary)' }}>Privacy Policy</a>
              {' of Alister Bank.'}
            </span>
          </label>

          {error && <p className="text-sm" style={{ color: 'var(--app-danger)' }}>{error}</p>}
          <PrimaryButton onClick={submitConfirm} loading={loading} disabled={!termsAccepted}>
            Accept &amp; Continue
          </PrimaryButton>
        </div>
      </Screen>
    );
  }

  if (step === 'otp') {
    return (
      <Screen>
        <AppHeader title="Email verification" onBack={() => { setOtp(''); setStep('identify'); }} />
        <div className="flex flex-col gap-6 px-5 pt-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full" style={{ background: 'var(--app-surface)' }}>
              <Mail size={24} style={{ color: 'var(--app-primary)' }} />
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--app-text-dim)' }}>
              We sent a 6-digit code to <span style={{ color: 'var(--app-text)' }}>{maskedEmail}</span>
            </p>
          </div>
          <OTPBoxes value={otp} onChange={setOtp} />
          {error && <p className="text-sm text-center" style={{ color: 'var(--app-danger)' }}>{error}</p>}
          {loading && <p className="text-sm text-center" style={{ color: 'var(--app-text-dim)' }}>Verifying…</p>}
          <ResendTimer onResend={() => resendOtp(stepToken).catch(() => {})} />
        </div>
      </Screen>
    );
  }

  if (step === 'password') {
    return (
      <Screen>
        <AppHeader title="Confirm it's you" onBack={() => setStep('identify')} />
        <div className="flex flex-col gap-5 px-5 pt-4">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full" style={{ background: 'var(--app-surface)' }}>
              <KeyRound size={24} style={{ color: 'var(--app-primary)' }} />
            </div>
            <p className="text-sm leading-relaxed max-w-[300px]" style={{ color: 'var(--app-text-dim)' }}>
              Enter your NetBanking password once to finish linking this device. You will use an MPIN from now on.
            </p>
          </div>
          <Field label="NetBanking password">
            <div className="relative">
              <TextInput
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                {...secureFieldProps()}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                {showPw
                  ? <EyeOff size={18} style={{ color: 'var(--app-text-dim)' }} />
                  : <Eye size={18} style={{ color: 'var(--app-text-dim)' }} />}
              </button>
            </div>
          </Field>
          {error && <p className="text-sm" style={{ color: 'var(--app-danger)' }}>{error}</p>}
          <PrimaryButton onClick={submitPassword} loading={loading} disabled={!password}>
            Continue
          </PrimaryButton>
        </div>
      </Screen>
    );
  }

  if (step === 'mpin' || step === 'confirm-mpin') {
    const isConfirm = step === 'confirm-mpin';
    const filled = isConfirm ? mpinConfirm.length : mpin.length;
    return (
      <Screen className="justify-between pb-8">
        <AppHeader
          title={isConfirm ? 'Confirm your MPIN' : 'Create your MPIN'}
          onBack={() => {
            setMpin('');
            setMpinConfirm('');
            setStep(isConfirm ? 'mpin' : 'password');
          }}
        />
        <div className="flex flex-col items-center gap-6 px-5">
          <div className="flex items-center justify-center w-14 h-14 rounded-full" style={{ background: 'var(--app-surface)' }}>
            <Lock size={24} style={{ color: 'var(--app-primary)' }} />
          </div>
          <p className="text-sm text-center leading-relaxed max-w-[280px]" style={{ color: 'var(--app-text-dim)' }}>
            {isConfirm
              ? 'Re-enter the same 4-digit MPIN.'
              : 'This 4-digit MPIN will unlock the app for the next 30 days.'}
          </p>
          <PinDots length={4} filled={filled} error={pinError} />
          {error && <p className="text-sm" style={{ color: 'var(--app-danger)' }}>{error}</p>}
          {loading && <p className="text-sm" style={{ color: 'var(--app-text-dim)' }}>Setting up…</p>}
        </div>
        <NumberPad onDigit={handleMpinDigit} onDelete={handleMpinDelete} />
      </Screen>
    );
  }

  // done
  return (
    <Screen className="items-center justify-center gap-6 px-6 text-center">
      <div className="flex items-center justify-center w-20 h-20 rounded-full" style={{ background: 'var(--app-surface)' }}>
        <PartyPopper size={36} style={{ color: 'var(--app-success)' }} />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-bold" style={{ color: 'var(--app-text)' }}>You&apos;re all set!</h1>
        <p className="text-sm leading-relaxed max-w-[280px]" style={{ color: 'var(--app-text-dim)' }}>
          This device is now linked to your account. Use your MPIN to sign in for the next 30 days.
        </p>
      </div>
      <div className="w-full max-w-[300px]">
        <PrimaryButton onClick={() => navigate('/app/home', { replace: true })}>
          Go to my account
        </PrimaryButton>
      </div>
    </Screen>
  );
}

// ─── Resend link with a 30s cooldown ─────────────────────────────────────────
function ResendTimer({ onResend }) {
  const [seconds, setSeconds] = useState(30);
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);
  return (
    <div className="text-center">
      {seconds > 0 ? (
        <p className="text-xs" style={{ color: 'var(--app-text-dim)' }}>
          Resend code in {seconds}s
        </p>
      ) : (
        <button
          type="button"
          className="text-sm font-semibold"
          style={{ color: 'var(--app-primary)' }}
          onClick={() => { onResend(); setSeconds(30); }}
        >
          Resend code
        </button>
      )}
    </div>
  );
}
