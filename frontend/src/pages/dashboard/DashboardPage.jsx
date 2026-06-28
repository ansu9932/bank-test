import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import {
  RiSendPlaneLine,
  RiFileTextLine,
  RiGroupLine,
  RiArrowUpLine,
  RiArrowDownLine,
  RiExchangeLine,
  RiArrowRightLine,
  RiEyeLine,
  RiEyeOffLine,
  RiWifiLine,
  RiSearchLine,
  RiBellLine,
  RiCheckLine,
  RiRefreshLine,
  RiBankLine,
  RiBarChartLine,
  RiShieldCheckLine,
} from 'react-icons/ri';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { fetchAccount } from '../../store/slices/accountSlice';
import { fetchNotifications, markAllRead } from '../../store/slices/notificationSlice';
import { format, formatDistanceToNow, isValid } from 'date-fns';


// ─── Safe date helper ─────────────────────────────────────────────────────────
/**
 * Safely formats any date string coming from the database.
 *
 * The root cause of every RangeError blank-screen crash is passing an empty
 * string, null, undefined, or a non-ISO-8601 value directly to date-fns
 * format() or formatDistanceToNow().  Both functions throw a RangeError
 * ("Invalid time value") when they receive an invalid Date object, and because
 * this happens inside the render cycle React cannot recover — the whole page
 * goes blank.
 *
 * This helper ALWAYS returns a plain string, never throws.
 *
 * @param {string|null|undefined} dateStr  - Raw timestamp from the API
 * @param {string} formatStr              - date-fns format pattern
 * @param {string} fallback               - String to return when date is invalid
 * @returns {string}
 */
function safeFormat(dateStr, formatStr, fallback = 'Recent') {
  if (dateStr === null || dateStr === undefined || dateStr === '') {
    return fallback;
  }
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) {
    return fallback;
  }
  try {
    return format(dateObj, formatStr);
  } catch {
    return fallback;
  }
}

/**
 * Safely produces a relative time string ("2 hours ago") from a date string.
 * Falls back to a static string when the date is invalid.
 *
 * @param {string|null|undefined} dateStr
 * @param {string} fallback
 * @returns {string}
 */
function safeDistanceToNow(dateStr, fallback = 'Recently') {
  if (dateStr === null || dateStr === undefined || dateStr === '') {
    return fallback;
  }
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) {
    return fallback;
  }
  try {
    return formatDistanceToNow(dateObj, { addSuffix: true });
  } catch {
    return fallback;
  }
}


// ─── SVG inline activity graph ────────────────────────────────────────────────
/**
 * Renders a lightweight SVG polyline chart from an array of {credit, debit}
 * data points.  No external charting library dependency — pure SVG so it
 * cannot throw date-related RangeErrors.
 *
 * @param {{ points: Array<{credit:number,debit:number,label:string}> }} props
 */
function ActivitySVGChart({ points }) {
  const WIDTH  = 600;
  const HEIGHT = 140;
  const PADDING_X = 8;
  const PADDING_Y = 12;

  if (!points || points.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-slate-400 text-sm">
        No activity data available
      </div>
    );
  }

  const allValues = points.flatMap((p) => [p.credit, p.debit]);
  const maxVal    = Math.max(...allValues, 1);
  const minVal    = 0;
  const range     = maxVal - minVal || 1;

  const plotWidth  = WIDTH  - PADDING_X * 2;
  const plotHeight = HEIGHT - PADDING_Y * 2;

  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;

  // Map a value to SVG Y coordinate (SVG y-axis is inverted)
  const toY = (val) => PADDING_Y + plotHeight - ((val - minVal) / range) * plotHeight;
  const toX = (idx) => PADDING_X + idx * stepX;

  // Build polyline point strings
  const creditPoints = points
    .map((p, i) => `${toX(i)},${toY(p.credit)}`)
    .join(' ');

  const debitPoints = points
    .map((p, i) => `${toX(i)},${toY(p.debit)}`)
    .join(' ');

  // Build filled area polygon for credit
  const creditAreaPoints =
    `${toX(0)},${HEIGHT} ` +
    points.map((p, i) => `${toX(i)},${toY(p.credit)}`).join(' ') +
    ` ${toX(points.length - 1)},${HEIGHT}`;

  // Build filled area polygon for debit
  const debitAreaPoints =
    `${toX(0)},${HEIGHT} ` +
    points.map((p, i) => `${toX(i)},${toY(p.debit)}`).join(' ') +
    ` ${toX(points.length - 1)},${HEIGHT}`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      style={{ height: HEIGHT }}
      aria-label="Activity chart"
    >
      <defs>
        <linearGradient id="gradCredit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#22c55e" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="gradDebit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ef4444" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* Horizontal guide lines */}
      {[0.25, 0.5, 0.75, 1].map((fraction) => {
        const y = PADDING_Y + plotHeight * (1 - fraction);
        return (
          <line
            key={fraction}
            x1={PADDING_X}
            y1={y}
            x2={WIDTH - PADDING_X}
            y2={y}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
          />
        );
      })}

      {/* Credit filled area */}
      <polygon points={creditAreaPoints} fill="url(#gradCredit)" />

      {/* Debit filled area */}
      <polygon points={debitAreaPoints} fill="url(#gradDebit)" />

      {/* Credit line */}
      <polyline
        points={creditPoints}
        fill="none"
        stroke="#22c55e"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Debit line */}
      <polyline
        points={debitPoints}
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots on credit line */}
      {points.map((p, i) => (
        <circle
          key={`c-${i}`}
          cx={toX(i)}
          cy={toY(p.credit)}
          r="3"
          fill="#22c55e"
          opacity="0.9"
        />
      ))}

      {/* Dots on debit line */}
      {points.map((p, i) => (
        <circle
          key={`d-${i}`}
          cx={toX(i)}
          cy={toY(p.debit)}
          r="3"
          fill="#ef4444"
          opacity="0.9"
        />
      ))}

      {/* X-axis labels */}
      {points.map((p, i) => (
        <text
          key={`lbl-${i}`}
          x={toX(i)}
          y={HEIGHT - 1}
          textAnchor="middle"
          fontSize="9"
          fill="#555"
        >
          {p.label ?? ''}
        </text>
      ))}
    </svg>
  );
}


// ─── Notification type → emoji map ───────────────────────────────────────────
const NOTIF_ICON = {
  transaction : '💸',
  security    : '🔒',
  kyc         : '✅',
  system      : '🔔',
  alert       : '⚠️',
  offer       : '🎁',
};

// ─── Transfer-mode badge colour map ──────────────────────────────────────────
// Each badge uses a solid dark container bg-[#1c1c2d] with a crisp micro-border
// instead of the semi-transparent Tailwind utility classes, matching the
// original design token specification exactly.
const MODE_BADGE_TEXT = {
  NEFT     : 'text-blue-400',
  RTGS     : 'text-brand-400',
  IMPS     : 'text-yellow-400',
  INTERNAL : 'text-green-400',
  SALARY   : 'text-green-400',
  INTEREST : 'text-blue-400',
  SYSTEM   : 'text-slate-300',
  CHARGE   : 'text-red-400',
  REVERSAL : 'text-yellow-400',
};

// ─── Quick-action tile ────────────────────────────────────────────────────────
// Container: solid dark bg-[#161622], crisp micro-border border-white/[0.04],
// hover lifts the border to white/[0.1]. Icon badge: rounded-2xl bg-[#1c1c2d].
function QuickAction({ to, icon: Icon, label, iconTextColor }) {
  return (
    <Link
      to={to}
      className="bg-[#161622] border border-white/[0.04] hover:border-white/[0.1] rounded-2xl p-4 flex flex-col items-center gap-2.5 text-center transition cursor-pointer group"
    >
      <div className="w-11 h-11 rounded-2xl bg-[#1c1c2d] border border-white/[0.04] flex items-center justify-center group-hover:scale-105 transition-transform">
        <Icon className={`text-xl ${iconTextColor}`} />
      </div>
      <p className="text-slate-300 text-xs font-medium leading-tight">{label}</p>
    </Link>
  );
}


// ─── Transaction table row ────────────────────────────────────────────────────
/**
 * Renders a single row in the recent-transactions ledger.
 * All date formatting is wrapped in safeFormat so a bad timestamp
 * cannot crash the entire page.
 */
function TransactionRow({ tx, index }) {
  const isCredit = tx.transaction_type === 'credit';

  const counterpartyName = isCredit
    ? tx.from_account_name || tx.description || 'Credit'
    : tx.to_account_name   || tx.description || 'Debit';

  const description = tx.description || tx.narration || counterpartyName || 'Transaction';

  const displayDate = safeFormat(tx.created_at, 'dd MMM', 'Recent');
  const displayTime = safeFormat(tx.created_at, 'HH:mm', '');

  const amount = parseFloat(tx.amount) || 0;
  const balanceAfter = parseFloat(tx.balance_after) || 0;

  const modeBadgeTextColor = MODE_BADGE_TEXT[tx.transfer_mode] || 'text-slate-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035, duration: 0.25 }}
      className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors px-1 rounded-lg"
    >
      {/* Type icon */}
      <div
        className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${
          isCredit ? 'bg-green-500/10' : 'bg-red-500/10'
        }`}
      >
        {isCredit
          ? <RiArrowDownLine className="text-green-400 text-base" />
          : <RiArrowUpLine   className="text-red-400   text-base" />
        }
      </div>

      {/* Description + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate leading-tight">
          {description}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {/* Transfer mode badge — solid dark container bg-[#1c1c2d] */}
          <span
            className={`inline-flex items-center bg-[#1c1c2d] border border-white/[0.04] rounded-md px-1.5 py-0.5 text-[10px] font-medium ${modeBadgeTextColor}`}
          >
            {tx.transfer_mode || 'TXN'}
          </span>
          <span className="text-slate-500 text-xs">
            {displayDate}{displayTime ? `, ${displayTime}` : ''}
          </span>
        </div>
      </div>

      {/* Amount + balance */}
      <div className="text-right flex-shrink-0">
        <p
          className={`text-sm font-bold ${
            isCredit ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {isCredit ? '+' : '-'}${amount.toLocaleString('en-US')}
        </p>
        <p className="text-slate-600 text-[10px] mt-0.5">
          Bal ${balanceAfter.toLocaleString('en-US')}
        </p>
      </div>
    </motion.div>
  );
}


// ─── Inline account / Visa card ───────────────────────────────────────────────
/**
 * Self-contained Visa card component.
 *
 * CRITICAL FIX — balance show/hide is managed EXCLUSIVELY by a local
 * React.useState hook.  It does NOT dispatch any Redux action.
 * This means toggling the eye icon:
 *   1. Only triggers a re-render of this component subtree.
 *   2. Cannot cause the parent page to re-render and re-run any potentially
 *      broken date formatting code.
 *   3. Cannot trigger a route transition or 401 redirect loop.
 *
 * The old AccountCard used dispatch(toggleBalanceVisibility()) which wrote to
 * Redux, causing every subscriber of state.account to re-render — including
 * components that called format(new Date(tx.created_at)) without guards.
 */
function InlineAccountCard({ account, user }) {
  // ── LOCAL state only — never touches Redux ──────────────────────────────
  const [showBalance, setShowBalance] = useState(false);

  const toggleBalance = useCallback((e) => {
    // Prevent any parent click handlers, form submissions, or link navigation
    e.preventDefault();
    e.stopPropagation();
    setShowBalance((prev) => !prev);
  }, []);

  const maskedAccountNumber = useMemo(() => {
    const num = account?.account_number;
    if (!num) return '**** **** **** ****';
    const str = String(num);
    return `${str.slice(0, 4)} **** **** ${str.slice(-4)}`;
  }, [account?.account_number]);

  const formattedBalance = useMemo(() => {
    if (!showBalance) return '$ ••••••';
    const bal = parseFloat(account?.balance ?? 0);
    return `$ ${bal.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }, [showBalance, account?.balance]);

  const accountTypeLabel = account?.account_type
    ? account.account_type.toUpperCase()
    : 'SAVINGS';

  const statusLabel  = account?.status?.toUpperCase() || 'ACTIVE';
  const isActive     = account?.status === 'active' || !account?.status;
  const holderName   = `${user?.firstName || user?.first_name || ''} ${user?.lastName || user?.last_name || ''}`.trim() || 'Account Holder';
  const swiftCode    = account?.swift_code || 'ALSTINBB';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative w-full rounded-3xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #c8102e 0%, #8b0000 55%, #3d0010 100%)',
        minHeight: 200,
      }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-44 h-44 rounded-full bg-white/[0.04] pointer-events-none" />
      <div className="absolute -bottom-14 -left-8 w-56 h-56 rounded-full bg-white/[0.03] pointer-events-none" />
      {/* Shimmer sweep */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.055) 50%, transparent 60%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 4s linear infinite',
        }}
      />

      <div className="relative p-6 flex flex-col gap-4">
        {/* Row 1 — bank label + status */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/60 text-xs uppercase tracking-widest font-medium">
              Alister Bank
            </p>
            <p className="text-white font-semibold text-sm mt-0.5">
              {accountTypeLabel} ACCOUNT
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <RiWifiLine className="text-white/40 text-xl" />
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                isActive
                  ? 'bg-green-500/20 text-green-300'
                  : 'bg-yellow-500/20 text-yellow-300'
              }`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Row 2 — balance with eye toggle */}
        <div>
          <p className="text-white/50 text-xs mb-1 uppercase tracking-wide">
            Available Balance
          </p>
          <div className="flex items-center gap-3">
            <AnimatePresence mode="wait">
              <motion.p
                key={showBalance ? 'visible' : 'hidden'}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="text-white text-2xl font-700 tracking-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif", fontVariantNumeric: 'tabular-nums' }}
              >
                {formattedBalance}
              </motion.p>
            </AnimatePresence>

            {/* Eye toggle — uses local state ONLY, no Redux dispatch */}
            <button
              type="button"
              onClick={toggleBalance}
              aria-label={showBalance ? 'Hide balance' : 'Show balance'}
              className="text-white/50 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              {showBalance
                ? <RiEyeOffLine className="text-lg" />
                : <RiEyeLine    className="text-lg" />
              }
            </button>
          </div>
        </div>

        {/* Row 3 — account number + SWIFT */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-widest mb-0.5">
              Account Number
            </p>
            <p className="text-white/80 font-mono text-sm tracking-widest">
              {maskedAccountNumber}
            </p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase mb-0.5">SWIFT</p>
            <p className="text-white/70 text-xs font-mono">{swiftCode}</p>
          </div>
        </div>

        {/* Row 4 — cardholder name + NFC icon */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-widest mb-0.5">
              Card Holder
            </p>
            <p className="text-white/90 text-sm font-medium tracking-wide uppercase">
              {holderName}
            </p>
          </div>
          <RiWifiLine className="text-white/25 text-3xl transform rotate-90" />
        </div>
      </div>
    </motion.div>
  );
}


// ─── Sticky glass top-nav bar ─────────────────────────────────────────────────
/**
 * Premium glass-effect top navigation bar.
 * Contains: search input, notification bell with dropdown, user avatar + name.
 * This bar is STICKY so it stays visible when the user scrolls the ledger.
 */
function DashboardTopBar({ user, notifications, unreadCount, onMarkAllRead }) {
  const navigate = useNavigate();
  const [notifOpen,  setNotifOpen]  = useState(false);
  const [searchText, setSearchText] = useState('');
  const notifRef = React.useRef(null);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    function handleOutsideClick(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const displayName  = user?.firstName || user?.first_name || 'User';
  const statusLabel  = user?.accountStatus || user?.account_status || 'Active';
  const avatarLetter = (user?.firstName?.[0] || user?.first_name?.[0] || 'U').toUpperCase();
  const avatarLetter2 = (user?.lastName?.[0]  || user?.last_name?.[0]  || '').toUpperCase();

  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-between px-1 py-3 mb-6"
      style={{
        background: 'linear-gradient(135deg, rgba(30,30,46,0.85) 0%, rgba(17,17,24,0.90) 100%)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '0 0 16px 16px',
        marginLeft: '-4px',
        marginRight: '-4px',
        paddingLeft: '8px',
        paddingRight: '8px',
      }}
    >
      {/* Left — page title + search */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div>
          <h1
            className="font-display font-700 text-white text-lg leading-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Dashboard
          </h1>
          <p className="text-slate-400 text-xs">
            {safeFormat(new Date().toISOString(), 'EEEE, dd MMMM yyyy', 'Today')}
          </p>
        </div>

        <div className="hidden md:flex items-center gap-2 bg-[#161622] rounded-xl px-3 py-2 border border-white/[0.08] flex-1 max-w-xs">
          <RiSearchLine className="text-slate-400 text-base flex-shrink-0" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search transactions…"
            className="bg-transparent text-sm text-white placeholder-slate-500 outline-none w-full"
          />
        </div>
      </div>

      {/* Right — notifications + user info */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setNotifOpen((prev) => !prev)}
            className="relative p-2.5 rounded-xl hover:bg-white/[0.05] text-slate-300 hover:text-white transition-colors"
            aria-label="Notifications"
          >
            <RiBellLine className="text-xl" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                key="notif-dropdown"
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-80 bg-[#15151f] border border-white/10 rounded-2xl overflow-hidden z-50 shadow-[0_8px_32px_rgba(0,0,0,0.55)] backdrop-blur-md"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                  <p className="font-semibold text-sm text-white">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => { onMarkAllRead(); setNotifOpen(false); }}
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <RiCheckLine /> Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-8">
                      No notifications
                    </p>
                  ) : (
                    notifications.slice(0, 8).map((n) => (
                      <div
                        key={n.id}
                        className={`px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer ${
                          !n.is_read ? 'bg-brand-500/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-base mt-0.5 flex-shrink-0">
                            {NOTIF_ICON[n.type] || '🔔'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium leading-tight">
                              {n.title}
                            </p>
                            <p className="text-slate-400 text-xs mt-0.5 truncate">
                              {n.message}
                            </p>
                            <p className="text-slate-500 text-[10px] mt-1">
                              {safeDistanceToNow(n.created_at, 'Recently')}
                            </p>
                          </div>
                          {!n.is_read && (
                            <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User avatar + name */}
        <button
          type="button"
          onClick={() => navigate('/dashboard/profile')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-brand-400 text-xs font-bold">
              {avatarLetter}{avatarLetter2}
            </span>
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-white text-sm font-medium leading-tight">
              {displayName}
            </p>
            <p className="text-slate-400 text-[10px] mt-0.5 capitalize">
              {statusLabel}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}


// ─── buildChartPoints (safe) ──────────────────────────────────────────────────
/**
 * Converts the raw transactions array into an array of data points for the
 * SVG activity chart.
 *
 * CRITICAL FIX: Every call to new Date() is guarded by the same isNaN check
 * used in safeFormat.  A null or invalid created_at value causes the
 * transaction to be skipped rather than throwing a RangeError.
 *
 * Returns at most the last 7 distinct calendar-day buckets.
 *
 * @param {Array} transactions
 * @returns {Array<{label:string, credit:number, debit:number}>}
 */
function buildChartPoints(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  const buckets = {};

  transactions.forEach((tx) => {
    // Guard: skip transactions with missing or invalid timestamps
    if (tx.created_at === null || tx.created_at === undefined || tx.created_at === '') {
      return;
    }
    const dateObj = new Date(tx.created_at);
    if (isNaN(dateObj.getTime())) {
      return;
    }

    // Safe format — we already validated the date object above
    let label;
    try {
      label = format(dateObj, 'dd MMM');
    } catch {
      return; // Skip this transaction if format somehow still fails
    }

    if (!buckets[label]) {
      buckets[label] = { label, credit: 0, debit: 0 };
    }

    const amount = parseFloat(tx.amount) || 0;
    if (tx.transaction_type === 'credit') {
      buckets[label].credit += amount;
    } else {
      buckets[label].debit += amount;
    }
  });

  // Return the most recent 7 buckets in chronological order
  const allPoints = Object.values(buckets);
  return allPoints.slice(-7).reverse();
}


// ─── Main page component ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const dispatch = useDispatch();

  // ── Redux slices ─────────────────────────────────────────────────────────
  const { account, loading: accountLoading }       = useSelector((s) => s.account);
  const { transactions, loading: txLoading }       = useSelector((s) => s.transaction);
  const { user }                                   = useSelector((s) => s.auth);
  const { notifications, unreadCount }             = useSelector((s) => s.notification);

  // ── Initial data fetch ───────────────────────────────────────────────────
  useEffect(() => {
    dispatch(fetchAccount());
    dispatch(fetchTransactions({ limit: 50, page: 1 }));
    dispatch(fetchNotifications());
  }, [dispatch]);

  // ── Derived statistics (memoised to avoid recompute on every render) ─────
  const totalCreditAmount = useMemo(
    () =>
      transactions
        .filter((t) => t.transaction_type === 'credit')
        .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0),
    [transactions]
  );

  const totalDebitAmount = useMemo(
    () =>
      transactions
        .filter((t) => t.transaction_type === 'debit')
        .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0),
    [transactions]
  );

  const totalTransactionCount = transactions.length;

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartPoints = useMemo(
    () => buildChartPoints(transactions),
    [transactions]
  );

  // ── Mark-all-read handler ─────────────────────────────────────────────────
  const handleMarkAllRead = useCallback(() => {
    dispatch(markAllRead());
  }, [dispatch]);

  // ── Greeting based on time of day ─────────────────────────────────────────
  const greetingWord = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }, []);

  const displayFirstName =
    user?.firstName || user?.first_name || 'there';

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-full space-y-0">

      {/* ── Sticky glass top-navigation bar ─────────────────────────────── */}
      <DashboardTopBar
        user={user}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkAllRead={handleMarkAllRead}
      />

      {/* ── Page body ───────────────────────────────────────────────────── */}
      <div className="w-full max-w-full space-y-6 px-0 pb-6">

        {/* Welcome banner */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-white font-semibold text-base leading-tight">
              Good {greetingWord}, {displayFirstName}! 👋
            </h2>
            <p className="text-slate-400 text-sm mt-0.5">
              Here's your complete financial overview
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              dispatch(fetchAccount());
              dispatch(fetchTransactions({ limit: 50, page: 1 }));
            }}
            className="p-2 rounded-xl hover:bg-white/[0.05] text-slate-400 hover:text-white transition-colors flex-shrink-0"
            aria-label="Refresh dashboard"
          >
            <RiRefreshLine className={`text-xl ${accountLoading || txLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ── Main two-column grid ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">

          {/* ── Left column (2/5 width on xl) ─────────────────────────── */}
          <div className="xl:col-span-2 min-w-0 space-y-5">

            {/* Visa savings card */}
            <InlineAccountCard account={account} user={user} />

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label : 'Total Credits',
                  value : `$${totalCreditAmount.toLocaleString('en-US')}`,
                  icon  : RiArrowDownLine,
                  color : 'text-green-400',
                  bg    : 'bg-green-500/10',
                },
                {
                  label : 'Total Debits',
                  value : `$${totalDebitAmount.toLocaleString('en-US')}`,
                  icon  : RiArrowUpLine,
                  color : 'text-red-400',
                  bg    : 'bg-red-500/10',
                },
                {
                  label : 'Transactions',
                  value : totalTransactionCount,
                  icon  : RiExchangeLine,
                  color : 'text-blue-400',
                  bg    : 'bg-blue-500/10',
                },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="bg-[#111118] border border-white/[0.06] rounded-[24px] shadow-xl p-3 text-center"
                >
                  <div
                    className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center mx-auto mb-2`}
                  >
                    <stat.icon className={`${stat.color} text-sm`} />
                  </div>
                  <p className="text-white text-sm font-bold leading-tight">
                    {stat.value}
                  </p>
                  <p className="text-slate-500 text-[10px] mt-0.5 leading-tight">
                    {stat.label}
                  </p>
                </motion.div>
              ))}
            </div>

            {/* Quick shortcuts card */}
            <div className="bg-[#111118] border border-white/[0.06] rounded-[24px] shadow-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-white text-sm font-semibold">Quick Shortcuts</p>
              </div>
              {/* 3-column grid as per original spec */}
              <div className="grid grid-cols-3 gap-4">
                <QuickAction
                  to="/dashboard/transfer"
                  icon={RiSendPlaneLine}
                  label="Send Money"
                  iconTextColor="text-red-400"
                />
                <QuickAction
                  to="/dashboard/statement"
                  icon={RiFileTextLine}
                  label="Statement"
                  iconTextColor="text-purple-400"
                />
                <QuickAction
                  to="/dashboard/beneficiaries"
                  icon={RiGroupLine}
                  label="Deposit"
                  iconTextColor="text-emerald-400"
                />
              </div>
            </div>

            {/* Account detail block */}
            <div className="bg-[#111118] border border-white/[0.06] rounded-[24px] shadow-xl p-5 space-y-3">
              <p className="text-slate-400 text-xs uppercase tracking-widest font-medium">
                Account Details
              </p>
              {[
                {
                  label : 'Account Number',
                  value : account?.account_number || '—',
                },
                {
                  label : 'SWIFT Code',
                  value : account?.swift_code || 'ALSTINBB',
                },
                {
                  label : 'Account Type',
                  value : account?.account_type
                    ? account.account_type.toUpperCase()
                    : 'SAVINGS',
                },
                {
                  label : 'Daily Transfer Limit',
                  value : `$${parseFloat(
                    account?.daily_transfer_limit || 500000
                  ).toLocaleString('en-US')}`,
                },
                {
                  label : 'Interest Rate',
                  value : account?.interest_rate
                    ? `${account.interest_rate}% p.a.`
                    : '4.00% p.a.',
                },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-slate-400">{label}</span>
                  <span className="text-white font-medium font-mono">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right column (3/5 width on xl) ────────────────────────── */}
          <div className="xl:col-span-3 min-w-0 space-y-5">

            {/* Activity analytics — SVG chart */}
            <div className="bg-[#111118] border border-white/[0.06] rounded-[24px] shadow-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <RiBarChartLine className="text-brand-400 text-lg" />
                  <p className="text-white font-semibold text-sm">
                    Activity Analytics
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
                    Credits
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
                    Debits
                  </span>
                </div>
              </div>

              {txLoading ? (
                <div className="flex items-center justify-center h-36">
                  <div
                    className="spinner"
                    style={{ width: 32, height: 32, borderWidth: 3 }}
                  />
                </div>
              ) : (
                <ActivitySVGChart points={chartPoints} />
              )}

              {/* Summary totals below chart */}
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/[0.05]">
                <div className="text-center">
                  <p className="text-slate-500 text-xs mb-1">Net Flow</p>
                  <p
                    className={`font-bold text-sm ${
                      totalCreditAmount >= totalDebitAmount
                        ? 'text-green-400'
                        : 'text-red-400'
                    }`}
                  >
                    {totalCreditAmount >= totalDebitAmount ? '+' : '-'}$
                    {Math.abs(totalCreditAmount - totalDebitAmount).toLocaleString(
                      'en-US'
                    )}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-slate-500 text-xs mb-1">Avg Credit</p>
                  <p className="text-green-400 font-bold text-sm">
                    $
                    {totalTransactionCount > 0 &&
                    transactions.filter((t) => t.transaction_type === 'credit').length > 0
                      ? Math.round(
                          totalCreditAmount /
                            transactions.filter(
                              (t) => t.transaction_type === 'credit'
                            ).length
                        ).toLocaleString('en-US')
                      : '0'}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-slate-500 text-xs mb-1">Avg Debit</p>
                  <p className="text-red-400 font-bold text-sm">
                    $
                    {totalTransactionCount > 0 &&
                    transactions.filter((t) => t.transaction_type === 'debit').length > 0
                      ? Math.round(
                          totalDebitAmount /
                            transactions.filter(
                              (t) => t.transaction_type === 'debit'
                            ).length
                        ).toLocaleString('en-US')
                      : '0'}
                  </p>
                </div>
              </div>
            </div>

            {/* Transaction ledger — Recent History card */}
            <div className="bg-[#111118] border border-white/[0.06] rounded-[24px] shadow-xl overflow-hidden">
              {/* Card header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.05]">
                <div className="flex items-center gap-2">
                  <RiExchangeLine className="text-brand-400 text-lg" />
                  <p className="text-white font-semibold text-sm">
                    Recent History
                  </p>
                </div>
                <Link
                  to="/dashboard/transactions"
                  className="text-brand-400 hover:text-brand-300 text-xs flex items-center gap-1 transition-colors"
                >
                  View All <RiArrowRightLine />
                </Link>
              </div>

              {/* Column header row */}
              <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-2.5 border-b border-white/[0.04] text-slate-500 text-xs uppercase tracking-wide">
                <div className="col-span-1" />
                <div className="col-span-4">Description</div>
                <div className="col-span-3">Mode / Date</div>
                <div className="col-span-4 text-right">Amount / Balance</div>
              </div>

              {/* History log items — inner container bg-[#161622] */}
              {txLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div
                    className="spinner"
                    style={{ width: 32, height: 32, borderWidth: 3 }}
                  />
                </div>
              ) : transactions.length === 0 ? (
                <div className="bg-[#161622] border border-white/[0.04] rounded-2xl mx-5 my-4 py-10 text-center">
                  <RiExchangeLine className="text-slate-600 text-5xl mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">No transactions yet</p>
                  <p className="text-slate-600 text-xs mt-1">
                    Your transaction history will appear here
                  </p>
                </div>
              ) : (
                <div className="bg-[#161622] border border-white/[0.04] rounded-2xl mx-5 my-4 px-4">
                  {transactions.slice(0, 10).map((tx, index) => (
                    <TransactionRow key={tx.id || index} tx={tx} index={index} />
                  ))}
                </div>
              )}

              {/* Footer — show more link */}
              {transactions.length > 10 && (
                <div className="px-5 py-3 border-t border-white/[0.04]">
                  <Link
                    to="/dashboard/transactions"
                    className="text-brand-400 hover:text-brand-300 text-xs flex items-center gap-1 justify-center w-full transition-colors"
                  >
                    Show all {transactions.length} transactions
                    <RiArrowRightLine />
                  </Link>
                </div>
              )}
            </div>

            {/* Bank information footer card */}
            <div className="bg-[#111118] border border-white/[0.06] rounded-[24px] shadow-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                  <RiBankLine className="text-brand-400 text-sm" />
                </div>
                <p className="text-white text-sm font-semibold">Bank Information</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: 'Bank Name',  value: 'Alister Bank' },
                  { label: 'SWIFT Code', value: account?.swift_code || 'ALSTINBB' },
                  { label: 'Branch',     value: account?.branch_name || 'Main Branch' },
                  { label: 'Currency',   value: 'USD' },
                  {
                    label: 'Min Balance',
                    value: `$${parseFloat(
                      account?.minimum_balance ||
                        (account?.account_type === 'current' ? 10598 : 5298)
                    ).toLocaleString('en-US')}`,
                  },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-[#161622] border border-white/[0.04] rounded-xl p-3">
                    <p className="text-slate-500 text-[10px] uppercase tracking-wide mb-1">
                      {label}
                    </p>
                    <p className="text-white text-xs font-medium font-mono">{value}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
