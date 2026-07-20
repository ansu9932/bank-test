import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import PageErrorBoundary from '../common/PageErrorBoundary';
import { useDispatch, useSelector } from 'react-redux';
import { RiMenuLine, RiBankLine, RiCloseLine, RiShieldFlashLine } from 'react-icons/ri';
import Sidebar from './Sidebar';
import { fetchAccount } from '../../store/slices/accountSlice';
import { fetchNotifications } from '../../store/slices/notificationSlice';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { toggleMobileSidebar, closeMobileSidebar } from '../../store/slices/uiSlice';
import useSessionTimeout from '../../hooks/useSessionTimeout';

export default function DashboardLayout() {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const { sidebarMobileOpen } = useSelector((s) => s.ui);

  // Customer-only session-security engine (5-min inactivity, 1-hr absolute cap,
  // concurrent-login enforcement). Inert on admin routes/users by design.
  const { concurrentKicked, resolveKick } = useSessionTimeout();

  // ── Initial data load + notification polling ──────────────────────────────
  useEffect(() => {
    dispatch(fetchAccount());
    dispatch(fetchNotifications());
    dispatch(fetchTransactions({ limit: 20 }));
    const interval = setInterval(() => dispatch(fetchNotifications()), 30000);
    return () => clearInterval(interval);
  }, [dispatch]);

  const openDrawer  = () => dispatch(toggleMobileSidebar());
  const closeDrawer = () => dispatch(closeMobileSidebar());

  // ── CONCURRENT-LOGIN LOCKOUT ──────────────────────────────────────────────
  // When the server reports this session was superseded on another device, we
  // break the active layout entirely and render a single blocking dialog.
  if (concurrentKicked) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6"
        style={{ background: 'rgba(5,5,8,0.92)', backdropFilter: 'blur(8px)' }}>
        <div className="w-full max-w-md rounded-3xl border p-8 text-center"
          style={{ background: '#15161c', borderColor: '#ef444455', boxShadow: '0 0 60px rgba(220,38,38,0.35)' }}>
          <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5 border"
            style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.12)' }}>
            <RiShieldFlashLine className="text-3xl" style={{ color: '#ef4444' }} />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight mb-2">Session Ended</h2>
          <p className="text-sm text-white/60 mb-6 leading-relaxed">
            Account logged in another device. This session has been destroyed for your security.
          </p>
          <button
            onClick={resolveKick}
            className="w-full py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase text-white"
            style={{ background: 'linear-gradient(135deg, #ef4444, #991b1b)', boxShadow: '0 0 26px rgba(220,38,38,0.4)' }}
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }


  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">

      {/* ── 1. DESKTOP SIDEBAR — hidden on mobile, fixed column on md+ ─────── */}
      <aside className="hidden md:flex md:w-64 flex-shrink-0 flex-col bg-dark-800 border-r border-white/[0.05]">
        <Sidebar />
      </aside>

      {/* ── 3a. MOBILE BACKDROP — dismiss drawer on outside click ─────────── */}
      <div
        onClick={closeDrawer}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden transition-opacity duration-300 ${
          sidebarMobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* ── 3b. MOBILE SLIDE-OUT DRAWER ───────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-dark-800 border-r border-white/[0.05] flex flex-col transform transition-transform duration-300 ease-in-out md:hidden ${
          sidebarMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer close button */}
        <button
          onClick={closeDrawer}
          aria-label="Close menu"
          className="absolute top-4 right-3 p-2 rounded-lg text-dark-200 hover:text-white hover:bg-white/[0.06] transition-colors z-10"
        >
          <RiCloseLine className="text-xl" />
        </button>
        <Sidebar onNavigate={closeDrawer} />
      </aside>


      {/* ── 4. MAIN COLUMN — full width on mobile, scrolls vertically ─────── */}
      <div className="flex-1 flex flex-col min-w-0 w-full">

        {/* ── 2. STICKY MOBILE TOP BAR — logo + hamburger (mobile only) ───── */}
        <header className="flex md:hidden items-center justify-between h-14 px-4 flex-shrink-0 sticky top-0 z-30 border-b border-white/[0.05] bg-dark-800/80 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-glow">
              <RiBankLine className="text-white text-base" />
            </div>
            <span className="font-display font-700 text-white text-sm">Alister Bank</span>
          </div>
          <button
            onClick={openDrawer}
            aria-label="Open navigation menu"
            className="p-2 rounded-xl text-dark-200 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <RiMenuLine className="text-2xl" />
          </button>
        </header>

        {/* Scrollable content panel — the error boundary guarantees a page
            crash shows a recovery card instead of a blank screen. */}
        <main className="flex-1 w-full overflow-y-auto overflow-x-hidden p-4 lg:p-6 page-enter">
          <PageErrorBoundary resetKey={pathname}>
            <Outlet />
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
