/**
 * Shared building blocks for the mobile app (/app) surface.
 * All styling is scoped via app.css tokens — website theme untouched.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ArrowLeftRight, Clock, Menu, ChevronLeft, Delete, Fingerprint } from 'lucide-react';

// ─── Screen wrapper ──────────────────────────────────────────────────────────
export function Screen({ children, className = '' }) {
  return (
    <div className={`screen-in flex flex-col flex-1 ${className}`}>
      {children}
    </div>
  );
}

// ─── Top header with optional back button ────────────────────────────────────
export function AppHeader({ title, onBack, backTo, right }) {
  const navigate = useNavigate();
  const handleBack = onBack || (backTo ? () => navigate(backTo) : null);
  return (
    <header className="safe-top flex items-center gap-3 px-4 pb-3" style={{ background: 'var(--app-bg)' }}>
      {handleBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Go back"
          className="flex items-center justify-center w-9 h-9 rounded-full"
          style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
        >
          <ChevronLeft size={20} style={{ color: 'var(--app-text)' }} />
        </button>
      )}
      <h1 className="flex-1 text-base font-semibold text-balance" style={{ color: 'var(--app-text)' }}>{title}</h1>
      {right}
    </header>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, className = '', style = {} }) {
  return (
    <div
      className={`rounded-2xl p-4 ${className}`}
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        boxShadow: 'var(--app-shadow)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Primary / secondary buttons ─────────────────────────────────────────────
export function PrimaryButton({ children, disabled, loading, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className="w-full h-12 rounded-xl font-semibold text-[15px] transition-opacity disabled:opacity-40"
      style={{ background: 'var(--app-primary)', color: 'var(--app-on-primary)' }}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

export function GhostButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="w-full h-12 rounded-xl font-semibold text-[15px]"
      style={{ background: 'var(--app-surface)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── Labeled input ───────────────────────────────────────────────────────────
export function Field({ label, hint, error, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13px] font-medium" style={{ color: 'var(--app-text-dim)' }}>{label}</label>
      {children}
      {hint && !error && <p className="text-xs" style={{ color: 'var(--app-text-dim)' }}>{hint}</p>}
      {error && <p className="text-xs" style={{ color: 'var(--app-danger)' }}>{error}</p>}
    </div>
  );
}

export function TextInput(props) {
  return (
    <input
      className="w-full h-12 rounded-xl px-4 text-[15px] outline-none focus:ring-2"
      style={{
        background: 'var(--app-surface)',
        border: '1px solid var(--app-border)',
        color: 'var(--app-text)',
        '--tw-ring-color': 'var(--app-primary)',
      }}
      {...props}
    />
  );
}

// ─── OTP boxes ───────────────────────────────────────────────────────────────
export function OTPBoxes({ length = 6, value, onChange, autoFocus = true }) {
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const digits = value.split('');
  return (
    <div className="relative">
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Verification code"
        className="absolute inset-0 opacity-0 w-full h-full"
      />
      <div className="flex gap-2 justify-center" onClick={() => ref.current?.focus()}>
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className="w-11 h-13 h-[52px] rounded-xl flex items-center justify-center text-xl font-bold"
            style={{
              background: 'var(--app-surface)',
              border: `1.5px solid ${i === value.length ? 'var(--app-primary)' : 'var(--app-border)'}`,
              color: 'var(--app-text)',
            }}
          >
            {digits[i] || ''}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PIN dots + number pad ───────────────────────────────────────────────────
export function PinDots({ length = 4, filled, error }) {
  return (
    <div className="flex gap-3 justify-center" role="status" aria-label={`${filled} of ${length} digits entered`}>
      {Array.from({ length }).map((_, i) => (
        <div key={i} className={`pin-dot ${i < filled ? 'filled' : ''} ${error ? 'error' : ''}`} />
      ))}
    </div>
  );
}

export function NumberPad({ onDigit, onDelete, onBiometric }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  return (
    <div className="grid grid-cols-3 gap-3 px-6">
      {keys.map((k) => (
        <button key={k} type="button" className="pad-key" onClick={() => onDigit(k)} aria-label={`Digit ${k}`}>
          {k}
        </button>
      ))}
      {onBiometric ? (
        <button type="button" className="pad-key" onClick={onBiometric} aria-label="Unlock with biometrics">
          <Fingerprint size={26} style={{ color: 'var(--app-primary)' }} />
        </button>
      ) : (
        <div />
      )}
      <button type="button" className="pad-key" onClick={() => onDigit('0')} aria-label="Digit 0">0</button>
      <button type="button" className="pad-key" onClick={onDelete} aria-label="Delete digit">
        <Delete size={22} style={{ color: 'var(--app-text-dim)' }} />
      </button>
    </div>
  );
}

// ─── Bottom navigation ───────────────────────────────────────────────────────
const NAV = [
  { to: '/app/home', label: 'Home', icon: Home },
  { to: '/app/pay', label: 'Pay', icon: ArrowLeftRight },
  { to: '/app/history', label: 'History', icon: Clock },
  { to: '/app/menu', label: 'Menu', icon: Menu },
];

export function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <nav
      className="safe-bottom sticky bottom-0 flex items-stretch"
      style={{ background: 'var(--app-surface)', borderTop: '1px solid var(--app-border)' }}
      aria-label="App navigation"
    >
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className="flex-1 flex flex-col items-center gap-1 py-2.5"
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={22} style={{ color: active ? 'var(--app-primary)' : 'var(--app-text-dim)' }} />
            <span
              className="text-[11px] font-medium"
              style={{ color: active ? 'var(--app-primary)' : 'var(--app-text-dim)' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// ─── Bottom sheet modal ──────────────────────────────────────────────────────
export function Sheet({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        className="relative w-full max-w-[480px] rounded-t-3xl p-5 pb-8 screen-in max-h-[85dvh] overflow-y-auto"
        style={{ background: 'var(--app-surface)', borderTop: '1px solid var(--app-border)' }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'var(--app-border)' }} />
        {title && <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--app-text)' }}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

// ─── Brand logo mark ─────────────────────────────────────────────────────────
export function BrandMark({ size = 44 }) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl font-bold"
      style={{
        width: size,
        height: size,
        background: 'var(--app-primary)',
        color: 'var(--app-on-primary)',
        fontSize: size * 0.45,
        fontFamily: 'Georgia, serif',
      }}
      aria-hidden="true"
    >
      A
    </div>
  );
}

// ─── Simple state hook for async submit buttons ──────────────────────────────
export function useSubmit(fn) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const run = async (...args) => {
    setLoading(true);
    setError('');
    try {
      return await fn(...args);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Something went wrong.');
      throw err;
    } finally {
      setLoading(false);
    }
  };
  return { run, loading, error, setError };
}
