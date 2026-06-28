import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  RiBankLine, RiShieldCheckLine, RiCheckLine, RiLoader4Line,
  RiBankCardLine, RiLock2Line, RiErrorWarningLine,
} from 'react-icons/ri';
import toast from 'react-hot-toast';
import api from '../../services/api';
import BackToHome from '../../components/common/BackToHome';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · ACTIVATION DEPOSIT
   Onboarding step shown after Video KYC approval. The user is asked to deposit
   the minimum balance to activate their account. A deposit is only accepted
   when the entered card matches the admin-managed approved cards list.
   ────────────────────────────────────────────────────────────────────────── */

const CRIMSON = '#c8102e';
const PAGE_BG = { background: 'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 50%, #2D0000 100%)' };

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Group a card number into 4-digit blocks for display.
const groupCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();

// Small promise-based delay used to pace the realistic payment animation.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Detect the card network from the leading digits (display only).
const detectNetwork = (digits) => {
  const d = String(digits || '');
  if (/^4/.test(d)) return 'Visa';
  const two = parseInt(d.slice(0, 2), 10);
  const four = parseInt(d.slice(0, 4), 10);
  if ((two >= 51 && two <= 55) || (four >= 2221 && four <= 2720)) return 'Mastercard';
  if (/^3[47]/.test(d)) return 'American Express';
  if (/^6(?:011|5)/.test(d)) return 'Discover';
  if (/^(60|65|81|82|508)/.test(d)) return 'RuPay';
  return 'Card';
};

// The staged sequence shown in the processing overlay — mirrors a real card
// gateway: encrypt → contact the network → request issuer authorization →
// credit. The network name is interpolated so it reads authentically.
const buildPaymentSteps = (network) => [
  { key: 'enc',    label: 'Encrypting card details',      sub: 'AES-256 secure channel' },
  { key: 'net',    label: `Contacting ${network} network`, sub: 'Establishing secure link' },
  { key: 'auth',   label: 'Requesting authorization',     sub: 'Awaiting issuing-bank approval' },
  { key: 'credit', label: 'Crediting your account',       sub: 'Finalizing your deposit' },
];

// ─── Realistic payment-processing overlay ────────────────────────────────────
// Full-screen modal that walks through the gateway stages with live spinners
// that tick over to green checks, then either completes or shows a card-style
// "declined" state with Try Again / Edit Card actions.
function ProcessingOverlay({ amount, network, last4, step, steps, error, onRetry, onClose }) {
  const allDone = step >= steps.length;
  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      style={{ background: 'rgba(5,5,7,0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <motion.div
        initial={{ scale: 0.94, y: 12, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="w-full max-w-sm rounded-3xl p-6 sm:p-7"
        style={{ background: '#15161c', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 30px 90px rgba(0,0,0,0.65)' }}>

        {/* Amount + card chip */}
        <div className="text-center mb-5">
          <p className="text-white/45 text-[11px] uppercase tracking-[0.2em]">
            {error ? 'Transaction status' : 'Authorizing payment'}
          </p>
          <p className="text-white text-3xl font-bold mt-1 tabular-nums">{fmt(amount)}</p>
          <div className="inline-flex items-center gap-2 mt-2 text-white/55 text-xs">
            <RiBankCardLine style={{ color: '#ff3d52' }} />
            <span>{network} •••• {last4 || '••••'}</span>
          </div>
        </div>

        {!error ? (
          <div className="space-y-2.5">
            {steps.map((s, i) => {
              const done = allDone || i < step;
              const active = !allDone && i === step;
              return (
                <motion.div key={s.key}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{
                    background: active ? 'rgba(204,0,0,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${active ? 'rgba(204,0,0,0.30)' : 'rgba(255,255,255,0.06)'}`,
                  }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: done ? 'rgba(34,197,94,0.15)' : active ? 'rgba(204,0,0,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${done ? 'rgba(34,197,94,0.5)' : active ? 'rgba(204,0,0,0.5)' : 'rgba(255,255,255,0.12)'}`,
                    }}>
                    {done
                      ? <RiCheckLine className="text-green-400 text-sm" />
                      : active
                        ? <RiLoader4Line className="animate-spin text-sm" style={{ color: '#ff3d52' }} />
                        : <span className="w-1.5 h-1.5 rounded-full bg-white/25" />}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${done || active ? 'text-white' : 'text-white/40'}`}>{s.label}</p>
                    <p className="text-[11px] text-white/35">{s.sub}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-1">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.5)' }}>
              <RiErrorWarningLine className="text-2xl text-red-400" />
            </div>
            <p className="text-white font-semibold mb-1">Payment could not be completed</p>
            <p className="text-white/55 text-sm mb-5">{error}</p>
            <div className="flex gap-3">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border text-white/80 transition-all active:scale-[0.98]"
                style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}>
                Edit Card
              </button>
              <button onClick={onRetry}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #c8102e, #850a1e)' }}>
                Try Again
              </button>
            </div>
          </div>
        )}

        {!error && (
          <div className="flex items-center justify-center gap-2 mt-5 text-white/35 text-[11px]">
            <RiLock2Line style={{ color: '#22c55e' }} />
            <span>Secure encrypted transaction · please don’t close this window</span>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function ActivateDepositPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [phase, setPhase] = useState('loading'); // loading | invalid | form | done
  const [info, setInfo] = useState(null);        // { accountNumber, holderName, minimumDeposit }
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const [card, setCard] = useState({ cardNumber: '', cardHolder: '', expiry: '', cvv: '' });
  const [amount, setAmount] = useState('');

  // Realistic payment-processing animation state.
  const [procStep, setProcStep] = useState(0);    // 0..steps.length (=== length → all done)
  const [procError, setProcError] = useState(null);

  // Derived (display) values for the processing overlay.
  const cardDigits = card.cardNumber.replace(/\D/g, '');
  const network = detectNetwork(cardDigits);
  const last4 = cardDigits.slice(-4);
  const paymentSteps = buildPaymentSteps(network);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) { setPhase('invalid'); return; }
      try {
        const { data } = await api.get(`/account/activation-deposit/verify/${token}`);
        if (!active) return;
        const d = data?.data;
        setInfo(d);
        setAmount(String(d?.minimumDeposit ?? ''));
        if (d?.alreadyDeposited) { setPhase('done'); setResult({ alreadyDeposited: true }); }
        else setPhase('form');
      } catch (err) {
        if (!active) return;
        setPhase('invalid');
        toast.error(err.response?.data?.message || 'This activation link is invalid or expired.');
      }
    })();
    return () => { active = false; };
  }, [token]);

  const setExpiry = (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`;
    setCard((c) => ({ ...c, expiry: v }));
  };

  const submit = async () => {
    const digits = card.cardNumber.replace(/\D/g, '');
    if (digits.length < 12) { toast.error('Enter a valid card number.'); return; }
    if (!card.cardHolder.trim()) { toast.error('Enter the cardholder name.'); return; }
    if (!/^\d{2}\/\d{2}$/.test(card.expiry)) { toast.error('Enter a valid expiry (MM/YY).'); return; }
    if (!/^\d{3,4}$/.test(card.cvv)) { toast.error('Enter a valid CVV.'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt < (info?.minimumDeposit || 0)) {
      toast.error(`Minimum activation deposit is ${fmt(info?.minimumDeposit)}.`);
      return;
    }

    // Open the live processing overlay from the first stage.
    setProcError(null);
    setProcStep(0);
    setSubmitting(true);

    // Fire the REAL request immediately and capture its outcome without throwing
    // (so we can pace the UI independently of network speed).
    const request = api.post('/account/activation-deposit/submit', {
      token,
      cardNumber: digits,
      cardHolder: card.cardHolder.trim(),
      expiry: card.expiry,
      cvv: card.cvv,
      amount: amt,
    })
      .then((res) => ({ ok: true, data: res.data?.data || {} }))
      .catch((err) => ({
        ok: false,
        message: err.response?.data?.message
          || 'Your card could not be processed. Please check the details and try again.',
      }));

    // Walk the first three gateway stages (encrypt → network → authorize) with
    // lifelike pacing so it feels like a genuine authorization request.
    const stageDelays = [1000, 1300, 1500];
    for (let i = 0; i < stageDelays.length; i += 1) {
      setProcStep(i);
      // eslint-disable-next-line no-await-in-loop
      await wait(stageDelays[i] + Math.random() * 350);
    }

    // Now reconcile with the real server result.
    const outcome = await request;

    if (outcome.ok) {
      setProcStep(3);          // "Crediting your account…"
      await wait(1100);
      setProcStep(4);          // all stages complete (green checks)
      await wait(600);
      setResult(outcome.data);
      setSubmitting(false);
      setPhase('done');
      toast.success('Activation deposit received!');
    } else {
      // Keep the overlay open and show a realistic decline state.
      setProcError(outcome.message);
    }
  };

  // Retry from the decline state — re-runs the full sequence with the same card.
  const retryPayment = () => { setProcError(null); submit(); };
  // Dismiss the overlay to edit the card details.
  const cancelProcessing = () => { setProcError(null); setSubmitting(false); setProcStep(0); };

  // Reusable secure-payment trust badge.
  const TrustBadge = (
    <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium"
      style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#22c55e' }}>
      <RiShieldCheckLine /> Secure encrypted payment
    </div>
  );

  return (
    <div className="min-h-screen py-10 px-4 relative" style={PAGE_BG}>
      <BackToHome />

      {/* Live card-processing overlay (shows while submitting or on decline). */}
      {phase === 'form' && (submitting || procError) && (
        <ProcessingOverlay
          amount={parseFloat(amount) || 0}
          network={network}
          last4={last4}
          step={procStep}
          steps={paymentSteps}
          error={procError}
          onRetry={retryPayment}
          onClose={cancelProcessing}
        />
      )}

      <div className="relative z-[1] max-w-lg mx-auto">

        {/* Brand */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 18px rgba(204,0,0,0.4)' }}>
            <RiBankLine className="text-white text-xl" />
          </div>
          <p className="font-bold text-white tracking-wide text-lg">ALISTER BANK</p>
        </div>

        {phase === 'loading' && (
          <div className="flex flex-col items-center justify-center py-24 text-white/70">
            <RiLoader4Line className="animate-spin text-3xl mb-3" style={{ color: '#ff3d52' }} />
            Verifying your activation link…
          </div>
        )}

        {phase === 'invalid' && (
          <div className="rounded-[20px] p-8 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderTop: '2px solid rgba(204,0,0,0.5)' }}>
            <h2 className="text-xl font-bold text-white mb-2">Activation link invalid</h2>
            <p className="text-white/50 text-sm mb-6">This activation link is invalid or has expired. Please contact support for a new one.</p>
            <Link to="/login" className="inline-block px-6 py-3 rounded-xl text-white font-semibold text-sm"
              style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)` }}>Go to Login</Link>
          </div>
        )}

        {phase === 'form' && info && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-[20px] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderTop: '2px solid rgba(204,0,0,0.5)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>

            <div className="p-6 sm:p-8">
              <div className="text-center mb-5">
                <h1 className="text-xl sm:text-2xl font-bold text-white">Activate Your Account</h1>
                <p className="text-white/50 text-sm mt-1">Deposit the minimum balance to activate your account.</p>
                <div className="mt-3 flex justify-center">{TrustBadge}</div>
              </div>

              {/* Destination account card — which account is being funded */}
              <div className="rounded-2xl p-5 mb-6 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #c8102e 0%, #8b0000 55%, #3d0010 100%)' }}>
                <div className="absolute -top-6 -right-6 w-28 h-28 rounded-full bg-white/[0.05]" />
                <p className="text-white/70 text-[11px] uppercase tracking-widest">Funding Account</p>
                <p className="text-white font-mono text-lg tracking-widest mt-1">{info.accountNumber}</p>
                <div className="flex items-end justify-between mt-4">
                  <div>
                    <p className="text-white/50 text-[10px] uppercase tracking-widest">Account Holder</p>
                    <p className="text-white text-sm font-medium uppercase tracking-wide">{info.holderName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white/50 text-[10px] uppercase tracking-widest">Min. Deposit</p>
                    <p className="text-white text-sm font-semibold">{fmt(info.minimumDeposit)}</p>
                  </div>
                </div>
              </div>

              {/* Card section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
                  <RiBankCardLine style={{ color: '#ff3d52' }} /> Pay with Credit Card
                </div>

                <div>
                  <label className="block text-white/50 text-xs mb-1.5">Card Number</label>
                  <input value={card.cardNumber} onChange={(e) => setCard((c) => ({ ...c, cardNumber: groupCard(e.target.value) }))}
                    inputMode="numeric" placeholder="1234 5678 9012 3456"
                    className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl px-4 py-3 text-white tracking-widest outline-none focus:border-brand-500 font-mono" />
                </div>

                <div>
                  <label className="block text-white/50 text-xs mb-1.5">Cardholder Name</label>
                  <input value={card.cardHolder} onChange={(e) => setCard((c) => ({ ...c, cardHolder: e.target.value }))}
                    placeholder="Name on card"
                    className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl px-4 py-3 text-white outline-none focus:border-brand-500" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/50 text-xs mb-1.5">Expiry (MM/YY)</label>
                    <input value={card.expiry} onChange={setExpiry} inputMode="numeric" placeholder="MM/YY"
                      className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl px-4 py-3 text-white outline-none focus:border-brand-500 font-mono" />
                  </div>
                  <div>
                    <label className="block text-white/50 text-xs mb-1.5">CVV</label>
                    <input value={card.cvv} onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                      inputMode="numeric" placeholder="•••" type="password"
                      className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl px-4 py-3 text-white outline-none focus:border-brand-500 font-mono" />
                  </div>
                </div>

                <div>
                  <label className="block text-white/50 text-xs mb-1.5">Deposit Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50">$</span>
                    <input value={amount} readOnly
                      className="w-full bg-[#0d0e12] border border-white/[0.1] rounded-xl pl-8 pr-4 py-3 text-white outline-none tabular-nums cursor-not-allowed opacity-80" />
                  </div>
                  <p className="text-white/40 text-[11px] mt-1">Fixed activation deposit: {fmt(info.minimumDeposit)}</p>
                </div>

                <button onClick={submit} disabled={submitting}
                  className="w-full mt-2 py-3.5 rounded-xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 24px ${CRIMSON}44` }}>
                  {submitting ? <><RiLoader4Line className="animate-spin text-lg" /> Processing…</> : <><RiLock2Line /> Deposit {fmt(parseFloat(amount) || 0)} & Activate</>}
                </button>

                <div className="flex items-center justify-center gap-2 mt-2 text-white/40 text-xs">
                  <RiShieldCheckLine style={{ color: '#ff3d52' }} />
                  <span>Encrypted onboarding · Secure environment</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'done' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-[20px] p-8 text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderTop: '2px solid rgba(34,197,94,0.5)' }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.5)' }}>
              <RiCheckLine className="text-4xl text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-1">
              {result?.alreadyDeposited ? 'Already Activated' : 'Activation Deposit Received'}
            </h2>
            {!result?.alreadyDeposited && result?.credited != null && (
              <p className="text-green-400 font-semibold text-lg">{fmt(result.credited)} credited</p>
            )}
            <p className="text-white/50 text-sm mt-3 mb-2">
              Your account setup link will arrive in your email shortly (about 2 minutes). Use it to set your username, password and security PIN.
            </p>
            <Link to="/login" className="inline-block mt-6 px-6 py-3 rounded-xl text-white font-semibold text-sm"
              style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)` }}>Go to Login</Link>
          </motion.div>
        )}
      </div>
    </div>
  );
}
