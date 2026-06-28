import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import {
  RiSendPlaneLine, RiCheckDoubleLine, RiArrowLeftLine, RiInformationLine,
  RiBankLine, RiSmartphoneLine, RiShieldCheckLine, RiLoader4Line,
  RiTimer2Line, RiCheckLine, RiErrorWarningLine, RiWallet3Line,
  RiExchangeLine, RiGroupLine, RiLockLine,
} from 'react-icons/ri';
import api from '../../services/api';
import { fetchAccount } from '../../store/slices/accountSlice';
import { fetchBeneficiaries } from '../../store/slices/transactionSlice';
import toast from 'react-hot-toast';

const CRIMSON = '#c8102e';

// RTGS removed per product spec. UPI + internal "Alister Internal" added.
const MODES = [
  { value: 'IMPS', label: 'IMPS', desc: 'Instant · 24/7 · Up to $2L', kind: 'bank', icon: RiBankLine },
  { value: 'NEFT', label: 'NEFT', desc: 'Batch settled · Any amount', kind: 'bank', icon: RiBankLine },
  { value: 'UPI', label: 'UPI Transfer', desc: 'Instant · Pay to any UPI ID', kind: 'upi', icon: RiSmartphoneLine },
  { value: 'ALISTER', label: 'Alister Internal', desc: 'Instant · Alister to Alister', kind: 'internal', icon: RiExchangeLine },
];

// Maps a UI mode to its per-user transfer-method flag key (see backend
// utils/transferMethods.js). IMPS/NEFT/UPI are locked by default; an admin must
// activate them per user. Internal ('ALISTER') is enabled by default.
const MODE_TO_KEY = { IMPS: 'imps', NEFT: 'neft', UPI: 'upi', ALISTER: 'internal' };

// Structural VPA check used to gate the debounced lookup.
const VPA_REGEX = /^[\w.\-]{2,}@[a-zA-Z][\w.\-]{1,}$/;
const fmtINR = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export default function TransferPage() {
  const dispatch = useDispatch();
  const { account } = useSelector((s) => s.account);
  const { beneficiaries = [] } = useSelector((s) => s.transaction);

  const [step, setStep] = useState('form'); // form | confirm | success
  const [mode, setMode] = useState('IMPS');
  const [form, setForm] = useState({
    beneficiaryName: '', accountNumber: '', confirmAccountNumber: '',
    ifsc: '', vpa: '', amount: '', description: '', securityPin: '',
  });
  const [selectedBeneficiary, setSelectedBeneficiary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  // ── Daily transfer-limit state (matte-black header chip) ──────────────────
  const [limitInfo, setLimitInfo] = useState(null); // { dailyTransferLimit, usedDailyLimit, remaining }

  // ── Real-time UPI provider lookup state ───────────────────────────────────
  const [vpaStatus, setVpaStatus] = useState('idle'); // idle | checking | verified | invalid
  const [vpaProvider, setVpaProvider] = useState('');
  const vpaDebounceRef = useRef(null);

  // ── Real-time IFSC branch verification state ──────────────────────────────
  const [ifscStatus, setIfscStatus] = useState('idle'); // idle | checking | verified | invalid
  const [ifscInfo, setIfscInfo] = useState(null); // { bank, branch, city }
  const ifscDebounceRef = useRef(null);

  const isUpi = mode === 'UPI';
  const isInternal = mode === 'ALISTER';

  // Per-user transfer-method locks (delivered by /payments/transfer-limit).
  // Until the limit info loads we don't lock the UI — the backend still
  // enforces every lock server-side regardless of what the client shows.
  const transferMethods = limitInfo?.transferMethods || null;
  const isModeEnabled = useCallback((m) => {
    if (!transferMethods) return true;
    const key = MODE_TO_KEY[m];
    return key ? transferMethods[key] === true : true;
  }, [transferMethods]);

  const loadLimit = useCallback(async () => {
    try {
      const { data } = await api.get('/payments/transfer-limit');
      setLimitInfo(data.data);
    } catch {
      // Fall back to the account slice values if the endpoint is unavailable.
      if (account?.daily_transfer_limit != null) {
        const limit = parseFloat(account.daily_transfer_limit);
        const used = parseFloat(account.daily_transferred || 0);
        const remaining = account.remaining_limit_today != null
          ? parseFloat(account.remaining_limit_today)
          : Math.max(limit - used, 0);
        setLimitInfo({ dailyTransferLimit: limit, usedDailyLimit: used, remaining });
      }
    }
  }, [account]);

  useEffect(() => {
    dispatch(fetchAccount());
    dispatch(fetchBeneficiaries());
    loadLimit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // ── Real-time IFSC branch verification (debounced 400ms; fires at 11 chars) ─
  // Reusable: called from the IFSC input handler AND when a saved beneficiary is
  // selected (so the branch lookup is triggered automatically per Step 2).
  const runIfscLookup = useCallback(async (rawCode) => {
    const code = String(rawCode || '').trim().toUpperCase();
    if (code.length !== 11) {
      setIfscStatus(code.length === 0 ? 'idle' : 'invalid');
      setIfscInfo(null);
      return;
    }
    setIfscStatus('checking');
    setIfscInfo(null);
    try {
      const { data } = await api.get(`/payments/verify-ifsc/${code}`);
      if (data?.data?.bank) {
        setIfscStatus('verified');
        setIfscInfo({ bank: data.data.bank, branch: data.data.branch, city: data.data.city });
      } else {
        setIfscStatus('invalid');
        setIfscInfo(null);
      }
    } catch {
      setIfscStatus('invalid');
      setIfscInfo(null);
    }
  }, []);

  const onIfscChange = (e) => {
    const value = e.target.value.toUpperCase();
    setForm((f) => ({ ...f, ifsc: value }));
    setIfscInfo(null);

    if (ifscDebounceRef.current) clearTimeout(ifscDebounceRef.current);

    if (value.length === 0) { setIfscStatus('idle'); return; }
    if (value.length < 11) { setIfscStatus('idle'); return; }
    // 11 chars reached → debounce the verification call.
    setIfscStatus('checking');
    ifscDebounceRef.current = setTimeout(() => runIfscLookup(value), 400);
  };

  // ── Saved-beneficiary quick-select ────────────────────────────────────────
  // Selecting a saved contact auto-fills name / account / confirm / IFSC, and
  // automatically triggers the Step-1 branch lookup for the populated IFSC.
  const onSelectBeneficiary = (e) => {
    const id = e.target.value;
    setSelectedBeneficiary(id);
    if (!id) return;
    const b = beneficiaries.find((x) => String(x.id) === String(id));
    if (!b) return;
    const savedIfsc = isInternal ? '' : (b.ifsc_code || '');
    setForm((f) => ({
      ...f,
      beneficiaryName: b.account_name || b.nickname || '',
      accountNumber: b.account_number || '',
      confirmAccountNumber: b.account_number || '',
      ifsc: savedIfsc,
    }));
    // Internal transfers don't use a routing IFSC; external rails verify it.
    if (!isInternal && savedIfsc) {
      runIfscLookup(savedIfsc);
    } else {
      setIfscStatus('idle');
      setIfscInfo(null);
    }
  };

  // ── Debounced UPI provider lookup (400ms) ─────────────────────────────────
  const onVpaChange = (e) => {
    const value = e.target.value.trim();
    setForm((f) => ({ ...f, vpa: value }));
    setVpaProvider('');

    if (vpaDebounceRef.current) clearTimeout(vpaDebounceRef.current);

    if (!VPA_REGEX.test(value)) {
      setVpaStatus('idle');
      return;
    }
    setVpaStatus('checking');
    vpaDebounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/payments/lookup-upi-provider', { vpa: value });
        if (data?.data?.verifiedProvider) {
          setVpaStatus('verified');
          setVpaProvider(data.data.verifiedProvider);
        } else {
          setVpaStatus('invalid');
        }
      } catch {
        setVpaStatus('invalid');
      }
    }, 400);
  };

  // Clean up the debounce timers on unmount.
  useEffect(() => () => {
    if (vpaDebounceRef.current) clearTimeout(vpaDebounceRef.current);
    if (ifscDebounceRef.current) clearTimeout(ifscDebounceRef.current);
  }, []);

  const switchMode = (m) => {
    // Guard: an admin must enable IMPS/NEFT/UPI before the user can pick them.
    if (!isModeEnabled(m)) {
      toast.error(`${m === 'ALISTER' ? 'Alister Internal' : m} is disabled on your account. Contact the bank to enable it.`);
      return;
    }
    setMode(m);
    setVpaStatus('idle');
    setVpaProvider('');
    setSelectedBeneficiary('');
    setIfscStatus('idle');
    setIfscInfo(null);
    // Internal transfers carry no routing IFSC; external rails clear it for entry.
    setForm((f) => ({ ...f, ifsc: m === 'ALISTER' ? '' : (m === 'UPI' ? '' : f.ifsc) }));
  };

  // If the currently-selected rail is locked for this user, jump to the first
  // enabled rail (internal/Alister is enabled by default).
  useEffect(() => {
    if (!transferMethods || isModeEnabled(mode)) return;
    const firstEnabled = MODES.find((m) => isModeEnabled(m.value));
    if (firstEnabled) {
      setMode(firstEnabled.value);
      setForm((f) => ({ ...f, ifsc: firstEnabled.value === 'ALISTER' || firstEnabled.value === 'UPI' ? '' : f.ifsc }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferMethods]);

  const validateForm = () => {
    if (!isModeEnabled(mode)) {
      toast.error(`${isInternal ? 'Alister Internal' : mode} is disabled on your account. Contact the bank to enable it.`);
      return false;
    }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return false; }
    if (account && amount > parseFloat(account.available_balance || 0)) {
      toast.error('Insufficient balance'); return false;
    }
    if (limitInfo && amount > limitInfo.remaining) {
      toast.error(`Exceeds remaining daily limit (${fmtINR(limitInfo.remaining)})`); return false;
    }
    if (isUpi) {
      if (!VPA_REGEX.test(form.vpa)) { toast.error('Enter a valid UPI ID (e.g. username@okaxis)'); return false; }
    } else {
      if (!form.beneficiaryName) { toast.error('Beneficiary name is required'); return false; }
      if (!form.accountNumber) { toast.error('Account number is required'); return false; }
      if (form.accountNumber !== form.confirmAccountNumber) { toast.error('Account numbers do not match'); return false; }
      if (isInternal) {
        // Internal transfers route on the account number; IFSC is auto-pinned.
        if (account && String(form.accountNumber) === String(account.account_number)) {
          toast.error('You cannot transfer to your own account'); return false;
        }
      } else if (!/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(form.ifsc.trim())) {
        toast.error('Enter a valid IFSC code'); return false;
      }
    }
    return true;
  };

  const handleReview = () => {
    if (!validateForm()) return;
    setStep('confirm');
  };

  const handleSubmit = async () => {
    if (!form.securityPin || form.securityPin.length !== 4) {
      toast.error('Enter your 4-digit security PIN'); return;
    }
    setSubmitting(true);
    try {
      let endpoint;
      let payload;

      if (isInternal) {
        // On-us Alister transfer → dedicated internal route (no external gateway).
        endpoint = '/payments/internal-transfer';
        payload = {
          mode: 'ALISTER',
          amount: parseFloat(form.amount),
          accountNumber: form.accountNumber,
          confirmAccountNumber: form.confirmAccountNumber,
          beneficiaryName: form.beneficiaryName,
          description: form.description,
          securityPin: form.securityPin,
        };
      } else {
        endpoint = '/payments/disburse-payout';
        payload = {
          mode,
          amount: parseFloat(form.amount),
          description: form.description,
          securityPin: form.securityPin,
          ...(isUpi
            ? { vpa: form.vpa.trim(), beneficiaryName: form.beneficiaryName || 'UPI Beneficiary' }
            : {
              beneficiaryName: form.beneficiaryName,
              accountNumber: form.accountNumber,
              confirmAccountNumber: form.confirmAccountNumber,
              ifsc: form.ifsc.trim().toUpperCase(),
            }),
        };
      }

      const { data } = await api.post(endpoint, payload);
      setResult(data.data);
      setStep('success');
      dispatch(fetchAccount());
      loadLimit();
      toast.success(data.message || 'Transfer submitted');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Transfer failed. Please try again.');
      setStep('form');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setForm({
      beneficiaryName: '', accountNumber: '', confirmAccountNumber: '',
      ifsc: '', vpa: '', amount: '', description: '', securityPin: '',
    });
    setSelectedBeneficiary('');
    setResult(null);
    setVpaStatus('idle');
    setVpaProvider('');
    setIfscStatus('idle');
    setIfscInfo(null);
    setMode('IMPS');
    setStep('form');
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success' && result) {
    const isPending = result.status === 'pending_settlement';
    return (
      <div className="max-w-md mx-auto">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="glass-card p-10 text-center">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 border-2 ${
              isPending ? 'bg-amber-500/10 border-amber-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
              {isPending
                ? <RiTimer2Line className="text-amber-400 text-4xl" />
                : <RiCheckDoubleLine className="text-green-400 text-4xl" />}
            </div>
          </motion.div>
          <h2 className="font-display text-2xl font-700 text-white mb-2">
            {isPending ? 'NEFT Transfer Initiated' : 'Transfer Successful!'}
          </h2>
          <p className="text-dark-200 text-sm mb-4">
            {isPending
              ? `${fmtINR(result.amount)} has been initiated and typically completes ${result.etaLabel || 'within a couple of hours'}. You'll get an email as soon as it's done.`
              : `${fmtINR(result.amount)} sent successfully.${result.recipientName ? ` to ${result.recipientName}` : ''}`}
          </p>
          <div className="bg-dark-700/50 rounded-xl p-4 mb-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-dark-300">Reference</span>
              <span className="text-white font-mono text-xs">{result.referenceNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dark-300">Mode</span>
              <span className="text-white font-medium">{result.mode}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dark-300">Status</span>
              <span className={isPending ? 'text-amber-400 font-medium' : 'text-green-400 font-medium'}>
                {isPending ? 'Pending Settlement' : 'Completed'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dark-300">New Balance</span>
              <span className="text-white font-bold">{fmtINR(result.balance)}</span>
            </div>
          </div>
          <button onClick={resetAll} className="btn-primary w-full justify-center">New Transfer</button>
        </motion.div>
      </div>
    );
  }

  const remaining = limitInfo?.remaining ?? null;
  const dailyLimit = limitInfo?.dailyTransferLimit ?? (account ? parseFloat(account.daily_transfer_limit || 0) : null);
  const usedToday = limitInfo?.usedDailyLimit ?? (account ? parseFloat(account.daily_transferred || 0) : null);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Header + matte-black daily-limit statistics container */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="page-title">Transfer Money</h1>
          <p className="text-dark-300 text-sm mt-0.5">Send money via IMPS, NEFT, UPI, or Alister Internal</p>
        </div>
        {dailyLimit != null && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl px-4 py-2.5 border"
            style={{ background: '#0d0e12', borderColor: 'rgba(200,16,46,0.35)', boxShadow: `0 0 18px ${CRIMSON}22` }}>
            <div className="flex items-center gap-2">
              <RiWallet3Line style={{ color: CRIMSON }} />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-dark-300">Daily Transfer Limit</p>
                <p className="text-white font-bold text-sm tabular-nums">
                  {fmtINR(dailyLimit)}
                  {usedToday == null && <span className="text-dark-400 font-normal"> (Default)</span>}
                </p>
                {remaining != null && (
                  <p className="text-[11px] mt-0.5" style={{ color: '#ff6b81' }}>
                    {usedToday != null ? `${fmtINR(usedToday)} used · ` : ''}{fmtINR(remaining)} remaining today
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="glass-card p-6">
        <AnimatePresence mode="wait">
          {step === 'form' && (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Mode tabs */}
              <div className="mb-5">
                <label className="form-label">Transfer Mode</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MODES.map((m) => {
                    const Icon = m.icon;
                    const active = mode === m.value;
                    const locked = !isModeEnabled(m.value);
                    return (
                      <button key={m.value} type="button" onClick={() => switchMode(m.value)}
                        disabled={locked} aria-disabled={locked}
                        title={locked ? 'Disabled on your account — contact the bank to enable' : undefined}
                        className={`relative p-3 rounded-xl border transition-all text-left ${
                          locked ? 'border-white/[0.06] opacity-50 cursor-not-allowed'
                            : active ? 'border-brand-500 bg-brand-500/10' : 'border-white/[0.08] hover:border-white/20'}`}>
                        {locked && (
                          <span className="absolute top-2 right-2 text-dark-300" title="Disabled">
                            <RiLockLine className="text-xs" />
                          </span>
                        )}
                        <Icon className={active && !locked ? 'text-brand-400' : 'text-dark-300'} />
                        <p className={`text-sm font-bold mt-1 ${active && !locked ? 'text-brand-400' : 'text-white'}`}>{m.label}</p>
                        <p className="text-dark-400 text-[10px] mt-0.5 leading-tight">
                          {locked ? 'Disabled · contact bank' : m.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* UPI tab */}
              {isUpi ? (
                <div className="mb-4">
                  <label className="form-label">Enter UPI ID / VPA</label>
                  <input type="text" value={form.vpa} onChange={onVpaChange}
                    placeholder="e.g. username@okaxis" className="input-field" autoComplete="off" />
                  {/* Real-time provider feedback */}
                  <div className="min-h-[22px] mt-1.5">
                    {vpaStatus === 'checking' && (
                      <p className="text-dark-300 text-xs flex items-center gap-1.5">
                        <RiLoader4Line className="animate-spin" /> Looking up provider…
                      </p>
                    )}
                    {vpaStatus === 'verified' && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                        <RiCheckLine /> {vpaProvider}
                      </span>
                    )}
                    {vpaStatus === 'invalid' && (
                      <p className="text-xs flex items-center gap-1.5" style={{ color: '#ff6b81' }}>
                        <RiErrorWarningLine /> Could not resolve this UPI ID.
                      </p>
                    )}
                  </div>
                  {/* Optional beneficiary name for UPI */}
                  <div className="mt-3">
                    <label className="form-label">Beneficiary Name (optional)</label>
                    <input type="text" value={form.beneficiaryName} onChange={set('beneficiaryName')}
                      placeholder="Name to label this payout" className="input-field" />
                  </div>
                </div>
              ) : (
                /* Bank (IMPS / NEFT) + Alister Transfer share the account layout */
                <div className="space-y-4 mb-4">
                  {/* Saved-beneficiary quick-select */}
                  <div>
                    <label className="form-label flex items-center gap-1.5">
                      <RiGroupLine /> Select From Saved Beneficiaries
                    </label>
                    <select value={selectedBeneficiary} onChange={onSelectBeneficiary}
                      className="input-field cursor-pointer">
                      <option value="">— Choose a saved beneficiary —</option>
                      {beneficiaries.map((b) => (
                        <option key={b.id} value={b.id}>
                          {(b.nickname || b.account_name)} · ••••{String(b.account_number).slice(-4)}
                        </option>
                      ))}
                    </select>
                    {beneficiaries.length === 0 && (
                      <p className="text-dark-400 text-[11px] mt-1">No saved beneficiaries yet — enter details below.</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="form-label">Beneficiary Name</label>
                      <input type="text" value={form.beneficiaryName} onChange={set('beneficiaryName')}
                        placeholder="Full name as per bank" className="input-field" />
                    </div>
                    <div>
                      <label className="form-label">
                        {isInternal ? 'Alister Account Number' : 'Bank Account Number'}
                      </label>
                      <input type="text" value={form.accountNumber} onChange={set('accountNumber')}
                        placeholder={isInternal
                          ? "Enter recipient's Alister Account Number (e.g., ALBXXXX)"
                          : 'Recipient account number'}
                        className="input-field" autoComplete="off" />
                    </div>
                    <div>
                      <label className="form-label">Confirm Account Number</label>
                      <input type="text" value={form.confirmAccountNumber} onChange={set('confirmAccountNumber')}
                        placeholder="Re-enter account number" className="input-field" autoComplete="off"
                        onPaste={(e) => e.preventDefault()} />
                      {form.confirmAccountNumber && form.accountNumber !== form.confirmAccountNumber && (
                        <p className="text-xs mt-1" style={{ color: '#ff6b81' }}>Account numbers do not match</p>
                      )}
                    </div>

                    {/* IFSC field — fully hidden for internal Alister transfers
                        (no routing code needed); shown with real-time branch
                        verification for IMPS / NEFT. */}
                    {!isInternal && (
                      <div className="sm:col-span-2">
                        <label className="form-label">IFSC Code</label>
                        <input type="text" value={form.ifsc} onChange={onIfscChange}
                          placeholder="HDFC0001234" maxLength={11}
                          className="input-field uppercase" autoComplete="off" />
                        {/* Real-time IFSC verification sub-badge */}
                        <div className="min-h-[20px] mt-1.5">
                          {ifscStatus === 'checking' && (
                            <p className="text-dark-300 text-xs flex items-center gap-1.5">
                              <RiLoader4Line className="animate-spin" /> Verifying IFSC…
                            </p>
                          )}
                          {ifscStatus === 'verified' && ifscInfo && (
                            <p className="text-xs font-medium" style={{ color: '#22c55e' }}>
                              ✔ Verified: {ifscInfo.bank} — {ifscInfo.branch} Branch
                              {ifscInfo.city ? `, ${ifscInfo.city}` : ''}
                            </p>
                          )}
                          {ifscStatus === 'invalid' && (
                            <p className="text-xs font-medium" style={{ color: '#ff6b81' }}>
                              ⚠ Invalid IFSC Code structure
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {isInternal && (
                      <div className="sm:col-span-2">
                        <p className="text-dark-400 text-[11px] flex items-center gap-1">
                          <RiInformationLine /> Internal Alister transfers route by account number — no IFSC needed.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Amount + description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                <div>
                  <label className="form-label">Amount ($)</label>
                  <input type="number" value={form.amount} onChange={set('amount')}
                    placeholder="0.00" min="1" className="input-field" />
                  {account && (
                    <p className="text-dark-400 text-xs mt-1">
                      Available: {fmtINR(account.available_balance)}
                    </p>
                  )}
                </div>
                <div>
                  <label className="form-label">Description / Narration</label>
                  <input type="text" value={form.description} onChange={set('description')}
                    placeholder="Optional note" className="input-field" maxLength={30} />
                </div>
              </div>

              <button onClick={handleReview} className="btn-primary w-full py-3.5">
                <RiSendPlaneLine /> Review Transfer
              </button>
            </motion.div>
          )}

          {step === 'confirm' && (
            <motion.div key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
              <h3 className="text-white font-semibold text-lg mb-5">Confirm Transfer</h3>
              <div className="space-y-0 rounded-2xl overflow-hidden border border-white/[0.06]">
                {(isUpi
                  ? [
                    { label: 'UPI ID', value: form.vpa },
                    { label: 'Provider', value: vpaProvider || 'UPI' },
                    { label: 'Mode', value: 'UPI' },
                    { label: 'Description', value: form.description || 'Transfer' },
                  ]
                  : [
                    { label: 'Beneficiary', value: form.beneficiaryName },
                    { label: isInternal ? 'Alister Account' : 'Account', value: form.accountNumber },
                    ...(isInternal ? [] : [{ label: 'IFSC', value: form.ifsc.toUpperCase() }]),
                    ...(isInternal || !ifscInfo ? [] : [{ label: 'Bank', value: `${ifscInfo.bank} — ${ifscInfo.branch}` }]),
                    { label: 'Mode', value: isInternal ? 'Alister Internal' : mode },
                    { label: 'Description', value: form.description || 'Transfer' },
                  ]
                ).map(({ label, value }) => (
                  <div key={label} className="flex justify-between px-4 py-3.5 border-b border-white/[0.05] last:border-0">
                    <span className="text-dark-300 text-sm">{label}</span>
                    <span className="text-white text-sm font-medium text-right break-all ml-3">{value}</span>
                  </div>
                ))}
                <div className="flex justify-between px-4 py-4 bg-brand-500/10">
                  <span className="text-white font-bold">Amount</span>
                  <span className="font-bold text-xl" style={{ color: '#ff4060' }}>
                    {fmtINR(form.amount)}
                  </span>
                </div>
              </div>

              {/* Security PIN */}
              <div className="bg-dark-700/50 rounded-xl p-4 my-5">
                <label className="form-label">Security PIN</label>
                <input type="password" inputMode="numeric" maxLength={4} value={form.securityPin}
                  onChange={set('securityPin')} placeholder="Enter 4-digit PIN" className="input-field" />
                <p className="text-dark-400 text-xs mt-1.5 flex items-center gap-1">
                  <RiShieldCheckLine /> Your PIN authorizes this transfer
                </p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('form')} disabled={submitting}
                  className="btn-secondary flex-1 justify-center">
                  <RiArrowLeftLine /> Edit
                </button>
                <button onClick={handleSubmit} disabled={submitting} className="btn-primary flex-1 justify-center">
                  {submitting ? <><RiLoader4Line className="animate-spin" /> Processing…</> : <><RiSendPlaneLine /> Confirm Transfer</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer note */}
      <p className="text-center text-dark-400 text-[11px] flex items-center justify-center gap-1.5">
        <RiInformationLine /> 🔒 Secured by Alister Bank Core Ecosystem
      </p>
    </div>
  );
}
