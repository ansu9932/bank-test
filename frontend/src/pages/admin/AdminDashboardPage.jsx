import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiGroupLine,
  RiExchangeLine,
  RiShieldCheckLine,
  RiAlertLine,
  RiTimeLine,
  RiRefreshLine,
  RiSearchLine,
  RiBellLine,
  RiCheckLine,
  RiBankLine,
  RiUserLine,
  RiBarChartLine,
  RiFileShield2Line,
  RiCustomerService2Line,
  RiArrowRightLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiShieldLine,
  RiFlagLine,
  RiBankCard2Line,
  RiFileList3Line,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiLoader4Line,
} from 'react-icons/ri';
import api from '../../services/api';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';


// ─── Safe date helpers (identical to DashboardPage — no shared module needed) ─
/**
 * Safely formats a raw date string from the database into a display string.
 * Guards against null, undefined, empty string, and non-parseable values.
 * Returns `fallback` instead of throwing a RangeError.
 *
 * @param {string|null|undefined} dateStr
 * @param {string} formatStr   - date-fns format pattern
 * @param {string} fallback    - returned when the date is invalid
 * @returns {string}
 */
function safeFormat(dateStr, formatStr, fallback = 'N/A') {
  if (dateStr === null || dateStr === undefined || dateStr === '') {
    return fallback;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return fallback;
  }
  try {
    return format(d, formatStr);
  } catch {
    return fallback;
  }
}

/**
 * Safely produces a relative-time string ("3 minutes ago") from a date string.
 * Falls back to `fallback` when the date is invalid.
 *
 * @param {string|null|undefined} dateStr
 * @param {string} fallback
 * @returns {string}
 */
function safeDistanceToNow(dateStr, fallback = 'Recently') {
  if (dateStr === null || dateStr === undefined || dateStr === '') {
    return fallback;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return fallback;
  }
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return fallback;
  }
}


// ─── SVG bar chart ────────────────────────────────────────────────────────────
/**
 * Lightweight pure-SVG grouped bar chart for monthly transaction volume.
 * Uses no external charting library to avoid any potential date-related
 * RangeErrors from recharts' internal date processing.
 *
 * @param {{ points: Array<{month:string, credit:number, debit:number}> }} props
 */
function MonthlyBarChart({ points }) {
  const SVG_W    = 600;
  const SVG_H    = 180;
  const PAD_L    = 52;
  const PAD_R    = 12;
  const PAD_T    = 12;
  const PAD_B    = 32;
  const plotW    = SVG_W - PAD_L - PAD_R;
  const plotH    = SVG_H - PAD_T - PAD_B;

  if (!points || points.length === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-dark-400 text-sm">
        No transaction data available yet
      </div>
    );
  }

  const allValues = points.flatMap((p) => [p.credit || 0, p.debit || 0]);
  const maxVal    = Math.max(...allValues, 1);

  const groupWidth = plotW / points.length;
  const barWidth   = Math.max(8, Math.floor(groupWidth * 0.32));
  const gap        = Math.max(2, Math.floor(groupWidth * 0.06));

  // Y-axis ticks — 4 evenly spaced from 0 to maxVal
  const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((f) => ({
    value : f * maxVal,
    y     : PAD_T + plotH * (1 - f),
    label : maxVal * f >= 100000
      ? `$${((maxVal * f) / 100000).toFixed(1)}L`
      : maxVal * f >= 1000
        ? `$${((maxVal * f) / 1000).toFixed(0)}k`
        : `$${(maxVal * f).toFixed(0)}`,
  }));

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      className="w-full"
      style={{ height: SVG_H }}
      aria-label="Monthly transaction volume chart"
    >
      {/* Horizontal guide lines */}
      {yTicks.map((tick) => (
        <g key={tick.value}>
          <line
            x1={PAD_L}
            y1={tick.y}
            x2={SVG_W - PAD_R}
            y2={tick.y}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
          <text
            x={PAD_L - 6}
            y={tick.y + 3}
            textAnchor="end"
            fontSize="9"
            fill="#555"
          >
            {tick.label}
          </text>
        </g>
      ))}

      {/* Bars */}
      {points.map((point, i) => {
        const groupX      = PAD_L + i * groupWidth + groupWidth / 2;
        const creditBarH  = ((point.credit || 0) / maxVal) * plotH;
        const debitBarH   = ((point.debit  || 0) / maxVal) * plotH;
        const creditX     = groupX - barWidth - gap / 2;
        const debitX      = groupX + gap / 2;
        const baseY       = PAD_T + plotH;

        return (
          <g key={point.month || i}>
            {/* Credit bar (green) */}
            <rect
              x={creditX}
              y={baseY - creditBarH}
              width={barWidth}
              height={Math.max(2, creditBarH)}
              fill="#22c55e"
              opacity="0.85"
              rx="3"
              ry="3"
            />

            {/* Debit bar (red) */}
            <rect
              x={debitX}
              y={baseY - debitBarH}
              width={barWidth}
              height={Math.max(2, debitBarH)}
              fill="#ef4444"
              opacity="0.75"
              rx="3"
              ry="3"
            />

            {/* X-axis month label */}
            <text
              x={groupX}
              y={baseY + 16}
              textAnchor="middle"
              fontSize="9"
              fill="#555"
            >
              {point.month || ''}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${SVG_W - PAD_R - 120}, ${PAD_T})`}>
        <rect x="0" y="0" width="10" height="10" rx="2" fill="#22c55e" opacity="0.85" />
        <text x="14" y="9" fontSize="9" fill="#888">Credits</text>
        <rect x="56" y="0" width="10" height="10" rx="2" fill="#ef4444" opacity="0.75" />
        <text x="70" y="9" fontSize="9" fill="#888">Debits</text>
      </g>
    </svg>
  );
}


// ─── Notification icon map ────────────────────────────────────────────────────
const NOTIF_ICON = {
  transaction : '💸',
  security    : '🔒',
  kyc         : '✅',
  system      : '🔔',
  alert       : '⚠️',
  offer       : '🎁',
};

// ─── KYC status → badge class map ────────────────────────────────────────────
const KYC_BADGE = {
  pending           : 'badge-warning',
  under_review      : 'badge-info',
  video_kyc_pending : 'badge-brand',
  approved          : 'badge-success',
  rejected          : 'badge-danger',
};

// ─── Transaction type → badge class map ──────────────────────────────────────
const TX_TYPE_BADGE = {
  credit : 'badge-success',
  debit  : 'badge-danger',
};

// ─── Transfer mode → badge class map ─────────────────────────────────────────
const TX_MODE_BADGE = {
  NEFT     : 'badge-info',
  RTGS     : 'badge-brand',
  IMPS     : 'badge-warning',
  INTERNAL : 'badge-success',
  SALARY   : 'badge-success',
  INTEREST : 'badge-info',
  SYSTEM   : 'badge-info',
  CHARGE   : 'badge-danger',
};


// ─── Admin sticky top navigation bar ─────────────────────────────────────────
/**
 * Sticky glass-effect header bar for the admin dashboard.
 * Mirrors the customer DashboardTopBar layout:
 *   Left  — page title + search input
 *   Right — notification bell (read-only list) + admin avatar badge + username
 *
 * Notifications here are fetched directly from the admin API so they are
 * admin-scoped system alerts rather than user-scoped transaction alerts.
 * We pass them in as props to keep this component pure and testable.
 */
function AdminTopBar({ adminInfo, onRefresh, refreshing }) {
  const navigate              = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const notifRef              = useRef(null);

  // Placeholder system notifications for the admin panel bell.
  // In a full implementation these would come from a dedicated admin
  // notifications endpoint.  We keep an empty array as the safe default.
  const systemNotifications = [];

  // Close dropdown on outside click
  useEffect(() => {
    function handleOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const displayName    = adminInfo?.fullName || adminInfo?.full_name || adminInfo?.username || 'Admin';
  const displayRole    = (adminInfo?.role || 'admin').toUpperCase();
  const initials       = displayName
    .split(' ')
    .map((w) => w[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'AD';

  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-between py-3 mb-6"
      style={{
        background       : 'linear-gradient(135deg, rgba(30,30,46,0.88) 0%, rgba(17,17,24,0.92) 100%)',
        backdropFilter   : 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom     : '1px solid rgba(255,255,255,0.05)',
        borderRadius     : '0 0 16px 16px',
        marginLeft       : '-4px',
        marginRight      : '-4px',
        paddingLeft      : '8px',
        paddingRight     : '8px',
      }}
    >
      {/* Left — title + search */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
            <RiShieldLine className="text-brand-400 text-sm" />
          </div>
          <div>
            <h1
              className="font-display font-700 text-white text-base sm:text-lg leading-tight truncate"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Admin Dashboard
            </h1>
            <p className="hidden sm:block text-dark-300 text-xs">
              {safeFormat(new Date().toISOString(), 'EEEE, dd MMMM yyyy', 'Today')}
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 bg-dark-700/80 rounded-xl px-3 py-2 border border-white/[0.06] flex-1 max-w-xs">
          <RiSearchLine className="text-dark-300 text-base flex-shrink-0" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search users, transactions…"
            className="bg-transparent text-sm text-white placeholder-dark-400 outline-none w-full"
          />
        </div>
      </div>

      {/* Right — bell + refresh + admin badge */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Refresh button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="p-2.5 rounded-xl hover:bg-white/[0.05] text-dark-200 hover:text-white transition-colors disabled:opacity-40"
          aria-label="Refresh dashboard data"
        >
          <RiRefreshLine className={`text-xl ${refreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Notification bell — shows system notifications */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            className="relative p-2.5 rounded-xl hover:bg-white/[0.05] text-dark-200 hover:text-white transition-colors"
            aria-label="System notifications"
          >
            <RiBellLine className="text-xl" />
            {systemNotifications.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                {systemNotifications.length}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                key="admin-notif-dropdown"
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-72 glass-card overflow-hidden z-50 shadow-glass"
              >
                <div className="px-4 py-3 border-b border-white/[0.05]">
                  <p className="font-semibold text-sm text-white">System Alerts</p>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {systemNotifications.length === 0 ? (
                    <div className="text-center py-8">
                      <RiShieldCheckLine className="text-dark-400 text-3xl mx-auto mb-2" />
                      <p className="text-dark-300 text-sm">All systems operational</p>
                    </div>
                  ) : (
                    systemNotifications.map((n, idx) => (
                      <div
                        key={n.id || idx}
                        className="px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02]"
                      >
                        <p className="text-white text-xs font-medium">{n.title}</p>
                        <p className="text-dark-300 text-xs mt-0.5">{n.message}</p>
                        <p className="text-dark-400 text-[10px] mt-1">
                          {safeDistanceToNow(n.created_at, 'Recently')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Admin avatar + name */}
        <button
          type="button"
          onClick={() => navigate('/admin/users')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-brand-400 text-xs font-bold">{initials}</span>
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-white text-sm font-medium leading-tight">
              {displayName}
            </p>
            <p className="text-brand-400 text-[10px] mt-0.5">{displayRole}</p>
          </div>
        </button>
      </div>
    </div>
  );
}


// ─── Stat card ────────────────────────────────────────────────────────────────
/**
 * Single metric card used in the 4×2 KPI grid at the top of the admin page.
 */
function StatCard({ label, value, icon: Icon, iconColor, iconBg, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.055, duration: 0.3 }}
      className="glass-card p-5 relative overflow-hidden"
    >
      {/* Subtle decorative glow */}
      <div
        className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-20 pointer-events-none"
        style={{ background: iconBg.replace('bg-', '') }}
      />

      <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
        <Icon className={`${iconColor} text-lg`} />
      </div>

      <p
        className="text-white font-700 text-2xl leading-tight"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {value !== null && value !== undefined ? value : '—'}
      </p>

      <p className="text-dark-400 text-xs mt-1.5 leading-tight">{label}</p>
    </motion.div>
  );
}


// ─── Recent-users table row ───────────────────────────────────────────────────
/**
 * Single row in the "Recent Registrations" user table.
 * All dates use safeFormat to prevent RangeErrors.
 */
function UserRow({ user, index, onView }) {
  const fullName     = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown';
  const kycBadge     = KYC_BADGE[user.kyc_status] || 'badge-warning';
  const joinedDate   = safeFormat(user.created_at, 'dd MMM yyyy', 'N/A');
  const initials     = (
    (user.first_name?.[0] || '') + (user.last_name?.[0] || '')
  ).toUpperCase() || 'U';

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.22 }}
      className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors px-1 rounded-lg"
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-brand-500/15 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
        <span className="text-brand-400 text-xs font-bold">{initials}</span>
      </div>

      {/* Name + email */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate leading-tight">{fullName}</p>
        <p className="text-dark-400 text-xs truncate mt-0.5">{user.email || '—'}</p>
      </div>

      {/* Customer ID */}
      <div className="hidden sm:block flex-shrink-0 w-28">
        <p className="text-dark-300 text-xs font-mono">{user.customer_id || '—'}</p>
      </div>

      {/* KYC status badge */}
      <div className="flex-shrink-0">
        <span className={`badge ${kycBadge} text-[10px]`}>
          {(user.kyc_status || 'pending').replace(/_/g, ' ')}
        </span>
      </div>

      {/* Joined date */}
      <div className="hidden md:block flex-shrink-0 w-24 text-right">
        <p className="text-dark-300 text-xs">{joinedDate}</p>
      </div>

      {/* View button */}
      <button
        type="button"
        onClick={() => onView(user.id)}
        className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors flex-shrink-0"
        aria-label={`View ${fullName}`}
      >
        <RiArrowRightLine className="text-sm" />
      </button>
    </motion.div>
  );
}


// ─── Recent-transactions table row ───────────────────────────────────────────
/**
 * Single row in the "Recent Transactions" ledger section.
 * All dates use safeFormat.  Amount parsing is guarded against NaN.
 */
function AdminTxRow({ tx, index }) {
  const isCredit    = tx.transaction_type === 'credit';
  const amount      = parseFloat(tx.amount) || 0;
  const typeBadge   = TX_TYPE_BADGE[tx.transaction_type] || 'badge-info';
  const modeBadge   = TX_MODE_BADGE[tx.transfer_mode]    || 'badge-info';
  const txDate      = safeFormat(tx.created_at, 'dd MMM, HH:mm', 'N/A');

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.22 }}
      className={`flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors px-1 rounded-lg ${
        tx.is_flagged ? 'bg-red-500/5 border-l-2 border-l-red-500/30' : ''
      }`}
    >
      {/* Type icon */}
      <div
        className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0 ${
          isCredit ? 'bg-green-500/10' : 'bg-red-500/10'
        }`}
      >
        {isCredit
          ? <RiArrowDownLine className="text-green-400 text-sm" />
          : <RiArrowUpLine   className="text-red-400   text-sm" />
        }
      </div>

      {/* Reference + description */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-medium font-mono truncate leading-tight">
          {tx.reference_number || '—'}
        </p>
        <p className="text-dark-400 text-xs mt-0.5 truncate">
          {tx.description || tx.to_account_name || tx.from_account_name || 'Transaction'}
        </p>
      </div>

      {/* Mode badge */}
      <div className="hidden sm:block flex-shrink-0">
        <span className={`badge ${modeBadge} text-[10px]`}>
          {tx.transfer_mode || 'TXN'}
        </span>
      </div>

      {/* Flag indicator */}
      {tx.is_flagged && (
        <div
          className="flex-shrink-0"
          title={tx.flag_reason || 'Flagged'}
        >
          <RiFlagLine className="text-red-400 text-sm" />
        </div>
      )}

      {/* Date */}
      <div className="hidden md:block flex-shrink-0 w-28 text-right">
        <p className="text-dark-300 text-xs">{txDate}</p>
      </div>

      {/* Amount */}
      <div className="flex-shrink-0 text-right">
        <p className={`text-sm font-bold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
          {isCredit ? '+' : '-'}${amount.toLocaleString('en-US')}
        </p>
      </div>
    </motion.div>
  );
}


// ─── Data fetching hooks ──────────────────────────────────────────────────────
/**
 * Custom hook that fetches all data the admin dashboard needs:
 *   • /admin/dashboard  — KPI stats + monthly chart data
 *   • /admin/users      — recent user registrations (page 1, limit 8)
 *   • /admin/transactions — recent transactions (page 1, limit 10)
 *
 * The api.js interceptor now attaches the adminToken automatically via
 * the dual-token request interceptor, so we do NOT manually inject
 * Authorization headers here.
 *
 * Returns { stats, recentUsers, recentTxns, loading, error, refresh }
 */
function useAdminDashboardData() {
  const [stats,      setStats]      = useState(null);
  const [recentUsers, setRecentUsers] = useState([]);
  const [recentTxns,  setRecentTxns]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Run all three requests in parallel for speed
      const [statsRes, usersRes, txnsRes] = await Promise.allSettled([
        api.get('/admin/dashboard'),
        api.get('/admin/users', { params: { page: 1, limit: 8 } }),
        api.get('/admin/transactions', { params: { page: 1, limit: 10 } }),
      ]);

      // Stats
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data?.data ?? null);
      } else {
        console.error('[AdminDashboardPage] /admin/dashboard error:', statsRes.reason);
        setError('Failed to load dashboard statistics.');
      }

      // Recent users
      if (usersRes.status === 'fulfilled') {
        setRecentUsers(usersRes.value.data?.data?.users ?? []);
      }

      // Recent transactions
      if (txnsRes.status === 'fulfilled') {
        setRecentTxns(txnsRes.value.data?.data?.transactions ?? []);
      }

    } catch (err) {
      console.error('[AdminDashboardPage] unexpected fetch error:', err);
      setError('An unexpected error occurred while loading the dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { stats, recentUsers, recentTxns, loading, error, refresh: fetchAll };
}


// ─── Service Requests management panel (Feature 4) ────────────────────────────
/**
 * Admin panel for Debit Card / Cheque Book service requests.
 * Lists requests from GET /admin/service-requests and lets an admin
 * process / approve / decline via PATCH /admin/service-requests/:id.
 * Fully responsive: a desktop table (sm+) collapses to stacked cards on mobile.
 */
const REQ_STATUS_BADGE = {
  pending    : 'badge-warning',
  processing : 'badge-info',
  active     : 'badge-success',
  dispatched : 'badge-success',
  delivered  : 'badge-success',
  cancelled  : 'badge-danger',
};
const REQ_TYPE_LABEL = { debit_card: 'Debit Card', cheque_book: 'Cheque Book' };

function ServiceRequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [actingId, setActingId] = useState(null);

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const { data } = await api.get('/admin/service-requests', { params });
      setRequests(data?.data?.requests ?? []);
    } catch (err) {
      console.error('[ServiceRequestsPanel] fetch error:', err);
      toast.error(err?.response?.data?.message || 'Failed to load service requests.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const act = async (id, action) => {
    setActingId(id);
    try {
      const { data } = await api.patch(`/admin/service-requests/${id}`, { action });
      toast.success(data?.message || `Request ${action}d.`);
      await fetchRequests();
    } catch (err) {
      toast.error(err?.response?.data?.message || `Could not ${action} the request.`);
    } finally {
      setActingId(null);
    }
  };

  const userName = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : '—');
  const isActive = (s) => s === 'pending' || s === 'processing';

  const FILTERS = [
    { key: 'pending', label: 'Pending' },
    { key: 'processing', label: 'Processing' },
    { key: 'active', label: 'Issued' },
    { key: 'dispatched', label: 'Approved' },
    { key: 'cancelled', label: 'Declined' },
    { key: '', label: 'All' },
  ];

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 sm:px-5 py-4 border-b border-white/[0.05]">
        <div className="flex items-center gap-2">
          <RiBankCard2Line className="text-brand-400 text-lg" />
          <p className="text-white font-semibold text-sm">Service Requests</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key || 'all'}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  statusFilter === f.key
                    ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                    : 'bg-white/[0.03] text-dark-300 border border-white/[0.06] hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={fetchRequests}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-white/[0.05] text-dark-200 hover:text-white transition-colors disabled:opacity-40"
            aria-label="Refresh service requests"
          >
            <RiRefreshLine className={`text-base ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Desktop column headers */}
      <div className="hidden md:grid grid-cols-12 gap-2 px-5 py-2 border-b border-white/[0.04] text-dark-400 text-xs uppercase tracking-wide">
        <div className="col-span-3">Customer</div>
        <div className="col-span-2">Type</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">Requested</div>
        <div className="col-span-3 text-right">Actions</div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-10">
          <RiFileList3Line className="text-dark-400 text-4xl mx-auto mb-2" />
          <p className="text-dark-400 text-sm">No {statusFilter || ''} service requests.</p>
        </div>
      ) : (
        <div className="px-3 sm:px-5">
          {requests.map((r) => {
            const acting = actingId === r.id;
            return (
              <div
                key={r.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-2 md:items-center py-3 border-b border-white/[0.04] last:border-0"
              >
                {/* Customer */}
                <div className="md:col-span-3 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{userName(r.user)}</p>
                  <p className="text-dark-400 text-xs truncate">{r.user?.email || '—'}</p>
                </div>
                {/* Type */}
                <div className="md:col-span-2">
                  <span className="text-dark-200 text-xs">{REQ_TYPE_LABEL[r.request_type] || r.request_type}</span>
                </div>
                {/* Status */}
                <div className="md:col-span-2">
                  <span className={`badge ${REQ_STATUS_BADGE[r.status] || 'badge-info'} text-[10px]`}>
                    {r.status}
                  </span>
                </div>
                {/* Requested */}
                <div className="md:col-span-2">
                  <p className="text-dark-300 text-xs">{safeFormat(r.createdAt || r.created_at, 'dd MMM yyyy', 'N/A')}</p>
                </div>
                {/* Actions */}
                <div className="md:col-span-3 flex items-center gap-2 md:justify-end flex-wrap">
                  {isActive(r.status) ? (
                    <>
                      <button
                        type="button"
                        onClick={() => act(r.id, 'approve')}
                        disabled={acting}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500/15 text-green-300 hover:bg-green-500/25 text-xs font-medium transition-colors disabled:opacity-40"
                      >
                        {acting ? <RiLoader4Line className="animate-spin" /> : <RiCheckboxCircleLine />} Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => act(r.id, 'decline')}
                        disabled={acting}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 text-xs font-medium transition-colors disabled:opacity-40"
                      >
                        {acting ? <RiLoader4Line className="animate-spin" /> : <RiCloseCircleLine />} Decline
                      </button>
                    </>
                  ) : (
                    <span className="text-dark-400 text-xs">No action needed</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Main page component ──────────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const navigate = useNavigate();

  // ── Data ─────────────────────────────────────────────────────────────────
  const { stats, recentUsers, recentTxns, loading, error, refresh } =
    useAdminDashboardData();

  // ── Admin info from localStorage (set during admin login) ────────────────
  const adminInfo = useMemo(() => {
    try {
      const stored = localStorage.getItem('adminInfo') || localStorage.getItem('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore JSON parse errors
    }
    return { fullName: 'Administrator', role: 'admin' };
  }, []);

  // ── Build monthly chart data from stats.monthlyData ───────────────────────
  // The server returns rows like { month: '2024-11', transaction_type: 'credit', total: '150000' }
  // We need to pivot them into { month: 'Nov 24', credit: 150000, debit: 80000 }.
  const chartPoints = useMemo(() => {
    if (!stats?.monthlyData || !Array.isArray(stats.monthlyData)) return [];

    const pivot = {};
    stats.monthlyData.forEach((row) => {
      // row.month may look like '2024-11' — safely parse it
      let label = row.month || '';
      if (label.match(/^\d{4}-\d{2}$/)) {
        // Convert '2024-11' → 'Nov 24'
        const dateObj = new Date(label + '-01');
        if (!isNaN(dateObj.getTime())) {
          try {
            label = format(dateObj, 'MMM yy');
          } catch {
            label = row.month;
          }
        }
      }

      if (!pivot[label]) {
        pivot[label] = { month: label, credit: 0, debit: 0 };
      }

      const total = parseFloat(row.total) || 0;
      if (row.transaction_type === 'credit') {
        pivot[label].credit += total;
      } else if (row.transaction_type === 'debit') {
        pivot[label].debit += total;
      }
    });

    // Return the most-recent 6 months in chronological order
    return Object.values(pivot).slice(-6);
  }, [stats]);

  // ── KPI cards definition ──────────────────────────────────────────────────
  const kpiCards = useMemo(() => {
    if (!stats) return [];
    return [
      {
        label   : 'Total Users',
        value   : stats.totalUsers ?? 0,
        icon    : RiGroupLine,
        iconColor : 'text-blue-400',
        iconBg  : 'bg-blue-500/10',
      },
      {
        label   : 'Pending KYC',
        value   : stats.pendingKYC ?? 0,
        icon    : RiTimeLine,
        iconColor : 'text-yellow-400',
        iconBg  : 'bg-yellow-500/10',
      },
      {
        label   : 'Active Accounts',
        value   : stats.activeAccounts ?? 0,
        icon    : RiShieldCheckLine,
        iconColor : 'text-green-400',
        iconBg  : 'bg-green-500/10',
      },
      {
        label   : 'Frozen Accounts',
        value   : stats.frozenAccounts ?? 0,
        icon    : RiAlertLine,
        iconColor : 'text-red-400',
        iconBg  : 'bg-red-500/10',
      },
      {
        label   : "Today's Transactions",
        value   : stats.todayTransactions ?? 0,
        icon    : RiExchangeLine,
        iconColor : 'text-purple-400',
        iconBg  : 'bg-purple-500/10',
      },
      {
        label   : 'Flagged Transactions',
        value   : stats.flaggedTransactions ?? 0,
        icon    : RiFlagLine,
        iconColor : 'text-orange-400',
        iconBg  : 'bg-orange-500/10',
      },
      {
        label   : 'Open Tickets',
        value   : stats.pendingTickets ?? 0,
        icon    : RiCustomerService2Line,
        iconColor : 'text-brand-400',
        iconBg  : 'bg-brand-500/10',
      },
      {
        label   : 'Total Volume',
        value   : (() => {
          const vol = parseFloat(stats.totalVolume || 0);
          if (vol >= 10000000) return `$${(vol / 10000000).toFixed(2)}Cr`;
          if (vol >= 100000)   return `$${(vol / 100000).toFixed(1)}L`;
          if (vol >= 1000)     return `$${(vol / 1000).toFixed(0)}k`;
          return `$${vol.toFixed(0)}`;
        })(),
        icon    : RiBarChartLine,
        iconColor : 'text-emerald-400',
        iconBg  : 'bg-emerald-500/10',
      },
    ];
  }, [stats]);

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0">

      {/* ── Sticky glass admin top bar ──────────────────────────────────── */}
      <AdminTopBar
        adminInfo={adminInfo}
        onRefresh={refresh}
        refreshing={loading}
      />

      {/* ── Page body ───────────────────────────────────────────────────── */}
      <div className="space-y-6 pb-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
            <RiAlertLine className="text-red-400 text-lg flex-shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={refresh}
              className="ml-auto text-xs text-red-400 hover:text-red-300 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── KPI stat cards 4×2 grid ─────────────────────────────────── */}
        {loading && !stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass-card p-5 h-28 skeleton" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {kpiCards.map((card, index) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                icon={card.icon}
                iconColor={card.iconColor}
                iconBg={card.iconBg}
                index={index}
              />
            ))}
          </div>
        )}

        {/* ── Monthly volume chart ─────────────────────────────────────── */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <RiBarChartLine className="text-brand-400 text-lg" />
              <p className="text-white font-semibold text-sm">
                Monthly Transaction Volume
              </p>
            </div>
            <span className="text-dark-400 text-xs">Last 6 months</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-44">
              <div className="spinner" style={{ width: 32, height: 32, borderWidth: 3 }} />
            </div>
          ) : (
            <MonthlyBarChart points={chartPoints} />
          )}
        </div>

        {/* ── Two-column lower grid ────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* Recent user registrations */}
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-2">
                <RiUserLine className="text-brand-400 text-lg" />
                <p className="text-white font-semibold text-sm">
                  Recent Registrations
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/admin/users')}
                className="text-brand-400 hover:text-brand-300 text-xs flex items-center gap-1 transition-colors"
              >
                View all <RiArrowRightLine />
              </button>
            </div>

            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2 border-b border-white/[0.04] text-dark-400 text-xs uppercase tracking-wide">
              <div className="col-span-4">Customer</div>
              <div className="col-span-3">ID</div>
              <div className="col-span-3">KYC</div>
              <div className="col-span-2 text-right">Joined</div>
            </div>

            {/* Rows */}
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              </div>
            ) : recentUsers.length === 0 ? (
              <div className="text-center py-10">
                <RiGroupLine className="text-dark-400 text-4xl mx-auto mb-2" />
                <p className="text-dark-400 text-sm">No users registered yet</p>
              </div>
            ) : (
              <div className="px-5">
                {recentUsers.map((u, idx) => (
                  <UserRow
                    key={u.id || idx}
                    user={u}
                    index={idx}
                    onView={(id) => navigate(`/admin/users/${id}`)}
                  />
                ))}
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3 border-t border-white/[0.04]">
              <button
                type="button"
                onClick={() => navigate('/admin/users?kycStatus=under_review')}
                className="text-yellow-400 hover:text-yellow-300 text-xs flex items-center gap-1 transition-colors"
              >
                <RiTimeLine />
                Review pending KYC applications
                <RiArrowRightLine />
              </button>
            </div>
          </div>

          {/* Recent transactions */}
          <div className="glass-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-2">
                <RiExchangeLine className="text-brand-400 text-lg" />
                <p className="text-white font-semibold text-sm">
                  Recent Transactions
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/admin/transactions')}
                className="text-brand-400 hover:text-brand-300 text-xs flex items-center gap-1 transition-colors"
              >
                View all <RiArrowRightLine />
              </button>
            </div>

            {/* Column headers */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-5 py-2 border-b border-white/[0.04] text-dark-400 text-xs uppercase tracking-wide">
              <div className="col-span-1" />
              <div className="col-span-4">Reference</div>
              <div className="col-span-2">Mode</div>
              <div className="col-span-3">Date</div>
              <div className="col-span-2 text-right">Amount</div>
            </div>

            {/* Rows */}
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
              </div>
            ) : recentTxns.length === 0 ? (
              <div className="text-center py-10">
                <RiExchangeLine className="text-dark-400 text-4xl mx-auto mb-2" />
                <p className="text-dark-400 text-sm">No transactions yet</p>
              </div>
            ) : (
              <div className="px-5">
                {recentTxns.map((tx, idx) => (
                  <AdminTxRow key={tx.id || idx} tx={tx} index={idx} />
                ))}
              </div>
            )}

            {/* Footer — link to flagged view */}
            <div className="px-5 py-3 border-t border-white/[0.04]">
              <button
                type="button"
                onClick={() => navigate('/admin/transactions?flagged=true')}
                className="text-orange-400 hover:text-orange-300 text-xs flex items-center gap-1 transition-colors"
              >
                <RiFlagLine />
                View flagged transactions
                <RiArrowRightLine />
              </button>
            </div>
          </div>
        </div>

        {/* ── Service Requests management (Debit Card / Cheque Book) ────── */}
        <ServiceRequestsPanel />

        {/* ── Quick-access action grid ─────────────────────────────────── */}
        <div className="glass-card p-5">
          <p className="text-white font-semibold text-sm mb-4">Quick Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              {
                label   : 'Manage Users',
                icon    : RiGroupLine,
                color   : 'bg-blue-500',
                onClick : () => navigate('/admin/users'),
              },
              {
                label   : 'Transactions',
                icon    : RiExchangeLine,
                color   : 'bg-purple-500',
                onClick : () => navigate('/admin/transactions'),
              },
              {
                label   : 'Support Tickets',
                icon    : RiCustomerService2Line,
                color   : 'bg-brand-500',
                onClick : () => navigate('/admin/tickets'),
              },
              {
                label   : 'Audit Logs',
                icon    : RiFileShield2Line,
                color   : 'bg-emerald-500',
                onClick : () => navigate('/admin/audit'),
              },
              {
                label   : 'Pending KYC',
                icon    : RiTimeLine,
                color   : 'bg-yellow-600',
                onClick : () => navigate('/admin/users?kycStatus=under_review'),
              },
            ].map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={action.onClick}
                className="glass-card-hover p-4 flex flex-col items-center gap-2.5 text-center w-full"
              >
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center ${action.color}`}
                >
                  <action.icon className="text-xl text-white" />
                </div>
                <p className="text-dark-200 text-xs font-medium leading-tight">
                  {action.label}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* ── System status footer ─────────────────────────────────────── */}
        <div className="glass-card p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
              <RiShieldCheckLine className="text-green-400 text-sm" />
            </div>
            <p className="text-white text-sm font-semibold">System Status</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'API Server',    status: 'Operational', color: 'text-green-400' },
              { label: 'Database',      status: 'Operational', color: 'text-green-400' },
              { label: 'Email Service', status: 'Operational', color: 'text-green-400' },
              { label: 'KYC Workflow',  status: 'Running',     color: 'text-green-400' },
            ].map(({ label, status, color }) => (
              <div key={label} className="bg-dark-700/40 rounded-xl p-3">
                <p className="text-dark-400 text-[10px] uppercase tracking-wide mb-1">{label}</p>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                  <p className={`text-xs font-medium ${color}`}>{status}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
