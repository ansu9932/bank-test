import React from 'react';
import { Check } from 'lucide-react';

export const VKYC_STEPS = [
  'Consent',
  'Position',
  'Liveness',
  'Selfie',
  'ID Scan',
  'Review',
];

/**
 * Persistent 6-step progress indicator. Red fill for completed steps,
 * outlined red for the active step. `dark` flips text colors for the
 * camera screens.
 */
export default function StepProgress({ current, dark = false }) {
  return (
    <nav aria-label="Verification progress" className="w-full max-w-lg mx-auto px-4">
      <ol className="flex items-center gap-1 sm:gap-2">
        {VKYC_STEPS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="w-full flex items-center gap-1 sm:gap-2">
                <div
                  aria-current={active ? 'step' : undefined}
                  className={`shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-semibold border-2 transition-colors duration-300 ${
                    done
                      ? 'bg-[#DC2626] border-[#DC2626] text-white'
                      : active
                        ? `border-[#DC2626] text-[#DC2626] ${dark ? 'bg-transparent' : 'bg-white'}`
                        : dark
                          ? 'border-white/25 text-white/40 bg-transparent'
                          : 'border-[#0A0A0A]/15 text-[#0A0A0A]/40 bg-white'
                  }`}
                >
                  {done ? <Check size={13} aria-hidden="true" /> : i + 1}
                </div>
                {i < VKYC_STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 rounded-full ${dark ? 'bg-white/15' : 'bg-[#0A0A0A]/10'}`}>
                    <div
                      className="h-full rounded-full bg-[#DC2626] transition-all duration-500 origin-left"
                      style={{ width: done ? '100%' : '0%' }}
                    />
                  </div>
                )}
              </div>
              <span
                className={`text-[9px] sm:text-[10px] font-medium uppercase tracking-wide truncate w-full text-left ${
                  active || done
                    ? dark ? 'text-white/90' : 'text-[#0A0A0A]'
                    : dark ? 'text-white/35' : 'text-[#0A0A0A]/35'
                }`}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
