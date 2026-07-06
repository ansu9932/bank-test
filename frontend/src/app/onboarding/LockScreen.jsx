/**
 * MPIN lock screen — shown whenever a registered device opens the app.
 *
 * Biometric unlock: after the first successful MPIN entry with biometrics
 * enabled, the MPIN is kept in Keystore-backed secure storage; a fingerprint
 * match replays it. Wrong-MPIN lockout is enforced server-side (5 tries).
 *
 * "Forgot MPIN" is double-confirmed: it de-registers the device, so an
 * accidental tap must never trigger it (step 1: bottom sheet, step 2: hold
 * separate explicit confirmation).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, KeyRound, AlertTriangle } from 'lucide-react';
import appStorage from '../../services/appStorage';
import {
  isBiometricAvailable, isBiometricEnabled, verifyBiometric,
} from '../../services/biometric';
import {
  hasDeviceRegistration, getLockScreenIdentity, mpinLogin, clearDeviceRegistration,
  getMpinLength,
} from '../services/appAuth';
import { Screen, PinDots, NumberPad } from '../components/AppUI';

export default function LockScreen() {
  const navigate = useNavigate();
  // The user chose a 4-6 digit MPIN at setup — use THEIR length, never a
  // hardcoded one (a 4-digit user could otherwise never submit 6 dots).
  const MPIN_LENGTH = getMpinLength();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  // 0 = hidden, 1 = first confirmation sheet, 2 = final warning sheet
  const [forgotStep, setForgotStep] = useState(0);
  const { firstName } = getLockScreenIdentity();

  // No registration on this device → onboarding is the only way in.
  useEffect(() => {
    if (!hasDeviceRegistration()) navigate('/app/onboarding', { replace: true });
  }, [navigate]);

  useEffect(() => {
    (async () => {
      const available = await isBiometricAvailable().catch(() => false);
      setBioReady(available && isBiometricEnabled() && !!appStorage.getItem('appBiometricMpin'));
    })();
  }, []);

  const submit = useCallback(async (candidate) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await mpinLogin(candidate);
      // Refresh the biometric replay copy on every successful unlock.
      if (isBiometricEnabled()) appStorage.setItem('appBiometricMpin', candidate);
      navigate('/app/home', { replace: true });
    } catch (err) {
      setPin('');
      if (err.code === 'REVERIFY_REQUIRED') {
        navigate('/app/onboarding?reverify=1', { replace: true });
        return;
      }
      setError(err.response?.data?.message || err.message || 'Incorrect MPIN. Try again.');
    } finally {
      setBusy(false);
    }
  }, [busy, navigate]);

  const onDigit = (d) => {
    if (busy) return;
    setError('');
    setPin((prev) => {
      const next = (prev + d).slice(0, MPIN_LENGTH);
      if (next.length === MPIN_LENGTH) submit(next);
      return next;
    });
  };

  const onBiometric = async () => {
    if (busy || !bioReady) return;
    setError('');
    const ok = await verifyBiometric('Unlock Alister Bank').catch(() => false);
    if (!ok) return; // user cancelled / failed — keypad still available
    const stored = appStorage.getItem('appBiometricMpin');
    if (stored) {
      setPin(stored);
      submit(stored);
    } else {
      setError('Unlock with your MPIN once to enable biometrics.');
    }
  };

  // Final, double-confirmed action: forget this device and start over.
  const confirmForgot = () => {
    clearDeviceRegistration();
    navigate('/app/onboarding?reverify=1', { replace: true });
  };

  return (
    <Screen className="lock-screen flex flex-col items-center justify-between px-6 py-10">
      <header className="flex flex-col items-center gap-4 pt-6 text-center">
        <div className="lock-avatar" aria-hidden="true">
          {firstName ? firstName.charAt(0) : 'A'}
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="app-dim text-sm">Welcome back{firstName ? ',' : ''}</p>
          {firstName && <h1 className="text-2xl font-bold text-balance">{firstName}</h1>}
        </div>
      </header>

      <section className="flex flex-col items-center gap-5 w-full" aria-label="Enter MPIN">
        <p className="app-dim text-sm tracking-wide">Enter your {MPIN_LENGTH}-digit MPIN</p>
        <div className="lock-dots">
          <PinDots length={MPIN_LENGTH} filled={pin.length} error={!!error} />
        </div>
        <p
          className="text-sm text-center min-h-5"
          style={{ color: 'var(--app-danger)' }}
          role={error ? 'alert' : undefined}
        >
          {error}
        </p>
        <div className="lock-pad w-full max-w-xs">
          <NumberPad
            onDigit={onDigit}
            onDelete={() => setPin((p) => p.slice(0, -1))}
            onBiometric={bioReady ? onBiometric : undefined}
          />
        </div>
      </section>

      <footer className="flex flex-col items-center gap-4 pt-6">
        <button
          type="button"
          className="flex items-center gap-2 text-sm app-dim"
          onClick={() => setForgotStep(1)}
        >
          <KeyRound size={14} aria-hidden="true" />
          Forgot MPIN?
        </button>
        <p className="flex items-center gap-1.5 text-xs app-dim">
          <ShieldCheck size={13} aria-hidden="true" />
          Secured by Alister Bank
        </p>
      </footer>

      {/* Forgot MPIN — double confirmation (de-registers this device) */}
      {forgotStep > 0 && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          role="dialog" aria-modal="true" aria-label="Forgot MPIN confirmation"
        >
          <div
            className="w-full max-w-md rounded-t-2xl p-5 pb-10 flex flex-col gap-4"
            style={{ background: 'var(--app-bg)' }}
          >
            {forgotStep === 1 ? (
              <>
                <h2 className="text-base font-bold">Reset your MPIN?</h2>
                <p className="app-dim text-sm leading-relaxed">
                  To reset your MPIN you must verify your identity again with your
                  Customer ID, date of birth, email OTP and password.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep(2)}
                    className="w-full rounded-xl py-3 text-sm font-semibold"
                    style={{ background: 'var(--app-surface)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                  >
                    Continue to reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotStep(0)}
                    className="w-full rounded-xl py-3 text-sm font-semibold"
                    style={{ background: 'var(--app-primary)', color: 'var(--app-on-primary)' }}
                  >
                    Cancel — I remember my MPIN
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <AlertTriangle size={18} style={{ color: 'var(--app-danger)' }} aria-hidden="true" />
                  <h2 className="text-base font-bold">Are you absolutely sure?</h2>
                </div>
                <p className="app-dim text-sm leading-relaxed">
                  This removes your account from this device right now. You will be
                  taken to the full verification flow and must complete every step
                  before you can use the app again.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={confirmForgot}
                    className="w-full rounded-xl py-3 text-sm font-semibold"
                    style={{ background: 'var(--app-danger)', color: '#ffffff' }}
                  >
                    Yes, reset my MPIN
                  </button>
                  <button
                    type="button"
                    onClick={() => setForgotStep(0)}
                    className="w-full rounded-xl py-3 text-sm font-semibold"
                    style={{ background: 'var(--app-surface)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}
