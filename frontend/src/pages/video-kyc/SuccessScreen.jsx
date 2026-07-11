import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, Download, ArrowRight } from 'lucide-react';

const VERIFIED_ITEMS = ['Liveness', 'Blink', 'Selfie', 'ID Scan', 'Details'];

/**
 * Step 6 — Success. Animated checkmark ring (SVG stroke draw-in),
 * reference ID + timestamp, verified summary, receipt download.
 */
export default function SuccessScreen({ details, onFinish }) {
  const refId = useMemo(
    () => `VKYC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    []
  );
  const timestamp = useMemo(() => new Date().toLocaleString(), []);

  const downloadReceipt = () => {
    const lines = [
      'ALISTER BANK — VIDEO KYC RECEIPT',
      '─────────────────────────────────',
      `Reference ID : ${refId}`,
      `Completed at : ${timestamp}`,
      `Name         : ${details.fullName || '—'}`,
      `Date of Birth: ${details.dob || '—'}`,
      `ID Number    : ${details.idNumber || '—'}`,
      '',
      'Verified: Liveness, Blink, Selfie, ID Scan, Details',
      'Status  : Submitted for final officer review.',
    ].join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${refId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      key="success"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md mx-auto px-4 pb-8 text-center"
    >
      {/* Animated check */}
      <div className="w-28 h-28 mx-auto mb-6">
        <svg viewBox="0 0 100 100" className="w-full h-full" role="img" aria-label="Verification successful">
          <circle
            cx="50" cy="50" r="48" fill="none"
            stroke="#16A34A" strokeWidth="3"
            className="vkyc-check-ring"
            transform="rotate(-90 50 50)"
          />
          <path
            d="M30 52 L44 66 L72 38"
            fill="none" stroke="#16A34A" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
            className="vkyc-check-mark"
          />
        </svg>
      </div>

      <h2 className="vkyc-heading text-3xl font-bold text-[#0A0A0A] mb-2 text-balance">
        vKYC Done — Verification Complete
      </h2>
      <p className="text-sm text-[#0A0A0A]/60 mb-6 leading-relaxed">
        Your identity has been captured and submitted. We&apos;ll email you
        once an officer completes the final review.
      </p>

      {/* Reference card */}
      <div className="rounded-xl bg-[#F4F4F5] px-5 py-4 mb-4 text-left">
        <div className="flex justify-between gap-4 mb-1">
          <span className="text-xs text-[#0A0A0A]/50 uppercase tracking-wide">Reference ID</span>
          <span className="text-sm font-mono font-semibold text-[#0A0A0A]">{refId}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-xs text-[#0A0A0A]/50 uppercase tracking-wide">Completed</span>
          <span className="text-sm text-[#0A0A0A]">{timestamp}</span>
        </div>
      </div>

      {/* Verified summary */}
      <ul className="grid grid-cols-2 gap-2 mb-8">
        {VERIFIED_ITEMS.map((item, i) => (
          <motion.li
            key={item}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 + i * 0.1 }}
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-[#F4F4F5] text-left"
          >
            <span className="w-5 h-5 rounded-full bg-[#16A34A] flex items-center justify-center shrink-0">
              <Check size={12} className="text-white" aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-[#0A0A0A]">{item}</span>
          </motion.li>
        ))}
      </ul>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={downloadReceipt}
          className="flex-1 min-h-[50px] rounded-xl border-2 border-[#0A0A0A]/15 text-[#0A0A0A] font-semibold text-sm flex items-center justify-center gap-2 hover:border-[#DC2626] hover:text-[#DC2626] transition-colors"
        >
          <Download size={17} aria-hidden="true" /> Download Receipt
        </button>
        <button
          onClick={onFinish}
          className="flex-1 min-h-[50px] rounded-xl bg-[#DC2626] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          Finish <ArrowRight size={17} aria-hidden="true" />
        </button>
      </div>
    </motion.div>
  );
}
