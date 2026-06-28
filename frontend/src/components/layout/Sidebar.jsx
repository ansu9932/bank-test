import React, { useMemo, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  RiDashboardLine, RiExchangeLine, RiSendPlaneLine, RiGroupLine,
  RiFileTextLine, RiBarChartLine, RiUserLine, RiShieldLine,
  RiCustomerService2Line, RiLogoutBoxLine, RiBankLine,
  RiShieldCheckLine, RiFileShield2Line, RiSecurePaymentLine,
  RiBankCard2Line, RiLockLine,
} from 'react-icons/ri';
import { logout } from '../../store/slices/authSlice';
import { fetchAccount } from '../../store/slices/accountSlice';

// ─── Route definitions ────────────────────────────────────────────────────────
const ADMIN_NAV_ITEMS = [
  { to: '/admin',              icon: RiDashboardLine,        label: 'Dashboard',     end: true  },
  { to: '/admin/users',        icon: RiGroupLine,            label: 'Users & KYC',   end: false },
  { to: '/admin/transactions', icon: RiExchangeLine,         label: 'Transactions',  end: false },
  { to: '/admin/tickets',      icon: RiCustomerService2Line, label: 'Tickets',       end: false },
  { to: '/admin/audit',        icon: RiFileShield2Line,      label: 'Audit Logs',    end: false },
];

const CUSTOMER_NAV_ITEMS = [
  { to: '/dashboard',              icon: RiDashboardLine, label: 'Dashboard',      end: true  },
  { to: '/dashboard/transactions', icon: RiExchangeLine,  label: 'Transactions',   end: false },
  { to: '/dashboard/deposit',      icon: RiSecurePaymentLine, label: 'Add Money',  end: false },
  { to: '/dashboard/transfer',     icon: RiSendPlaneLine, label: 'Transfer Money', end: false },
  { to: '/dashboard/cards',        icon: RiBankCard2Line, label: 'Cards',          end: false },
  { to: '/dashboard/beneficiaries',icon: RiGroupLine,     label: 'Beneficiaries',  end: false },
  { to: '/dashboard/statement',    icon: RiFileTextLine,  label: 'Statement',      end: false },
  { to: '/dashboard/analytics',    icon: RiBarChartLine,  label: 'Analytics',      end: false },
];

const CUSTOMER_SETTINGS_ITEMS = [
  { to: '/dashboard/profile',  icon: RiUserLine,             label: 'Profile Settings', end: false },
  { to: '/dashboard/security', icon: RiShieldLine,           label: 'Security',         end: false },
  { to: '/dashboard/support',  icon: RiCustomerService2Line, label: 'Support',          end: false },
];


// ─── Helper: safe user (Redux → localStorage fallback) ───────────────────────
function useSafeUser(reduxUser) {
  return useMemo(() => {
    if (reduxUser && typeof reduxUser === 'object') return reduxUser;
    try {
      const stored = localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore malformed JSON
    }
    return {};
  }, [reduxUser]);
}

// ─── Single nav link ──────────────────────────────────────────────────────────
function SidebarNavItem({ to, icon: Icon, label, end, locked, currentPath, onNavigate }) {
  // Locked items render as a disabled, non-navigable row with a lock badge.
  if (locked) {
    return (
      <div
        className="nav-item opacity-50 cursor-not-allowed select-none"
        title="This feature is currently locked"
        aria-disabled="true"
      >
        <Icon className="text-lg flex-shrink-0" />
        <span className="text-sm whitespace-nowrap">{label}</span>
        <RiLockLine className="text-xs ml-auto flex-shrink-0" />
      </div>
    );
  }

  const isActive = end
    ? currentPath === to
    : currentPath === to || currentPath.startsWith(`${to}/`);

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={`nav-item${isActive ? ' active' : ''}`}
    >
      <Icon className="text-lg flex-shrink-0" />
      <span className="text-sm whitespace-nowrap">{label}</span>
    </NavLink>
  );
}


// ─── Presentational sidebar content ──────────────────────────────────────────
// Pure content (brand + nav + user/logout). All responsive POSITIONING is owned
// by DashboardLayout, which renders this inside both the desktop column and the
// mobile slide-out drawer. `onNavigate` lets the layout close the mobile drawer.
export default function Sidebar({ onNavigate = () => {} }) {
  const dispatch    = useDispatch();
  const navigate    = useNavigate();
  const currentPath = useLocation().pathname;

  const reduxUser = useSelector((state) => state.auth.user);
  const user      = useSafeUser(reduxUser);

  // Per-user feature flags live on the account (transfer_methods). "Add Money"
  // is admin-activated and locked by default, so the sidebar entry reflects it.
  const account = useSelector((state) => state.account?.account);
  const addMoneyEnabled = (() => {
    const tm = account?.transfer_methods;
    let parsed = tm;
    if (typeof tm === 'string') { try { parsed = JSON.parse(tm); } catch { parsed = null; } }
    return parsed?.add_money === true;
  })();

  const rawRole = typeof user.role === 'string' ? user.role.toLowerCase().trim() : '';
  const isAdmin = rawRole === 'admin';

  // Customers: make sure the account (with its feature flags) is loaded so the
  // "Add Money" lock state in the sidebar is accurate on every page.
  useEffect(() => {
    if (!isAdmin && !account) dispatch(fetchAccount());
  }, [isAdmin, account, dispatch]);

  const primaryNavItems   = isAdmin ? ADMIN_NAV_ITEMS : CUSTOMER_NAV_ITEMS;
  const secondaryNavItems = isAdmin ? []              : CUSTOMER_SETTINGS_ITEMS;

  const displayFirstName  = user.firstName || user.first_name || user.fullName?.split(' ')[0] || 'User';
  const displayLastName   = user.lastName  || user.last_name  || user.fullName?.split(' ')[1] || '';
  const displayCustomerId = user.customerId || user.customer_id || (isAdmin ? 'Administrator' : '');
  const avatarInitials    = `${displayFirstName[0] ?? ''}${displayLastName[0] ?? ''}`.toUpperCase() || 'U';

  const handleLogout = async () => {
    onNavigate();
    await dispatch(logout());
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('user');
    navigate(isAdmin ? '/admin/login' : '/login', { replace: true });
  };


  return (
    <div className="flex flex-col h-full w-full">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-white/[0.05] flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shadow-glow flex-shrink-0">
          {isAdmin
            ? <RiShieldCheckLine className="text-white text-lg" />
            : <RiBankLine className="text-white text-lg" />}
        </div>
        <div className="overflow-hidden">
          <p className="font-display font-700 text-white text-base leading-tight">Alister Bank</p>
          <p className="text-dark-300 text-xs">{isAdmin ? 'Admin Panel' : 'Digital Banking'}</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto overflow-x-hidden">
        <p className="text-dark-400 text-xs font-medium px-3 mb-2 uppercase tracking-widest select-none">
          {isAdmin ? 'Administration' : 'Banking'}
        </p>
        {primaryNavItems.map((item) => (
          <SidebarNavItem
            key={item.to}
            {...item}
            locked={item.to === '/dashboard/deposit' ? !addMoneyEnabled : item.locked}
            currentPath={currentPath}
            onNavigate={onNavigate}
          />
        ))}

        {secondaryNavItems.length > 0 && (
          <>
            <p className="text-dark-400 text-xs font-medium px-3 mb-2 mt-5 uppercase tracking-widest select-none">
              Settings
            </p>
            {secondaryNavItems.map((item) => (
              <SidebarNavItem key={item.to} {...item} currentPath={currentPath} onNavigate={onNavigate} />
            ))}
          </>
        )}
      </nav>


      {/* User identity + logout */}
      <div className="px-3 pb-4 pt-3 border-t border-white/[0.05] flex-shrink-0">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] mb-2">
          <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-brand-400 text-xs font-bold">{avatarInitials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-medium truncate leading-tight">
              {displayFirstName} {displayLastName}
            </p>
            <p className="text-dark-300 text-xs truncate">{displayCustomerId}</p>
          </div>
          {isAdmin && (
            <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
              ADMIN
            </span>
          )}
        </div>

        <button
          onClick={handleLogout}
          className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
        >
          <RiLogoutBoxLine className="text-lg flex-shrink-0" />
          <span className="text-sm">Logout</span>
        </button>
      </div>
    </div>
  );
}
