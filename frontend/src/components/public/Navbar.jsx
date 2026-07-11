import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Menu, X, ChevronDown, ArrowRight, Wallet,
  CreditCard, Landmark, TrendingUp, Send, Info,
} from 'lucide-react';

const NAV_LINKS = [
  { label: 'Loans', to: '/loans' },
  { label: 'Investments', to: '/investments' },
  { label: 'Payments', to: '/payments' },
  { label: 'About', to: '/about' },
];

const MEGA = {
  accounts: [
    { label: 'Savings Account', to: '/accounts', icon: Wallet },
    { label: 'Current Account', to: '/accounts', icon: Landmark },
  ],
  cards: [
    { label: 'Debit Card', to: '/cards', icon: CreditCard },
    { label: 'Credit Card (Coming Soon)', to: '/cards', icon: CreditCard },
  ],
  services: [
    { label: 'Open Account', to: '/open-account' },
    { label: 'Track Application', to: '/open-account' },
    { label: 'NetBanking', to: '/login' },
  ],
};

function BrandLogo({ onClick }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-2.5 group shrink-0">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center font-serif-display font-extrabold text-white text-xl"
        style={{
          background: 'linear-gradient(135deg, #CC0000, #FF3333)',
          boxShadow: '0 0 22px rgba(204,0,0,0.45)',
        }}
      >
        A
      </div>
      <span className="font-bold tracking-tight text-white text-lg sm:text-xl">
        Alister<span style={{ color: '#FF3333' }}> Bank</span>
      </span>
    </Link>
  );
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const closeTimer = useRef(null);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close menus whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
    setMegaOpen(false);
  }, [location.pathname]);

  const openMega = () => {
    clearTimeout(closeTimer.current);
    setMegaOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setMegaOpen(false), 160);
  };

  const linkClass = ({ isActive }) =>
    `al-underline relative text-sm font-medium transition-colors py-2 ${
      isActive ? 'text-white active' : 'text-white/65 hover:text-white'
    }`;

  return (
    <header
      className="fixed top-0 left-0 right-0 z-[100] transition-all duration-300"
      style={{
        background: scrolled ? 'rgba(10,10,10,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled
          ? '1px solid rgba(204,0,0,0.3)'
          : '1px solid transparent',
      }}
    >
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-8 lg:px-12 h-[72px]">
        <BrandLogo />

        {/* Desktop center links */}
        <div className="hidden lg:flex items-center gap-8">
          {/* Products mega trigger */}
          <div
            className="relative"
            onMouseEnter={openMega}
            onMouseLeave={scheduleClose}
          >
            <button
              className="flex items-center gap-1 text-sm font-medium text-white/65 hover:text-white transition-colors py-2"
              aria-haspopup="true"
              aria-expanded={megaOpen}
              onClick={() => setMegaOpen((o) => !o)}
            >
              Products
              <ChevronDown
                size={15}
                className={`transition-transform ${megaOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <AnimatePresence>
              {megaOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 12 }}
                  transition={{ duration: 0.18 }}
                  className="absolute top-full left-1/2 -translate-x-1/2 pt-4"
                >
                  <div
                    className="al-glass rounded-2xl p-6 w-[640px] grid grid-cols-3 gap-6"
                    style={{ background: 'rgba(20,20,20,0.97)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}
                  >
                    <MegaColumn title="Accounts" items={MEGA.accounts} />
                    <MegaColumn title="Cards" items={MEGA.cards} />
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.2em] uppercase mb-4" style={{ color: '#FF3333' }}>
                        Quick Services
                      </p>
                      <ul className="space-y-3">
                        {MEGA.services.map((s) => (
                          <li key={s.label}>
                            <Link
                              to={s.to}
                              className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
                            >
                              <ArrowRight size={14} style={{ color: '#CC0000' }} />
                              {s.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {NAV_LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* Desktop right CTAs */}
        <div className="hidden lg:flex items-center gap-3">
          <Link
            to="/login"
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white border border-white/20 hover:border-[#CC0000] hover:text-[#FF3333] transition-all"
          >
            Login to NetBanking
          </Link>
          <Link
            to="/open-account"
            className="al-btn-shine group/cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 active:scale-95 hover:scale-[1.04]"
            style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 22px rgba(204,0,0,0.45)' }}
          >
            Open Account <ArrowRight size={15} className="transition-transform duration-300 group-hover/cta:translate-x-0.5" />
          </Link>
        </div>

        {/* Mobile actions: persistent Login button + hamburger */}
        <div className="lg:hidden flex items-center gap-2">
          <Link
            to="/login"
            className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white border border-white/20 hover:border-[#CC0000] hover:text-[#FF3333] transition-all"
          >
            Login
          </Link>
          <button
            className="p-2 -mr-2"
            style={{ color: '#FF3333' }}
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={28} />
          </button>
        </div>
      </nav>

      {/* Mobile full-screen overlay */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="lg:hidden fixed inset-0 z-[110] flex flex-col"
            style={{ background: '#0A0A0A' }}
          >
            <div className="flex items-center justify-between px-4 h-[72px] border-b border-white/10">
              <BrandLogo onClick={() => setMenuOpen(false)} />
              <button
                className="p-2 -mr-2"
                style={{ color: '#FF3333' }}
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <X size={28} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-1">
              <MobileLink to="/accounts" icon={Wallet}>Accounts</MobileLink>
              <MobileLink to="/cards" icon={CreditCard}>Cards</MobileLink>
              <MobileLink to="/loans" icon={Landmark}>Loans</MobileLink>
              <MobileLink to="/investments" icon={TrendingUp}>Investments</MobileLink>
              <MobileLink to="/payments" icon={Send}>Payments</MobileLink>
              <MobileLink to="/about" icon={Info}>About</MobileLink>
              <MobileLink to="/contact" icon={Info}>Contact</MobileLink>

              <div className="mt-8 flex flex-col gap-3">
                <Link
                  to="/login"
                  className="w-full text-center px-5 py-3.5 rounded-xl text-sm font-semibold text-white border border-white/20"
                >
                  Login to NetBanking
                </Link>
                <Link
                  to="/open-account"
                  className="w-full text-center px-5 py-3.5 rounded-xl text-sm font-semibold text-white"
                  style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)' }}
                >
                  Open Account
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function MegaColumn({ title, items }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.2em] uppercase mb-4" style={{ color: '#FF3333' }}>
        {title}
      </p>
      <ul className="space-y-3">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <li key={it.label}>
              <Link
                to={it.to}
                className="flex items-center gap-2.5 text-sm text-white/70 hover:text-white transition-colors group"
              >
                <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/[0.05] group-hover:bg-[#CC0000]/20 transition-colors">
                  <Icon size={14} style={{ color: '#FF3333' }} />
                </span>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MobileLink({ to, icon: Icon, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-4 py-4 text-lg font-semibold border-b border-white/[0.06] transition-colors ${
          isActive ? 'text-[#FF3333]' : 'text-white'
        }`
      }
    >
      <Icon size={20} style={{ color: '#CC0000' }} />
      {children}
    </NavLink>
  );
}
