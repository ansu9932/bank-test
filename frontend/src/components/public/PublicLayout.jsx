import React, { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Navbar from './Navbar';
import Footer from './Footer';
import ScrollProgress from './ScrollProgress';

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A0A' }}>
      <div
        className="w-10 h-10 rounded-full border-2 animate-spin"
        style={{ borderColor: 'rgba(204,0,0,0.25)', borderTopColor: '#CC0000' }}
      />
    </div>
  );
}

// Shared shell for every public marketing page: scroll bar, sticky navbar,
// animated route outlet, and the full footer.
export default function PublicLayout() {
  const location = useLocation();
  return (
    <div className="al-public-root text-white min-h-screen flex flex-col">
      <ScrollProgress />
      <Navbar />
      <main className="flex-1 pt-[72px]">
        <Suspense fallback={<PageFallback />}>
          <AnimatePresence mode="wait">
            <Outlet key={location.pathname} />
          </AnimatePresence>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
