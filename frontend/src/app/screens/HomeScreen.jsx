/**
 * App home — greeting, balance card (hide/show), quick actions, recent
 * activity. Every tile maps to a REAL Alister Bank feature; no filler.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  Eye, EyeOff, Send, PlusCircle, Users, FileText, CreditCard,
  Bell, ArrowDownLeft, ArrowUpRight, ChevronRight, ScanLine,
} from 'lucide-react';
import api from '../../services/api';
import { getLockScreenIdentity } from '../services/appAuth';
import { Screen, Card, BrandMark } from '../components/AppUI';

const fetcher = (url) => api.get(url).then((r) => r.data.data);

const fmtMoney = (v) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const QUICK_ACTIONS = [
  { to: '/app/pay', icon: Send, label: 'Send Money' },
  { to: '/app/menu/add-money', icon: PlusCircle, label: 'Add Money' },
  { to: '/app/menu/beneficiaries', icon: Users, label: 'Payees' },
  { to: '/app/history', icon: FileText, label: 'Statement' },
  { to: '/app/menu/card', icon: CreditCard, label: 'My Card' },
  // Website QR sign-in: scan the code on the login page, approve in-app.
  { to: '/app/qr-login', icon: ScanLine, label: 'Scan QR' },
];

export default function HomeScreen() {
  const navigate = useNavigate();
  const [showBalance, setShowBalance] = useState(false);
  const { firstName } = getLockScreenIdentity();

  const { data: account } = useSWR('/account/details', fetcher);
  const { data: mini } = useSWR('/transactions/mini-statement', fetcher);
  const { data: notifData } = useSWR('/transactions/notifications', fetcher);

  const acct = account?.account || account;
  const txns = (mini?.transactions || mini || []).slice(0, 5);
  const unread = (notifData?.notifications || notifData || []).filter((n) => !n.is_read).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <Screen className="pb-24">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <BrandMark size={38} />
          <div>
            <p className="app-dim text-xs">{greeting},</p>
            <h1 className="text-base font-bold leading-tight">{firstName || 'Customer'}</h1>
          </div>
        </div>
        <button
          type="button"
          className="app-icon-btn relative"
          onClick={() => navigate('/app/menu/notifications')}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        >
          <Bell size={20} aria-hidden="true" />
          {unread > 0 && <span className="app-badge-dot" aria-hidden="true" />}
        </button>
      </header>

      {/* Balance card */}
      <div className="px-5">
        <Card className="app-balance-card">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium tracking-wide uppercase opacity-80">Available Balance</p>
            <button
              type="button"
              className="app-icon-btn-sm"
              onClick={() => setShowBalance((s) => !s)}
              aria-label={showBalance ? 'Hide balance' : 'Show balance'}
            >
              {showBalance ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
          <p className="text-3xl font-bold mt-1 tabular-nums" aria-live="polite">
            {showBalance ? fmtMoney(acct?.balance) : '$ ••••••'}
          </p>
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs opacity-80">
              A/C {acct?.account_number ? `••${String(acct.account_number).slice(-4)}` : '••••'}
            </p>
            <p className="text-xs opacity-80 capitalize">{acct?.account_type || 'Savings'}</p>
          </div>
        </Card>
      </div>

      {/* Quick actions — 3x2 grid of real features */}
      <section className="px-5 mt-6" aria-label="Quick actions">
        <div className="grid grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className="app-action-tile">
              <span className="app-action-icon"><Icon size={20} aria-hidden="true" /></span>
              <span className="text-xs font-medium text-center leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section className="px-5 mt-7" aria-label="Recent activity">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Recent Activity</h2>
          <Link to="/app/history" className="flex items-center gap-0.5 text-xs app-accent">
            View all <ChevronRight size={13} aria-hidden="true" />
          </Link>
        </div>
        {txns.length === 0 ? (
          <Card><p className="app-dim text-sm text-center py-4">No transactions yet</p></Card>
        ) : (
          <Card className="divide-y" style={{ borderColor: 'var(--app-border)' }}>
            {txns.map((t) => {
              const credit = t.type === 'credit' || t.direction === 'credit';
              return (
                <div key={t.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                  <span className={`app-tx-icon ${credit ? 'app-tx-credit' : 'app-tx-debit'}`}>
                    {credit
                      ? <ArrowDownLeft size={16} aria-hidden="true" />
                      : <ArrowUpRight size={16} aria-hidden="true" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {t.description || t.beneficiary_name || (credit ? 'Money received' : 'Money sent')}
                    </p>
                    <p className="app-dim text-xs">
                      {new Date(t.created_at || t.createdAt).toLocaleDateString('en-US', {
                        day: 'numeric', month: 'short',
                      })}
                    </p>
                  </div>
                  <p className={`text-sm font-semibold tabular-nums ${credit ? 'app-credit-text' : ''}`}>
                    {credit ? '+' : '-'}{fmtMoney(t.amount)}
                  </p>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </Screen>
  );
}
