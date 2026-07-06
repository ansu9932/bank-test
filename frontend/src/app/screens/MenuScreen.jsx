/**
 * Menu — profile header + sub-pages, all backed by REAL bank features:
 *   my card (view / request), beneficiaries, add money (deposit order),
 *   support tickets, notifications, theme toggle, lock / logout.
 */
import { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  CreditCard, Users, PlusCircle, Headphones, Bell, ChevronRight,
  Moon, Sun, Lock, LogOut, ShieldCheck, Fingerprint,
} from 'lucide-react';
import api from '../../services/api';
import appStorage from '../../services/appStorage';
import {
  isBiometricAvailable, isBiometricEnabled, enableBiometricLogin, disableBiometricLogin,
} from '../../services/biometric';
import { getLockScreenIdentity, logoutDevice, logoutSession, lockApp } from '../services/appAuth';
import { useAppTheme } from '../MobileApp';
import {
  Screen, AppHeader, Card, PrimaryButton, Field, TextInput,
} from '../components/AppUI';

const fetcher = (url) => api.get(url).then((r) => r.data.data);
const fmtMoney = (v) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Root menu ────────────────────────────────────────────────────────────────
function MenuRoot() {
  const navigate = useNavigate();
  const { theme, toggle } = useAppTheme();
  const { firstName, customerId } = getLockScreenIdentity();
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioOn, setBioOn] = useState(isBiometricEnabled());
  // null | 'session' | 'device' — which logout is awaiting confirmation.
  const [confirmLogout, setConfirmLogout] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const doLogout = async () => {
    setLoggingOut(true);
    try {
      if (confirmLogout === 'device') {
        await logoutDevice();
        navigate('/app/onboarding', { replace: true });
      } else {
        await logoutSession();
        navigate('/app/lock', { replace: true });
      }
    } finally {
      setLoggingOut(false);
      setConfirmLogout(null);
    }
  };

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable).catch(() => {});
  }, []);

  const toggleBiometric = async () => {
    try {
      if (bioOn) {
        await disableBiometricLogin();
        appStorage.removeItem('appBiometricMpin');
        setBioOn(false);
      } else {
        // Empty credential blob: the app's lock screen replays the MPIN from
        // its own secure key after the next successful MPIN unlock.
        const ok = await enableBiometricLogin({});
        setBioOn(!!ok);
      }
    } catch {
      /* user cancelled the biometric prompt */
    }
  };

  const items = [
    { to: '/app/menu/card', icon: CreditCard, label: 'My Card' },
    { to: '/app/menu/beneficiaries', icon: Users, label: 'Beneficiaries' },
    { to: '/app/menu/add-money', icon: PlusCircle, label: 'Add Money' },
    { to: '/app/menu/support', icon: Headphones, label: 'Support' },
    { to: '/app/menu/notifications', icon: Bell, label: 'Notifications' },
  ];

  return (
    <Screen className="pb-24">
      <AppHeader title="Menu" />
      <div className="px-5 flex flex-col gap-4">
        {/* Profile */}
        <Card className="flex items-center gap-3">
          <span className="app-avatar" aria-hidden="true">{(firstName || 'A').charAt(0)}</span>
          <div className="min-w-0">
            <p className="font-semibold truncate">{firstName || 'Customer'}</p>
            <p className="app-dim text-xs">{customerId || ''}</p>
          </div>
        </Card>

        {/* Feature links */}
        <Card className="divide-y p-0" style={{ borderColor: 'var(--app-border)' }}>
          {items.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to} className="flex items-center gap-3 px-4 py-3.5">
              <Icon size={18} className="app-accent" aria-hidden="true" />
              <span className="flex-1 text-sm font-medium">{label}</span>
              <ChevronRight size={16} className="app-dim" aria-hidden="true" />
            </Link>
          ))}
        </Card>

        {/* Preferences */}
        <Card className="divide-y p-0" style={{ borderColor: 'var(--app-border)' }}>
          <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5" onClick={toggle}>
            {theme === 'dark' ? <Sun size={18} className="app-accent" aria-hidden="true" /> : <Moon size={18} className="app-accent" aria-hidden="true" />}
            <span className="flex-1 text-left text-sm font-medium">
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </span>
          </button>
          {bioAvailable && (
            <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5" onClick={toggleBiometric}>
              <Fingerprint size={18} className="app-accent" aria-hidden="true" />
              <span className="flex-1 text-left text-sm font-medium">Biometric unlock</span>
              <span className={`app-toggle ${bioOn ? 'app-toggle-on' : ''}`} aria-hidden="true" />
            </button>
          )}
        </Card>

        {/* Session */}
        <Card className="divide-y p-0" style={{ borderColor: 'var(--app-border)' }}>
          <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5"
            onClick={() => { lockApp(); navigate('/app/lock', { replace: true }); }}>
            <Lock size={18} className="app-accent" aria-hidden="true" />
            <span className="flex-1 text-left text-sm font-medium">Lock app</span>
          </button>
          <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5"
            onClick={() => setConfirmLogout('session')}>
            <LogOut size={18} className="app-accent" aria-hidden="true" />
            <span className="flex-1 text-left text-sm font-medium">Log out</span>
          </button>
          <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5"
            onClick={() => setConfirmLogout('device')}>
            <LogOut size={18} style={{ color: 'var(--app-danger)' }} aria-hidden="true" />
            <span className="flex-1 text-left text-sm font-medium" style={{ color: 'var(--app-danger)' }}>
              Log out &amp; remove device
            </span>
          </button>
        </Card>

        {/* Logout confirmation sheet — a mis-tap must never log the user out */}
        {confirmLogout && (
          <div className="fixed inset-0 z-[70] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            role="dialog" aria-modal="true" aria-label="Confirm logout">
            {/* pb-24 keeps both buttons clear of the bottom nav bar */}
            <div className="w-full max-w-md rounded-t-2xl p-5 pb-24 flex flex-col gap-4"
              style={{ background: 'var(--app-bg)' }}>
              <h2 className="text-base font-bold" style={{ color: 'var(--app-text)' }}>
                {confirmLogout === 'device' ? 'Remove this device?' : 'Log out?'}
              </h2>
              <p className="app-dim text-sm leading-relaxed">
                {confirmLogout === 'device'
                  ? 'This ends your session AND removes your account from this device. You will need your Customer ID, date of birth, OTP and password to set up the app again.'
                  : 'This ends your session. Your account stays on this device — next time you only need your MPIN to sign in.'}
              </p>
              <div className="flex flex-col gap-2">
                <button type="button" disabled={loggingOut} onClick={doLogout}
                  className="w-full rounded-xl py-3 text-sm font-semibold"
                  style={{ background: 'var(--app-danger)', color: '#ffffff' }}>
                  {loggingOut ? 'Logging out…'
                    : confirmLogout === 'device' ? 'Yes, remove device' : 'Yes, log out'}
                </button>
                <button type="button" disabled={loggingOut} onClick={() => setConfirmLogout(null)}
                  className="w-full rounded-xl py-3 text-sm font-semibold"
                  style={{ background: 'var(--app-surface)', color: 'var(--app-text)', border: '1px solid var(--app-border)' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="flex items-center justify-center gap-1.5 text-xs app-dim pb-2">
          <ShieldCheck size={13} aria-hidden="true" />
          Alister Bank · Bank-grade security
        </p>
      </div>
    </Screen>
  );
}

// ─── My Card ──────────────────────────────────────────────────────────────────
function CardPage() {
  const { data, isLoading, mutate } = useSWR('/requests/my-card', fetcher);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [error, setError] = useState('');
  const [askPin, setAskPin] = useState(false);
  const [securityPin, setSecurityPin] = useState('');
  const [requested, setRequested] = useState(false);
  // A real card must have an id — an empty object or `{ card: null }` payload
  // means the user has NO card and must see the request option instead.
  const raw = data?.card !== undefined ? data.card : data;
  const card = raw && typeof raw === 'object' && raw.id ? raw : null;

  const requestCard = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/requests/debit-card', {});
      setRequested(true);
      mutate();
    } catch (err) {
      setError(err.response?.data?.message || 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  // The reveal endpoint requires the user's 4-digit transaction security PIN
  // and returns { number, formattedNumber, cvv, expiry } — map those exactly.
  const reveal = async () => {
    if (!card?.id || securityPin.length < 4) return;
    setBusy(true);
    setError('');
    try {
      const { data: res } = await api.post(`/requests/card/${card.id}/reveal`, { securityPin });
      const details = res.data || res;
      setRevealed({
        cardNumber: details.formattedNumber || details.number || '',
        expiry: details.expiry || '',
        cvv: details.cvv || '',
      });
      setAskPin(false);
      setSecurityPin('');
      // Auto-hide after 30s, same policy as the website.
      setTimeout(() => setRevealed(null), 30000);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not reveal card details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen className="pb-24">
      <AppHeader title="My Card" backTo="/app/menu" />
      <div className="px-5 flex flex-col gap-4">
        {isLoading && (
          <Card className="text-center py-8">
            <p className="app-dim text-sm">Checking your card…</p>
          </Card>
        )}
        {!isLoading && !card && (
          <Card className="text-center py-8 flex flex-col items-center gap-3">
            <CreditCard size={36} className="app-dim" aria-hidden="true" />
            {requested ? (
              <>
                <p className="text-sm font-medium">Card request submitted</p>
                <p className="app-dim text-xs max-w-[260px] text-pretty">
                  Your debit card request is being reviewed. It will appear here once approved.
                </p>
              </>
            ) : (
              <>
                <p className="app-dim text-sm">You don&apos;t have a debit card yet.</p>
                <PrimaryButton onClick={requestCard} loading={busy}>Request Debit Card</PrimaryButton>
              </>
            )}
          </Card>
        )}
        {card && (
          <>
            <Card className="app-balance-card">
              <p className="text-xs uppercase tracking-wide opacity-80">Alister Bank Debit</p>
              <p className="text-xl font-bold tracking-widest mt-4 tabular-nums">
                {revealed?.cardNumber
                  ? revealed.cardNumber
                  : `•••• •••• •••• ${String(card.card_last4 || card.last4 || String(card.card_number || '').slice(-4) || '····')}`}
              </p>
              <div className="flex justify-between mt-4 text-xs opacity-90">
                <span>{revealed?.expiry || '••/••'}</span>
                <span>CVV {revealed?.cvv || '•••'}</span>
              </div>
            </Card>
            <p className="app-dim text-xs text-center capitalize">Status: {(card.status || 'active').toLowerCase()}</p>
            {!revealed && !askPin && (
              <PrimaryButton onClick={() => { setAskPin(true); setError(''); }}>
                Reveal card details (30s)
              </PrimaryButton>
            )}
            {!revealed && askPin && (
              <Card className="flex flex-col gap-3">
                <Field label="Transaction security PIN" hint="The 4-digit PIN you use for transfers.">
                  <TextInput
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••"
                    value={securityPin}
                    onChange={(e) => setSecurityPin(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
                <PrimaryButton onClick={reveal} loading={busy} disabled={securityPin.length < 4}>
                  Confirm &amp; reveal
                </PrimaryButton>
              </Card>
            )}
          </>
        )}
        {error && <p className="text-sm" style={{ color: 'var(--app-danger)' }} role="alert">{error}</p>}
      </div>
    </Screen>
  );
}

// ─── Beneficiaries ────────────────────────────────────────────────────────────
function BeneficiariesPage() {
  const { data, mutate } = useSWR('/transactions/beneficiaries', fetcher);
  const [form, setForm] = useState({ name: '', accountNumber: '', ifsc: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Live IFSC lookup result: { bank, branch, city, state } | 'invalid' | null
  const [ifscInfo, setIfscInfo] = useState(null);
  const list = data?.beneficiaries || data || [];

  // Debounced bank/branch lookup as soon as the IFSC looks complete (11 chars).
  useEffect(() => {
    const code = (form.ifsc || '').trim().toUpperCase();
    if (code.length !== 11) { setIfscInfo(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        const { data: res } = await api.get(`/payments/verify-ifsc/${code}`);
        setIfscInfo(res.data || res);
      } catch {
        setIfscInfo('invalid');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.ifsc]);

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/transactions/beneficiaries', {
        name: form.name,
        accountName: form.name,
        account_number: form.accountNumber,
        accountNumber: form.accountNumber,
        ifscCode: (form.ifsc || '').trim().toUpperCase() || undefined,
        bankName: ifscInfo && ifscInfo !== 'invalid' ? ifscInfo.bank : undefined,
      });
      setForm({ name: '', accountNumber: '', ifsc: '' });
      setIfscInfo(null);
      mutate();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add beneficiary.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen className="pb-24">
      <AppHeader title="Beneficiaries" backTo="/app/menu" />
      <div className="px-5 flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <Field label="Name">
            <TextInput placeholder="Beneficiary name" value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Account number">
            <TextInput inputMode="numeric" placeholder="Account number" value={form.accountNumber}
              onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))} />
          </Field>
          <Field label="IFSC code" hint="Leave empty for Alister Bank accounts.">
            <TextInput placeholder="e.g. HDFC0001234" autoCapitalize="characters" maxLength={11}
              value={form.ifsc}
              onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))} />
          </Field>
          {ifscInfo === 'invalid' && (
            <p className="text-sm" style={{ color: 'var(--app-danger)' }} role="alert">
              Invalid IFSC code — no matching bank branch found.
            </p>
          )}
          {ifscInfo && ifscInfo !== 'invalid' && (
            <p className="text-sm app-credit-text" role="status">
              {ifscInfo.bank} · {ifscInfo.branch}{ifscInfo.city ? `, ${ifscInfo.city}` : ''}
            </p>
          )}
          {error && <p className="text-sm" style={{ color: 'var(--app-danger)' }} role="alert">{error}</p>}
          <PrimaryButton onClick={add} loading={busy}
            disabled={!form.name || !form.accountNumber || ifscInfo === 'invalid'}>
            Add beneficiary
          </PrimaryButton>
        </Card>

        {list.length > 0 && (
          <Card className="divide-y p-0" style={{ borderColor: 'var(--app-border)' }}>
            {list.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                <span className="app-avatar" aria-hidden="true">{(b.name || '?').charAt(0)}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{b.name}</p>
                  <p className="app-dim text-xs">••{String(b.account_number || '').slice(-4)}</p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </Screen>
  );
}

// ─── Add Money ────────────────────────────────────────────────────────────────
// Mirrors the website's DepositFunds: UPI/QR (≤ $100,000) hits /payments/
// create-qr which returns a scannable qrImage. The old code posted to
// create-deposit-order without a paymentMethod, which that endpoint rejects
// with "Select a valid payment method: Card or Net Banking".
const UPI_QR_CAP = 100000;

function AddMoneyPage() {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const overCap = Number(amount) > UPI_QR_CAP;

  const createOrder = async () => {
    setBusy(true);
    setError('');
    try {
      // QR flow for standard amounts; the backend caps UPI/QR at $100,000.
      const { data } = await api.post('/payments/create-qr', { amount: Number(amount) });
      setOrder(data.data || data);
    } catch (err) {
      setError(err.response?.data?.message || 'Deposits are not enabled for your account yet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen className="pb-24">
      <AppHeader title="Add Money" backTo="/app/menu" />
      <div className="px-5 flex flex-col gap-4">
        {!order ? (
          <Card className="flex flex-col gap-3">
            <Field label="Amount to deposit" hint={`Pay by scanning a UPI QR code (up to $${UPI_QR_CAP.toLocaleString('en-US')}).`}>
              <TextInput type="number" inputMode="decimal" min="1" placeholder="0.00"
                value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            {overCap && (
              <p className="app-dim text-xs text-pretty">
                Amounts above ${UPI_QR_CAP.toLocaleString('en-US')} require Card or Net Banking —
                please use the website&apos;s Deposit Funds page for large deposits.
              </p>
            )}
            {error && <p className="text-sm" style={{ color: 'var(--app-danger)' }} role="alert">{error}</p>}
            <PrimaryButton onClick={createOrder} loading={busy} disabled={!amount || overCap}>
              Generate payment QR
            </PrimaryButton>
          </Card>
        ) : (
          <Card className="flex flex-col items-center gap-3 text-center py-6">
            {order.qrImage || order.qr_image ? (
              <img src={order.qrImage || order.qr_image} alt="Deposit payment QR code" className="w-48 h-48 rounded-lg bg-white p-2" />
            ) : (
              <p className="text-sm">Order created — reference: {order.orderRef || order.order_ref || '—'}</p>
            )}
            <p className="app-dim text-xs text-pretty">
              Scan and pay {amount ? fmtMoney(amount) : ''} with any UPI app. Your balance updates
              automatically once payment is confirmed.
            </p>
            <button type="button" className="app-dim text-xs underline"
              onClick={() => { setOrder(null); setAmount(''); }}>
              Start a new deposit
            </button>
          </Card>
        )}
      </div>
    </Screen>
  );
}

// ─── Support ──────────────────────────────────────────────────────────────────
function SupportPage() {
  const { data, mutate } = useSWR('/transactions/support-tickets', fetcher);
  const [form, setForm] = useState({ subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tickets = data?.tickets || data || [];

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/transactions/support-tickets', form);
      setForm({ subject: '', message: '' });
      mutate();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create ticket.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen className="pb-24">
      <AppHeader title="Support" backTo="/app/menu" />
      <div className="px-5 flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <Field label="Subject">
            <TextInput placeholder="How can we help?" value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
          </Field>
          <Field label="Message">
            <textarea className="app-input min-h-24 resize-none" placeholder="Describe your issue…"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} />
          </Field>
          {error && <p className="text-sm" style={{ color: 'var(--app-danger)' }} role="alert">{error}</p>}
          <PrimaryButton onClick={submit} loading={busy} disabled={!form.subject || !form.message}>
            Submit ticket
          </PrimaryButton>
        </Card>

        {tickets.length > 0 && (
          <Card className="divide-y p-0" style={{ borderColor: 'var(--app-border)' }}>
            {tickets.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <span className="app-chip text-[10px] capitalize shrink-0">{(t.status || 'open').toLowerCase()}</span>
                </div>
                <p className="app-dim text-xs mt-1 line-clamp-2">{t.message}</p>
              </div>
            ))}
          </Card>
        )}
      </div>
    </Screen>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────
function NotificationsPage() {
  const { data } = useSWR('/transactions/notifications', fetcher);
  const list = data?.notifications || data || [];

  return (
    <Screen className="pb-24">
      <AppHeader title="Notifications" backTo="/app/menu" />
      <div className="px-5">
        {list.length === 0 ? (
          <Card><p className="app-dim text-sm text-center py-6">No notifications</p></Card>
        ) : (
          <Card className="divide-y p-0" style={{ borderColor: 'var(--app-border)' }}>
            {list.map((n) => (
              <div key={n.id} className="px-4 py-3">
                <p className={`text-sm ${n.is_read ? 'app-dim' : 'font-medium'}`}>{n.title || n.message}</p>
                {n.title && n.message && <p className="app-dim text-xs mt-0.5">{n.message}</p>}
                <p className="app-dim text-[10px] mt-1">
                  {new Date(n.created_at || n.createdAt).toLocaleString('en-US', {
                    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                  })}
                </p>
              </div>
            ))}
          </Card>
        )}
      </div>
    </Screen>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default function MenuScreen() {
  return (
    <Routes>
      <Route index element={<MenuRoot />} />
      <Route path="card" element={<CardPage />} />
      <Route path="beneficiaries" element={<BeneficiariesPage />} />
      <Route path="add-money" element={<AddMoneyPage />} />
      <Route path="support" element={<SupportPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
    </Routes>
  );
}
