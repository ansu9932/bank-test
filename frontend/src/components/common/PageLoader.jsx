import React from 'react';

// Shared route-level loading fallback for lazy-loaded pages.
// Mirrors the spinner used by PublicLayout's <Suspense fallback> so the
// loading experience is consistent across public, dashboard, account-opening,
// and admin routes.
export default function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A0A' }}>
      <div
        className="w-10 h-10 rounded-full border-2 animate-spin"
        style={{ borderColor: 'rgba(204,0,0,0.25)', borderTopColor: '#CC0000' }}
      />
    </div>
  );
}
