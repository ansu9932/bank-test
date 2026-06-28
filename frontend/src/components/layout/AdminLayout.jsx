import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  RiDashboardLine, RiGroupLine, RiExchangeLine,
  RiFileShield2Line, RiCustomerService2Line,
  RiLogoutBoxLine, RiBankLine, RiShieldLine,
  RiShieldCheckLine, RiMenuLine, RiCloseLine,
  RiBankCard2Line,
} from 'react-icons/ri';

const navItems = [
  { to: '/admin', icon: RiDashboardLine, label: 'Dashboard', end: true },
  { to: '/admin/users', icon: RiGroupLine, label: 'Users & KYC' },
  { to: '/admin/kyc-review', icon: RiShieldCheckLine, label: 'KYC Review' },
  { to: '/admin/transactions', icon: RiExchangeLine, label: 'Transactions' },
  { to: '/admin/neft-requests', icon: RiBankLine, label: 'NEFT Requests' },
  { to: '/admin/approved-cards', icon: RiBankCard2Line, label: 'Approved Cards' },
  { to: '/admin/tickets', icon: RiCustomerService2Line, label: 'Tickets' },
  { to: '/admin/audit', icon: RiFileShield2Line, label: 'Audit Logs' },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  // Mobile drawer open state. Closed by default; auto-closes on route change.
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  // Sidebar inner content (shared between the static desktop rail and the
  // mobile off-canvas drawer) so the nav is defined exactly once.
  const SidebarContent = (
    <>
      <div className="flex items-center justify-between gap-3 px-5 py-5 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0">
            <RiShieldLine className="text-white text-sm" />
          </div>
          <div>
            <p className="font-display font-700 text-white text-sm">Admin Panel</p>
            <p className="text-dark-400 text-[10px]">Alister Bank</p>
          </div>
        </div>
        {/* Close button — mobile drawer only */}
        <button
          onClick={() => setDrawerOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-dark-300 hover:text-white hover:bg-white/[0.05]"
          aria-label="Close menu"
        >
          <RiCloseLine className="text-xl" />
        </button>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon className="text-lg flex-shrink-0" />
            <span className="text-sm">{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-3 pb-4 border-t border-white/[0.05] pt-3">
        <button onClick={handleLogout} className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10">
          <RiLogoutBoxLine className="text-lg" />
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-dark-900">
      {/* ── Desktop static sidebar (lg+) ──────────────────────────────── */}
      <aside className="hidden lg:flex w-56 flex-col bg-dark-800 border-r border-white/[0.05] flex-shrink-0">
        {SidebarContent}
      </aside>

      {/* ── Mobile off-canvas drawer (< lg) ───────────────────────────── */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="admin-drawer-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              key="admin-drawer"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 z-50 w-64 max-w-[80%] flex flex-col bg-dark-800 border-r border-white/[0.05]"
            >
              {SidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center gap-3 px-4 sm:px-6 border-b border-white/[0.05] bg-dark-800/50">
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-lg text-dark-200 hover:text-white hover:bg-white/[0.05]"
            aria-label="Open menu"
          >
            <RiMenuLine className="text-xl" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <RiBankLine className="text-brand-400 flex-shrink-0" />
            <p className="text-white text-sm font-medium truncate">
              <span className="hidden sm:inline">Alister Bank — </span>Administration
            </p>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
