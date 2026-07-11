import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck, Sun, CreditCard, Camera, Lock,
  AlertTriangle, Loader2, RefreshCw, ArrowRight,
} from 'lucide-react';

const CHECKLIST = [
  { icon: Sun, text: 'Good, even lighting on your face' },
  { icon: CreditCard, text: 'Government-issued ID card ready' },
  { icon: Camera, text: 'Working front camera on this device' },
];

/**
 * Step 0 — Landing / consent. Start stays disabled until the user
 * consents to camera + biometric processing. Camera permission is
 * requested on Start; denial renders actionable re-enable steps.
 */
export default function ConsentScreen({ onStart, starting, error }) {
  const [consented, setConsented] = useState(false);

  return (
    <motion.div
      key="consent"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-md mx-auto px-4"
    >
      {/* Brand */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-[#DC2626] flex items-center justify-center mb-4 shadow-lg shadow-[#DC2626]/25">
          <ShieldCheck size={32} className="text-white" aria-hidden="true" />
        </div>
        <p className="vkyc-heading text-sm font-semibold tracking-[0.18em] uppercase text-[#DC2626] mb-1">
          Alister Bank
        </p>
        <h1 className="vkyc-heading text-3xl font-bold text-[#0A0A0A] text-balance">
          Video KYC Verification
        </h1>
        <p className="text-sm text-[#0A0A0A]/60 mt-2 leading-relaxed text-pretty">
          Verify your identity in about 2 minutes. Everything runs securely
          in your browser — your camera frames never leave this device.
        </p>
      </div>

      {/* Checklist */}
      <ul className="space-y-3 mb-6">
        {CHECKLIST.map(({ icon: Icon, text }, i) => (
          <motion.li
            key={text}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-[#F4F4F5]"
          >
            <div className="w-10 h-10 shrink-0 rounded-lg bg-white flex items-center justify-center">
              <Icon size={18} className="text-[#DC2626]" aria-hidden="true" />
            </div>
            <span className="text-sm font-medium text-[#0A0A0A]">{text}</span>
          </motion.li>
        ))}
      </ul>

      {/* Consent */}
      <label className="flex items-start gap-3 px-4 py-3.5 rounded-xl border border-[#0A0A0A]/10 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={consented}
          onChange={(e) => setConsented(e.target.checked)}
          className="mt-0.5 w-5 h-5 accent-[#DC2626] shrink-0"
        />
        <span className="text-sm text-[#0A0A0A]/80 leading-relaxed">
          I consent to camera access and on-device biometric verification for
          the purpose of identity verification.
        </span>
      </label>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 px-4 py-3 mb-4 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/30 text-sm text-[#DC2626] leading-relaxed"
        >
          <AlertTriangle size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={onStart}
        disabled={!consented || starting}
        className="w-full min-h-[52px] rounded-xl bg-[#DC2626] text-white font-semibold text-sm tracking-wide flex items-center justify-center gap-2 transition-opacity disabled:opacity-40 hover:opacity-90"
      >
        {starting ? (
          <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Requesting camera…</>
        ) : error ? (
          <><RefreshCw size={18} aria-hidden="true" /> Retry Camera Access</>
        ) : (
          <>Start Verification <ArrowRight size={18} aria-hidden="true" /></>
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-[#0A0A0A]/45 mt-4">
        <Lock size={12} aria-hidden="true" />
        All biometric processing stays on your device.
      </p>
    </motion.div>
  );
}
