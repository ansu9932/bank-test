/**
 * MPIN lock screen — shown whenever a registered device opens the app.
 *
 * Biometric unlock: after the first successful MPIN entry with biometrics
 * enabled, the MPIN is kept in Keystore-backed secure storage; a fingerprint
 * match replays it. Wrong-MPIN lockout is enforced server-side (5 tries).
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, RefreshCcw } from 'lucide-react';
import appStorage from '../../services/appStorage';
import {
  isBiometricAvailable, isBiometricEnabled, verifyBiometric,
} from '../../services/biometric';
import {
  hasDeviceRegistration, getLockScreenIdentity, mpinLogin, clearDeviceRegistration,
  getMpinLength,
} from '../services/appAuth';
import { Screen, PinDots, NumberPad, BrandMark } from '../components/AppUI';

export default function LockScreen() {
  const navigate = useNavigate();
  // The user chose a 4-6 digit MPIN at setup — use THEIR length, never a
  // hardcoded one (a 4-digit user could otherwise never submit 6 dots).
  const MPIN_LENGTH = getMpinLength();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioReady, setBioReady] = useState(false);
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

  const reverify = () => {
    clearDeviceRegistration();
    navigate('/app/onboarding?reverify=1', { replace: true });
  };

  return (
    <Screen className="flex flex-col items-center justify-between px-6 py-10">
      <header className="flex flex-col items-center gap-4 pt-4 text-center">
        <BrandMark size={52} />
        <div>
          <p className="app-dim text-sm">Welcome back{firstName ? ',' : ''}</p>
          {firstName && <h1 className="text-xl font-bold text-balance">{firstName}</h1>}
        </div>
      </header>

      <section className="flex flex-col items-center gap-5 w-full" aria-label="Enter MPIN">
        <p className="app-dim text-sm">Enter your {MPIN_LENGTH}-digit MPIN</p>
        <PinDots length={MPIN_LENGTH} filled={pin.length} error={!!error} />
        <p
          className="text-sm text-center min-h-5"
          style={{ color: 'var(--app-danger)' }}
          role={error ? 'alert' : undefined}
        >
          {error}
        </p>
        <NumberPad
          onDigit={onDigit}
          onDelete={() => setPin((p) => p.slice(0, -1))}
          onBiometric={bioReady ? onBiometric : undefined}
        />
      </section>

      <footer className="flex flex-col items-center gap-4 pt-6">
        <button type="button" className="flex items-center gap-2 text-sm app-dim" onClick={reverify}>
          <RefreshCcw size={14} aria-hidden="true" />
          Forgot MPIN? Re-verify identity
        </button>
        <p className="flex items-center gap-1.5 text-xs app-dim">
          <ShieldCheck size={13} aria-hidden="true" />
          Secured by Alister Bank
        </p>
      </footer>
    </Screen>
  );
}
