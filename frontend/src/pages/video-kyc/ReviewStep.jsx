import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Pencil, Check, RefreshCw, Camera, ShieldCheck, Loader2, Info,
} from 'lucide-react';
import { validateName, validateDob, validateIdNumber } from './faceMath';

const FIELDS = [
  { key: 'fullName', label: 'Full Name', validate: validateName, inputMode: 'text', autoComplete: 'name' },
  { key: 'dob', label: 'Date of Birth (DD/MM/YYYY)', validate: validateDob, inputMode: 'numeric', autoComplete: 'bday' },
  { key: 'idNumber', label: 'ID Number', validate: validateIdNumber, inputMode: 'text', autoComplete: 'off' },
];

function EditableField({ field, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');

  const save = () => {
    const err = field.validate(draft);
    setError(err);
    if (!err) {
      onChange(draft.trim());
      setEditing(false);
    }
  };

  return (
    <div className="rounded-xl bg-[#F4F4F5] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-wide font-medium text-[#0A0A0A]/50 mb-0.5">
            {field.label}
          </p>
          {editing ? (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) save();
              }}
              inputMode={field.inputMode}
              autoComplete={field.autoComplete}
              autoFocus
              aria-label={field.label}
              className="w-full bg-white border border-[#0A0A0A]/15 rounded-lg px-3 py-2 text-sm text-[#0A0A0A] focus:outline-none focus:border-[#DC2626]"
            />
          ) : (
            <p className={`text-sm font-semibold truncate ${value ? 'text-[#0A0A0A]' : 'text-[#0A0A0A]/40 italic'}`}>
              {value || 'Not detected — tap edit to enter'}
            </p>
          )}
        </div>
        <button
          onClick={() => (editing ? save() : (setDraft(value), setEditing(true)))}
          aria-label={editing ? `Save ${field.label}` : `Edit ${field.label}`}
          className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center transition-colors ${
            editing ? 'bg-[#DC2626] text-white' : 'bg-white text-[#0A0A0A]/60 hover:text-[#DC2626]'
          }`}
        >
          {editing ? <Check size={17} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-[#DC2626] mt-1.5">{error}</p>}
    </div>
  );
}

/**
 * Step 5 — Review & edit. Shows both captures with inline-editable,
 * validated fields, plus rescan/retake escape hatches.
 */
export default function ReviewStep({
  selfie, idPhoto, details, onDetailsChange, ocrEmpty,
  onRetakeSelfie, onRescanId, onSubmit, submitting,
}) {
  const errors = FIELDS.map((f) => f.validate(details[f.key])).filter(Boolean);
  const canSubmit = errors.length === 0 && !submitting;

  return (
    <motion.div
      key="review"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-md mx-auto px-4 pb-8"
    >
      <h2 className="vkyc-heading text-2xl font-bold text-[#0A0A0A] text-center mb-1">
        Review your details
      </h2>
      <p className="text-sm text-[#0A0A0A]/60 text-center mb-6 leading-relaxed">
        Check the extracted information and correct anything before submitting.
      </p>

      {/* Captures */}
      <div className="grid grid-cols-2 gap-3 mb-4">
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

      {ocrEmpty && (
        <div className="flex items-start gap-2.5 px-4 py-3 mb-4 rounded-xl bg-[#F4F4F5] text-sm text-[#0A0A0A]/70 leading-relaxed">
          <Info size={16} className="shrink-0 mt-0.5 text-[#DC2626]" aria-hidden="true" />
          We couldn&apos;t read some details from your ID automatically. Please enter them manually below.
        </div>
      )}

      {/* Editable fields */}
      <div className="space-y-3 mb-6">
        {FIELDS.map((f) => (
          <EditableField
            key={f.key}
            field={f}
            value={details[f.key]}
            onChange={(v) => onDetailsChange({ ...details, [f.key]: v })}
          />
        ))}
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
      {errors.length > 0 && (
        <p className="text-xs text-[#DC2626] text-center mt-3">
          Fix the highlighted fields to continue.
        </p>
      )}
    </motion.div>
  );
}
