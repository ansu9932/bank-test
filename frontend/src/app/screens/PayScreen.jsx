/**
 * Pay — all four REAL transfer rails: internal Alister transfer, UPI payout,
 * bank payout (IMPS/NEFT), and SWIFT international. Reuses the exact backend
 * contracts the website's TransferPage uses (idempotency key + 428 OTP step).
 */
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Building2, Smartphone, Landmark, Globe2, CheckCircle2, ShieldCheck,
} from 'lucide-react';
import api from '../../services/api';
import {
  Screen, AppHeader, Card, PrimaryButton, Field, TextInput, OTPBoxes,
} from '../components/AppUI';

const fetcher = (url) => api.get(url).then((r) => r.data.data);

const RAILS = [
  { id: 'internal', label: 'Alister to Alister', icon: Building2, desc: 'Instant, free' },
  { id: 'upi', label: 'UPI', icon: Smartphone, desc: 'Pay any UPI ID', flag: 'upi_enabled' },
  { id: 'bank', label: 'Bank Transfer', icon: Landmark, desc: 'IMPS / NEFT', flag: 'imps_enabled' },
  { id: 'swift', label: 'International', icon: Globe2, desc: 'SWIFT wire', flag: 'swift_enabled' },
];

const newIdemKey = () =>
  (crypto.randomUUID && crypto.randomUUID()) || `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function PayScreen() {
  const [rail, setRail] = useState('internal');
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [otpNeeded, setOtpNeeded] = useState(false);
  const [otp, setOtp] = useState('');
  const [idemKey, setIdemKey] = useState(newIdemKey);
  const [success, setSuccess] = useState(null);

  const { data: limitInfo } = useSWR('/payments/transfer-limit', fetcher);
  const methods = limitInfo?.transferMethods || null;
  const railEnabled = (r) => !r.flag || !methods || methods[r.flag] === true;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const endpoint = useMemo(() => ({
    internal: '/payments/internal-transfer',
    upi: '/payments/disburse-payout',
    bank: '/payments/disburse-payout',
    swift: '/payments/swift-transfer',
  })[rail], [rail]);

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
        ...base, mode: form.mode || 'IMPS', beneficiaryName: form.beneficiaryName,
        accountNumber: form.accountNumber, confirmAccountNumber: form.accountNumber, ifsc: form.ifsc,
      };
    }
    return {
      ...base, beneficiaryName: form.beneficiaryName, accountNumber: form.accountNumber,
      confirmAccountNumber: form.accountNumber, swiftCode: form.swiftCode,
      beneficiaryBank: form.beneficiaryBank, country: form.country,
    };
  };

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
    setIdemKey(newIdemKey());
  };

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
            {success.message || `Your transfer of $${form.amount} has been processed.`}
          </p>
          <PrimaryButton onClick={reset} className="mt-2">Make another transfer</PrimaryButton>
        </div>
      </Screen>
    );
  }

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
              onClick={() => { setRail(r.id); setError(''); setOtpNeeded(false); }}
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

      {/* Form */}
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
          <Field label="UPI ID">
            <TextInput placeholder="name@bank" autoCapitalize="none"
              value={form.vpa || ''} onChange={set('vpa')} />
          </Field>
        )}

        {rail === 'bank' && (
          <>
            <Field label="Account number">
              <TextInput inputMode="numeric" placeholder="Beneficiary account number"
                value={form.accountNumber || ''} onChange={set('accountNumber')} />
            </Field>
            <Field label="IFSC code">
              <TextInput placeholder="e.g. HDFC0001234" autoCapitalize="characters"
                value={form.ifsc || ''} onChange={set('ifsc')} />
            </Field>
            <Field label="Mode">
              <div className="flex gap-2" role="group" aria-label="Bank transfer mode">
                {['IMPS', 'NEFT'].map((m) => (
                  <button key={m} type="button"
                    className={`app-chip ${(form.mode || 'IMPS') === m ? 'app-chip-active' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, mode: m }))}
                    aria-pressed={(form.mode || 'IMPS') === m}>
                    {m}
                  </button>
                ))}
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

        <Field label="Security PIN">
          <TextInput type="password" inputMode="numeric" placeholder="Your transaction PIN"
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
          disabled={!form.amount || !form.securityPin || (otpNeeded && otp.length < 6)}>
          {otpNeeded ? 'Confirm with OTP' : 'Send Money'}
        </PrimaryButton>

        <p className="flex items-center justify-center gap-1.5 text-xs app-dim pb-2">
          <ShieldCheck size={13} aria-hidden="true" />
          Protected by transaction PIN and OTP verification
        </p>
      </div>
    </Screen>
  );
}
