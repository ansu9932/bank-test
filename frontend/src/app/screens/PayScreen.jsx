/**
 * Pay — all four REAL transfer rails: internal Alister transfer, UPI payout,
 * bank payout (IMPS/NEFT), and SWIFT international. Reuses the exact backend
 * contracts the website's TransferPage uses (idempotency key + 428 OTP step).
 *
 * Flow (matches other bank apps): details form → REVIEW page (all details
 * shown read-only) → user enters the security PIN on the review page →
 * transfer completes (with the email-OTP step for large amounts).
 */
import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Building2, Smartphone, Landmark, Globe2, CheckCircle2, ShieldCheck, ArrowLeft,
} from 'lucide-react';
import api from '../../services/api';
import {
  Screen, AppHeader, Card, PrimaryButton, Field, TextInput, OTPBoxes,
} from '../components/AppUI';

const fetcher = (url) => api.get(url).then((r) => r.data.data);

// Flag names MUST match the keys the backend's /payments/transfer-limit
// returns in transferMethods: { internal, imps, neft, upi, swift } — the same
// source the website's transfer page reads. The bank rail covers both IMPS
// and NEFT, so it's enabled when either is.
const RAILS = [
  { id: 'internal', label: 'Alister to Alister', icon: Building2, desc: 'Instant, free' },
  { id: 'upi', label: 'UPI', icon: Smartphone, desc: 'Pay any UPI ID', flags: ['upi'] },
  { id: 'bank', label: 'Bank Transfer', icon: Landmark, desc: 'IMPS / NEFT', flags: ['imps', 'neft'] },
  { id: 'swift', label: 'International', icon: Globe2, desc: 'SWIFT wire', flags: ['swift'] },
];

const RAIL_LABEL = { internal: 'Alister to Alister', upi: 'UPI', bank: 'Bank Transfer', swift: 'International (SWIFT)' };

// Supported SWIFT destination countries — mirrors the website's TransferPage
// (backend utils/swiftCountries.js is the source of truth; the server
// re-validates the code on submit).
const SWIFT_COUNTRIES = [
  { code: 'IN', name: 'India', eta: '1–3 business days' },
  { code: 'NP', name: 'Nepal', eta: '2–4 business days' },
  { code: 'BT', name: 'Bhutan', eta: '3–5 business days' },
  { code: 'BD', name: 'Bangladesh', eta: '2–4 business days' },
];

const newIdemKey = () =>
  (crypto.randomUUID && crypto.randomUUID()) || `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const fmtMoney = (v) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PayScreen() {
  const [rail, setRail] = useState('internal');
  // step: 'details' → 'review' (PIN entered here) → success screen
  const [step, setStep] = useState('details');
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [otpNeeded, setOtpNeeded] = useState(false);
  const [otp, setOtp] = useState('');
  const [idemKey, setIdemKey] = useState(newIdemKey);
  const [success, setSuccess] = useState(null);
  // Live lookups: UPI provider + IFSC bank/branch
  const [upiInfo, setUpiInfo] = useState(null);    // { verifiedProvider } | 'invalid' | null
  const [ifscInfo, setIfscInfo] = useState(null);  // { bank, branch, city } | 'invalid' | null

  const { data: limitInfo } = useSWR('/payments/transfer-limit', fetcher);
  const methods = limitInfo?.transferMethods || null;
  // Until flags load, don't lock the UI (backend enforces server-side anyway).
  const railEnabled = (r) => !r.flags || !methods || r.flags.some((f) => methods[f] === true);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── Debounced UPI provider lookup (shows the provider bank under the field) ─
  useEffect(() => {
    const vpa = (form.vpa || '').trim();
    if (rail !== 'upi' || !vpa.includes('@') || vpa.length < 5) { setUpiInfo(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        const { data: res } = await api.post('/payments/lookup-upi-provider', { vpa });
        setUpiInfo(res.data || res);
      } catch {
        setUpiInfo('invalid');
      }
    }, 450);
    return () => clearTimeout(t);
  }, [form.vpa, rail]);

  // ── Debounced IFSC lookup (shows bank + branch under the field) ─────────────
  useEffect(() => {
    const code = (form.ifsc || '').trim().toUpperCase();
    if (rail !== 'bank' || code.length !== 11) { setIfscInfo(null); return undefined; }
    const t = setTimeout(async () => {
      try {
        const { data: res } = await api.get(`/payments/verify-ifsc/${code}`);
        setIfscInfo(res.data || res);
      } catch {
        setIfscInfo('invalid');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [form.ifsc, rail]);

  const endpoint = useMemo(() => ({
    internal: '/payments/internal-transfer',
    upi: '/payments/disburse-payout',
    bank: '/payments/disburse-payout',
    swift: '/payments/swift-transfer',
  })[rail], [rail]);

  const bankMode = form.mode || (methods && methods.imps !== true ? 'NEFT' : 'IMPS');

  const buildPayload = () => {
    const base = {
      amount: form.amount,
      description: form.description || undefined,
      securityPin: form.securityPin,
      idempotencyKey: idemKey,
      ...(otp ? { otp } : {}),
    };
    if (rail === 'internal') {
      return { ...base, accountNumber: form.accountNumber, confirmAccountNumber: form.accountNumber, beneficiaryName: form.beneficiaryName };
    }
    if (rail === 'upi') {
      return { ...base, mode: 'UPI', vpa: form.vpa, beneficiaryName: form.beneficiaryName };
    }
    if (rail === 'bank') {
      return {
        ...base, mode: bankMode, beneficiaryName: form.beneficiaryName,
        accountNumber: form.accountNumber, confirmAccountNumber: form.accountNumber, ifsc: form.ifsc,
      };
    }
    return {
      ...base, beneficiaryName: form.beneficiaryName, accountNumber: form.accountNumber,
      confirmAccountNumber: form.accountNumber, swiftCode: form.swiftCode,
      beneficiaryBank: form.beneficiaryBank, country: form.country,
      // Phone number the post-approval SWIFT SMS goes to (matches the website form).
      notifyPhone: (form.notifyPhone || '').trim(),
    };
  };

  // Details-step completeness — PIN is NOT collected here; it lives on review.
  const detailsComplete = useMemo(() => {
    if (!form.amount || Number(form.amount) <= 0 || !form.beneficiaryName) return false;
    if (rail === 'internal') return !!form.accountNumber;
    if (rail === 'upi') return !!form.vpa && form.vpa.includes('@') && upiInfo !== 'invalid';
    if (rail === 'bank') return !!form.accountNumber && (form.ifsc || '').length === 11 && ifscInfo !== 'invalid';
    // SWIFT: same required fields as the website form — including the
    // supported destination country and the phone number for SMS updates.
    const phoneDigits = String(form.notifyPhone || '').replace(/\D/g, '');
    return !!form.accountNumber && !!form.swiftCode && !!form.beneficiaryBank
      && SWIFT_COUNTRIES.some((c) => c.code === form.country)
      && phoneDigits.length >= 10;
  }, [form, rail, upiInfo, ifscInfo]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post(endpoint, buildPayload());
      setSuccess(data.data || data);
      setOtpNeeded(false);
      setOtp('');
    } catch (err) {
      const res = err.response;
      // 428 → server demands an email OTP for this large transfer.
      if (res?.status === 428 || res?.data?.otpRequired) {
        if (!otpNeeded) {
          try { await api.post('/transactions/transfer-otp'); } catch { /* rate-limited: user can retry */ }
        }
        setOtpNeeded(true);
        setError(res?.data?.message || 'Enter the OTP sent to your email to confirm this transfer.');
      } else {
        setError(res?.data?.message || 'Transfer failed. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setForm({});
    setSuccess(null);
    setOtp('');
    setOtpNeeded(false);
    setError('');
    setStep('details');
    setUpiInfo(null);
    setIfscInfo(null);
    setIdemKey(newIdemKey());
  };

  // ─── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <Screen className="pb-24 flex flex-col">
        <AppHeader title="Transfer" />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <CheckCircle2 size={56} className="app-credit-text" aria-hidden="true" />
          <h2 className="text-lg font-bold">
            {success.status === 'pending' || success.requiresApproval
              ? 'Transfer submitted for approval'
              : 'Transfer successful'}
          </h2>
          <p className="app-dim text-sm text-pretty">
            {success.message || `Your transfer of ${fmtMoney(form.amount)} has been processed.`}
          </p>
          <PrimaryButton onClick={reset} className="mt-2">Make another transfer</PrimaryButton>
        </div>
      </Screen>
    );
  }

  // ─── Review + PIN step ───────────────────────────────────────────────────────
  if (step === 'review') {
    const rows = [
      ['Transfer type', RAIL_LABEL[rail]],
      ['Amount', fmtMoney(form.amount)],
      ['Beneficiary', form.beneficiaryName],
      ...(rail === 'internal' ? [['Account number', form.accountNumber]] : []),
      ...(rail === 'upi' ? [
        ['UPI ID', form.vpa],
        ...(upiInfo && upiInfo !== 'invalid' && upiInfo.verifiedProvider
          ? [['Provider', upiInfo.verifiedProvider]] : []),
      ] : []),
      ...(rail === 'bank' ? [
        ['Account number', form.accountNumber],
        ['IFSC', (form.ifsc || '').toUpperCase()],
        ...(ifscInfo && ifscInfo !== 'invalid'
          ? [['Bank', `${ifscInfo.bank} · ${ifscInfo.branch}`]] : []),
        ['Mode', bankMode],
      ] : []),
      ...(rail === 'swift' ? [
        ['Account / IBAN', form.accountNumber],
        ['SWIFT / BIC', form.swiftCode],
        ['Bank', form.beneficiaryBank],
        ['Country', SWIFT_COUNTRIES.find((c) => c.code === form.country)?.name || (form.country || '').toUpperCase()],
        ['SMS updates to', form.notifyPhone],
      ] : []),
      ...(form.description ? [['Description', form.description]] : []),
    ];

    return (
      <Screen className="pb-24">
        <AppHeader title="Confirm Transfer" />
        <div className="px-5 flex flex-col gap-4">
          <button type="button" onClick={() => { setStep('details'); setError(''); setOtpNeeded(false); setOtp(''); }}
            className="flex items-center gap-1.5 text-sm app-dim self-start">
            <ArrowLeft size={15} aria-hidden="true" /> Edit details
          </button>

          {/* Amount hero */}
          <Card className="app-balance-card text-center py-6">
            <p className="text-xs uppercase tracking-wide opacity-80">You are sending</p>
            <p className="text-3xl font-bold mt-1 tabular-nums">{fmtMoney(form.amount)}</p>
            <p className="text-sm mt-1 opacity-90">to {form.beneficiaryName}</p>
          </Card>

          {/* Read-only detail rows */}
          <Card className="divide-y p-0" style={{ borderColor: 'var(--app-border)' }}>
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="app-dim text-xs">{label}</span>
                <span className="text-sm font-medium text-right break-all">{value}</span>
              </div>
            ))}
          </Card>

          {/* PIN entry — the transfer only completes from here */}
          <Card className="flex flex-col gap-3">
            <Field label="Security PIN" hint="Enter your transaction PIN to authorize this transfer.">
              <TextInput type="password" inputMode="numeric" maxLength={6} placeholder="••••"
                value={form.securityPin || ''} onChange={set('securityPin')} />
            </Field>

            {otpNeeded && (
              <Field label="Email OTP" hint="Required for large transfers — check your inbox.">
                <OTPBoxes length={6} value={otp} onChange={setOtp} />
              </Field>
            )}

            {error && (
              <p className="text-sm" style={{ color: 'var(--app-danger)' }} role="alert">{error}</p>
            )}

            <PrimaryButton onClick={submit} loading={busy}
              disabled={!form.securityPin || form.securityPin.length < 4 || (otpNeeded && otp.length < 6)}>
              {otpNeeded ? 'Confirm with OTP' : `Pay ${fmtMoney(form.amount)}`}
            </PrimaryButton>
          </Card>

          <p className="flex items-center justify-center gap-1.5 text-xs app-dim pb-2">
            <ShieldCheck size={13} aria-hidden="true" />
            Protected by transaction PIN and OTP verification
          </p>
        </div>
      </Screen>
    );
  }

  // ─── Details step ────────────────────────────────────────────────────────────
  return (
    <Screen className="pb-24">
      <AppHeader title="Send Money" />

      {/* Rail selector */}
      <div className="px-5 grid grid-cols-2 gap-3" role="group" aria-label="Transfer type">
        {RAILS.map((r) => {
          const Icon = r.icon;
          const enabled = railEnabled(r);
          return (
            <button
              key={r.id}
              type="button"
              disabled={!enabled}
              onClick={() => { setRail(r.id); setError(''); setUpiInfo(null); setIfscInfo(null); }}
              className={`app-rail-tile ${rail === r.id ? 'app-rail-active' : ''} ${!enabled ? 'opacity-40' : ''}`}
              aria-pressed={rail === r.id}
            >
              <Icon size={20} aria-hidden="true" />
              <span className="text-xs font-semibold">{r.label}</span>
              <span className="app-dim text-[10px]">{enabled ? r.desc : 'Not enabled'}</span>
            </button>
          );
        })}
      </div>

      {/* Details form — no PIN here; it's collected on the review page */}
      <div className="px-5 mt-5 flex flex-col gap-4">
        <Field label="Amount">
          <TextInput type="number" inputMode="decimal" min="1" placeholder="0.00"
            value={form.amount || ''} onChange={set('amount')} />
        </Field>

        <Field label="Beneficiary name">
          <TextInput placeholder="Full name" value={form.beneficiaryName || ''} onChange={set('beneficiaryName')} />
        </Field>

        {rail === 'internal' && (
          <Field label="Alister account number">
            <TextInput inputMode="numeric" placeholder="Recipient account number"
              value={form.accountNumber || ''} onChange={set('accountNumber')} />
          </Field>
        )}

        {rail === 'upi' && (
          <>
            <Field label="UPI ID">
              <TextInput placeholder="name@bank" autoCapitalize="none"
                value={form.vpa || ''} onChange={set('vpa')} />
            </Field>
            {upiInfo === 'invalid' && (
              <p className="text-sm -mt-2" style={{ color: 'var(--app-danger)' }} role="alert">
                Enter a valid UPI ID (e.g. username@okaxis).
              </p>
            )}
            {upiInfo && upiInfo !== 'invalid' && upiInfo.verifiedProvider && (
              <p className="text-sm -mt-2 app-credit-text" role="status">
                {upiInfo.verifiedProvider}
              </p>
            )}
          </>
        )}

        {rail === 'bank' && (
          <>
            <Field label="Account number">
              <TextInput inputMode="numeric" placeholder="Beneficiary account number"
                value={form.accountNumber || ''} onChange={set('accountNumber')} />
            </Field>
            <Field label="IFSC code">
              <TextInput placeholder="e.g. HDFC0001234" autoCapitalize="characters" maxLength={11}
                value={form.ifsc || ''}
                onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))} />
            </Field>
            {ifscInfo === 'invalid' && (
              <p className="text-sm -mt-2" style={{ color: 'var(--app-danger)' }} role="alert">
                Invalid IFSC code — no matching bank branch found.
              </p>
            )}
            {ifscInfo && ifscInfo !== 'invalid' && (
              <p className="text-sm -mt-2 app-credit-text" role="status">
                {ifscInfo.bank} · {ifscInfo.branch}{ifscInfo.city ? `, ${ifscInfo.city}` : ''}
              </p>
            )}
            <Field label="Mode">
              <div className="flex gap-2" role="group" aria-label="Bank transfer mode">
                {['IMPS', 'NEFT'].map((m) => {
                  // Each mode is individually admin-gated (imps / neft keys).
                  const modeOn = !methods || methods[m.toLowerCase()] === true;
                  const active = bankMode === m;
                  return (
                    <button key={m} type="button" disabled={!modeOn}
                      className={`app-chip ${active && modeOn ? 'app-chip-active' : ''} ${!modeOn ? 'opacity-40' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, mode: m }))}
                      aria-pressed={active}>
                      {m}
                    </button>
                  );
                })}
              </div>
            </Field>
          </>
        )}

        {rail === 'swift' && (
          <>
            <Field label="Account number / IBAN">
              <TextInput placeholder="Beneficiary account or IBAN"
                value={form.accountNumber || ''} onChange={set('accountNumber')} />
            </Field>
            <Field label="SWIFT / BIC code">
              <TextInput placeholder="8 or 11 characters" autoCapitalize="characters"
                value={form.swiftCode || ''} onChange={set('swiftCode')} />
            </Field>
            <Field label="Beneficiary bank">
              <TextInput placeholder="Bank name" value={form.beneficiaryBank || ''} onChange={set('beneficiaryBank')} />
            </Field>
            <Field label="Country code">
              <TextInput placeholder="e.g. US" autoCapitalize="characters" maxLength={2}
                value={form.country || ''} onChange={set('country')} />
            </Field>
          </>
        )}

        <Field label="Description (optional)">
          <TextInput placeholder="What's this for?" value={form.description || ''} onChange={set('description')} />
        </Field>

        {error && (
          <p className="text-sm" style={{ color: 'var(--app-danger)' }} role="alert">{error}</p>
        )}

        <PrimaryButton onClick={() => { setStep('review'); setError(''); }} disabled={!detailsComplete}>
          Review transfer
        </PrimaryButton>

        <p className="flex items-center justify-center gap-1.5 text-xs app-dim pb-2">
          <ShieldCheck size={13} aria-hidden="true" />
          Protected by transaction PIN and OTP verification
        </p>
      </div>
    </Screen>
  );
}
