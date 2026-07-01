import React from 'react';

/**
 * Site-wide DEMO notice.
 *
 * This application is a demonstration/portfolio banking simulation — it is NOT
 * a real bank, and no real money or transfers occur. This banner is shown on
 * every page so users are never misled. Please keep it in place.
 */
export default function DemoBanner() {
  return (
    <div
      role="note"
      style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999 }}
      className="bg-amber-500 text-black text-center text-[11px] sm:text-[12px] font-semibold py-1 px-3 leading-snug"
    >
      ⚠️ DEMO ENVIRONMENT — Simulated banking for demonstration only. Not a real bank · No real money, deposits, or transfers.
    </div>
  );
}
