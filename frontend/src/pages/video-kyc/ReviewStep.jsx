import React from 'react';
import { motion } from 'framer-motion';
import {
  RefreshCw, Camera, ShieldCheck, Loader2,
} from 'lucide-react';

/**
 * Step 5 — Review captures. Shows the selfie and the scanned ID
 * side by side with retake/rescan escape hatches, then submit.
 */
export default function ReviewStep({
  selfie, idPhoto, onRetakeSelfie, onRescanId, onSubmit, submitting,
}) {
  const canSubmit = Boolean(selfie && idPhoto) && !submitting;

  return (
    <motion.div
      key="review"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-md mx-auto px-4 pb-8"
    >
      <h2 className="vkyc-heading text-2xl font-bold text-[#0A0A0A] text-center mb-1">
        Review your captures
      </h2>
      <p className="text-sm text-[#0A0A0A]/60 text-center mb-5 leading-relaxed">
        Make sure your selfie and ID photo are clear before submitting.
      </p>

      {/* Captures */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl overflow-hidden bg-[#F4F4F5]" onContextMenu={(e) => e.preventDefault()}>
          <img src={selfie || undefined} alt="Captured selfie" className="vkyc-protected w-full aspect-square object-cover" draggable={false} />
          <button
            onClick={onRetakeSelfie}
            disabled={submitting}
            className="w-full min-h-[44px] text-xs font-semibold text-[#0A0A0A]/70 flex items-center justify-center gap-1.5 hover:text-[#DC2626] disabled:opacity-40"
          >
            <Camera size={14} aria-hidden="true" /> Retake Selfie
          </button>
        </div>
        <div className="rounded-xl overflow-hidden bg-[#F4F4F5]" onContextMenu={(e) => e.preventDefault()}>
          <img src={idPhoto || undefined} alt="Captured ID card" className="vkyc-protected w-full aspect-square object-cover" draggable={false} />
          <button
            onClick={onRescanId}
            disabled={submitting}
            className="w-full min-h-[44px] text-xs font-semibold text-[#0A0A0A]/70 flex items-center justify-center gap-1.5 hover:text-[#DC2626] disabled:opacity-40"
          >
            <RefreshCw size={14} aria-hidden="true" /> Rescan ID
          </button>
        </div>
      </div>

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="w-full min-h-[52px] rounded-xl bg-[#DC2626] text-white font-semibold text-sm tracking-wide flex items-center justify-center gap-2 transition-opacity disabled:opacity-40 hover:opacity-90"
      >
        {submitting ? (
          <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Submitting…</>
        ) : (
          <><ShieldCheck size={18} aria-hidden="true" /> Confirm &amp; Submit</>
        )}
      </button>
    </motion.div>
  );
}
