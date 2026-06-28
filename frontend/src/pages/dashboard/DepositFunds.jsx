import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiQrCodeLine, RiShieldCheckLine, RiCheckLine, RiLoader4Line,
  RiSecurePaymentLine, RiArrowLeftLine, RiArrowRightLine,
  RiBankCardLine, RiBankLine, RiInformationLine, RiLockLine,
} from 'react-icons/ri';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { fetchAccount, updateBalance } from '../../store/slices/accountSlice';
import { fetchTransactions } from '../../store/slices/transactionSlice';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · CONDITIONAL DEPOSIT (Add Money)
   • Amount <= $100,000 → dynamic UPI QR (scan + webhook credit + polling).
   • Amount  > $100,000 → UPI/QR disabled; Card / Net Banking method cards
     open the Razorpay Checkout widget (method forced by selection).
   Theme: matte-black #0d0e12 · charcoal surfaces · crimson #c8102e accents.
   ────────────────────────────────────────────────────────────────────────── */

const CRIMSON = '#c8102e';

const QUICK_ADD = [500, 1000, 5000];
const UPI_QR_CAP = 100000;            // UPI/QR per-transaction ceiling ($1L)

// Net-banking partner grid. The selected code is forwarded to the hosted
// Razorpay widget via prefill.bank so it routes straight to the bank's
// login/redirect — no cardholder data ever touches our DOM (PCI SAQ A).
const NETBANKING_BANKS = [
  { code: 'HDFC', name: 'HDFC Bank' },
  { code: 'ICIC', name: 'ICICI Bank' },
  { code: 'SBIN', name: 'State Bank of India' },
  { code: 'UTIB', name: 'Axis Bank' },
  { code: 'KKBK', name: 'Kotak Mahindra Bank' },
  { code: 'YESB', name: 'Yes Bank' },
  { code: 'IDFB', name: 'IDFC FIRST Bank' },
  { code: 'INDB', name: 'IndusInd Bank' },
];
const POLL_INTERVAL_MS = 2500;        // poll backend every 2.5s
const SUCCESS_REDIRECT_MS = 1900;     // dwell on the checkmark before routing
const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

// NOTE: browser DevTools may show `bank-transfer.php` 404s while this script is
// active — these originate from Razorpay Checkout.js internals or a browser
// extension, NOT from this application (it is a Node.js backend with no PHP).
// They are harmless and do not affect the payment flow.
//
// Lazily inject the Razorpay Checkout script once; resolves when ready.
function loadRazorpayCheckout() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') { reject(new Error('No window')); return; }
    if (window.Razorpay) { resolve(window.Razorpay); return; }

    let script = document.getElementById('rzp-checkout-js');
    if (!script) {
      script = document.createElement('script');
      script.id = 'rzp-checkout-js';
      script.src = CHECKOUT_SRC;
      script.async = true;
      document.body.appendChild(script);
    }
    const started = Date.now();
    const poll = setInterval(() => {
      if (window.Razorpay) { clearInterval(poll); resolve(window.Razorpay); }
      else if (Date.now() - started > 15000) { clearInterval(poll); reject(new Error('Checkout failed to load')); }
    }, 100);
    script.addEventListener('error', () => { clearInterval(poll); reject(new Error('Checkout script error')); });
  });
}

// View phases: 'form' → 'qr' (awaiting QR payment) → 'success'
export default function DepositFunds() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { account } = useSelector((s) => s.account);

  const [phase, setPhase] = useState('form');
  const [amount, setAmount] = useState('');
  const [generating, setGenerating] = useState(false);
  const [checkoutMethod, setCheckoutMethod] = useState(null); // 'card' | 'netbanking' while launching
  const [netBankingOpen, setNetBankingOpen] = useState(false); // custom bank grid expanded?
  const [selectedBank, setSelectedBank] = useState(null);      // { code, name } chosen in the grid
  const [order, setOrder] = useState(null);          // { orderRef, image_url, amount }
  const [qrImgError, setQrImgError] = useState(false); // QR image failed to load?
  const [creditedAmount, setCreditedAmount] = useState(0);
  const [newBalance, setNewBalance] = useState(null);

  const pollRef = useRef(null);
  const redirectRef = useRef(null);

  // Ensure the account balance is loaded for the header chip.
  useEffect(() => {
    if (!account) dispatch(fetchAccount());
  }, [account, dispatch]);

  // ── Timer hygiene — prevent memory leaks ───────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (redirectRef.current) clearTimeout(redirectRef.current);
  }, []);

  const numericAmount = parseFloat(amount) || 0;
  // Conditional gate: anything over $1L cannot use UPI/QR.
  const isHighValue = numericAmount > UPI_QR_CAP;

  const handleQuickAdd = (inc) => setAmount((prev) => String((parseFloat(prev) || 0) + inc));

  const handleAmountChange = (e) => {
    const v = e.target.value;
    if (/^\d*\.?\d*$/.test(v)) setAmount(v); // digits + single optional decimal
  };

  const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const fmtInr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Handle a confirmed credit (shared by QR + Checkout flows) ──────────────
  const handleCredited = useCallback((payload) => {
    stopPolling();
    const credited = Number(payload.amount) || 0;
    const balance = payload.balance;
    const available = payload.available_balance;

    setCreditedAmount(credited);
    if (balance != null) setNewBalance(balance);
    setPhase('success');

    if (balance != null) {
      dispatch(updateBalance({
        balance,
        available_balance: available != null ? available : balance,
      }));
    }
    dispatch(fetchAccount());
    dispatch(fetchTransactions({ limit: 50, page: 1 }));

    toast.success('Funds credited to your account!');

    redirectRef.current = setTimeout(() => {
      navigate('/dashboard/transactions');
    }, SUCCESS_REDIRECT_MS);
  }, [dispatch, navigate, stopPolling]);

  // ── Poll the backend every 2.5s until 'completed' ──────────────────────────
  const startPolling = useCallback((orderRef) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/status/${orderRef}`);
        if (data?.status === 'completed') {
          handleCredited(data);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[deposit] status poll failed, retrying:', err?.message || err);
      }
    }, POLL_INTERVAL_MS);
  }, [handleCredited, stopPolling]);

  // ── ≤ $1L: generate the UPI QR ──────────────────────────────────────────────
  const handleGenerate = async () => {
    if (numericAmount <= 0) { toast.error('Please enter a valid amount.'); return; }
    if (isHighValue) { toast.error('Maximum deposit per QR is $100,000.'); return; }
    setGenerating(true);
    try {
      const { data } = await api.post('/payments/create-qr', { amount: numericAmount });
      const payload = data?.data;
      if (!payload?.image_url || !payload?.orderRef) throw new Error('Malformed QR response');
      setOrder(payload);
      setQrImgError(false);
      setPhase('qr');
      startPolling(payload.orderRef);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Could not generate the payment QR. Please try again.';
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  // ── > $1L: open the re-skinned Razorpay hosted widget for Card / Net Banking ─
  // Card data (PAN/CVV) is collected *inside* Razorpay's iframe, never in our
  // DOM, so we stay in PCI SAQ A scope. For Net Banking we forward the chosen
  // bank via prefill so the widget routes straight to that bank's redirect.
  const handleCheckout = async (method, bankCode = null) => {
    if (numericAmount <= 0) { toast.error('Please enter a valid amount.'); return; }
    setCheckoutMethod(method);
    try {
      const { data } = await api.post('/payments/create-deposit-order', {
        amount: numericAmount,
        paymentMethod: method,
        // Forward the chosen Net Banking partner code so the backend can validate
        // it and echo it back for direct-to-bank routing (null for card).
        ...(method === 'netbanking' && bankCode ? { bank: bankCode } : {}),
      });
      const cfg = data?.data;
      if (!cfg?.orderId || !cfg?.keyId) throw new Error('Malformed order response');

      const Razorpay = await loadRazorpayCheckout();

      // Clone the server-supplied prefill so we can attach the bank routing
      // hints for Net Banking without mutating the response object. Prefer the
      // backend-validated bank code, falling back to the user's selection.
      const prefill = { ...(cfg.prefill || {}) };
      const routedBank = cfg.bank || (method === 'netbanking' ? bankCode : null);
      if (method === 'netbanking' && routedBank) {
        prefill.method = 'netbanking';
        prefill.bank = routedBank; // e.g. 'HDFC', 'SBIN', 'ICIC' → skips bank picker
      }

      const options = {
        key: cfg.keyId,
        amount: cfg.amountPaise,
        currency: cfg.currency,
        name: cfg.name,
        description: cfg.description,
        order_id: cfg.orderId,
        prefill,
        notes: { orderRef: cfg.orderRef },
        // Alister Bank skin: crimson accents over a rich matte-black backdrop so
        // the hosted widget blends seamlessly into the dashboard.
        theme: {
          color: CRIMSON,
          backdrop_color: '#000000',
        },
        // Force the chosen rail in the Checkout widget.
        method: cfg.methodConfig,
        handler: () => {
          // Payment authorized in the widget. The webhook credits the balance;
          // begin polling so the UI flips to success the moment it lands.
          toast.success('Payment received — confirming with your bank…');
          setOrder({ orderRef: cfg.orderRef, amount: cfg.amount });
          setPhase('qr'); // reuse the "awaiting confirmation" waiting panel
          startPolling(cfg.orderRef);
        },
        modal: {
          ondismiss: () => {
            setCheckoutMethod(null);
            toast('Payment cancelled.', { icon: 'ℹ️' });
          },
        },
      };

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', (resp) => {
        toast.error(resp?.error?.description || 'Payment failed. Please try again.');
        setCheckoutMethod(null);
      });
      rzp.open();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Could not start the payment. Please try again.';
      toast.error(msg);
      setCheckoutMethod(null);
    }
  };

  // ── Reset back to the amount form ───────────────────────────────────────────
  const handleReset = () => {
    stopPolling();
    if (redirectRef.current) { clearTimeout(redirectRef.current); redirectRef.current = null; }
    setOrder(null);
    setQrImgError(false);
    setCheckoutMethod(null);
    setNetBankingOpen(false);
    setSelectedBank(null);
    setCreditedAmount(0);
    setNewBalance(null);
    setAmount('');
    setPhase('form');
  };

  // ── Locked state ────────────────────────────────────────────────────────────
  // "Add Money" is an admin-activated feature: locked by default on every
  // account until an admin enables it (Account.transfer_methods.add_money). The
  // null/loading account also resolves to locked (fail-safe). The backend
  // enforces this independently on /payments/create-qr & create-deposit-order.
  const addMoneyEnabled = (() => {
    const tm = account?.transfer_methods;
    let parsed = tm;
    if (typeof tm === 'string') { try { parsed = JSON.parse(tm); } catch { parsed = null; } }
    return parsed?.add_money === true;
  })();

  if (!addMoneyEnabled) {
    return (
      <div className="w-full max-w-full" style={{ background: '#0d0e12' }}>
        <div className="max-w-2xl mx-auto px-1 py-6 sm:py-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center border border-brand-500/30"
              style={{ background: 'rgba(200,16,46,0.12)', boxShadow: `0 0 22px ${CRIMSON}33` }}>
              <RiSecurePaymentLine className="text-2xl" style={{ color: '#ff3d52' }} />
            </div>
            <div>
              <h1 className="font-display font-bold text-white text-xl leading-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Add Money
              </h1>
              <p className="text-slate-400 text-xs mt-0.5">Account funding</p>
            </div>
          </div>

          {/* Locked notice card */}
          <div className="bg-[#15161c] border border-white/[0.06] rounded-3xl p-8 sm:p-10 flex flex-col items-center text-center"
            style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 border"
              style={{ background: 'rgba(200,16,46,0.1)', borderColor: 'rgba(200,16,46,0.35)' }}>
              <RiLockLine className="text-4xl" style={{ color: '#ff3d52' }} />
            </div>
            <h2 className="font-display font-bold text-white text-2xl tracking-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Add Money is Locked
            </h2>
            <p className="text-slate-400 text-sm mt-3 max-w-md leading-relaxed">
              The Add Money feature is currently unavailable on your account. Please contact
              Alister Bank support if you need to fund your account.
            </p>
            <button type="button" onClick={() => navigate('/dashboard')}
              className="mt-7 py-3.5 px-6 rounded-2xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2 transition-all active:scale-95"
              style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 24px ${CRIMSON}44` }}>
              <RiArrowLeftLine className="text-lg" /> Back to Dashboard
            </button>
          </div>

          <p className="text-center text-slate-600 text-[11px] mt-5">
            🔒 Secured by Alister Bank Core Ecosystem
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-full" style={{ background: '#0d0e12' }}>
      <div className="max-w-2xl mx-auto px-1 py-6 sm:py-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center border border-brand-500/30"
            style={{ background: 'rgba(200,16,46,0.12)', boxShadow: `0 0 22px ${CRIMSON}33` }}>
            <RiSecurePaymentLine className="text-2xl" style={{ color: '#ff3d52' }} />
          </div>
          <div>
            <h1 className="font-display font-bold text-white text-xl leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Add Money
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">Instant top-up · UPI, Card &amp; Net Banking</p>
          </div>
          {account && (
            <div className="ml-auto text-right">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest">Balance</p>
              <p className="text-white font-semibold text-sm tabular-nums">{fmt(account.balance)}</p>
            </div>
          )}
        </div>

        {/* ── Main card ──────────────────────────────────────────────────── */}
        <div className="bg-[#15161c] border border-white/[0.06] rounded-3xl overflow-hidden"
          style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)' }}>

          <AnimatePresence mode="wait">

            {/* ── Phase 1: amount form (conditional CTA) ──────────────────── */}
            {phase === 'form' && (
              <motion.div key="form"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="p-6 sm:p-8">
                <label className="block text-slate-300 text-xs font-medium uppercase tracking-widest mb-3">
                  Deposit Amount
                </label>

                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-2xl font-semibold text-slate-400">$</span>
                  <input
                    type="text" inputMode="decimal" value={amount} onChange={handleAmountChange}
                    placeholder="0" autoFocus
                    className="w-full bg-[#0d0e12] border border-white/[0.08] rounded-2xl pl-12 pr-5 py-5 text-3xl font-bold text-white outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 tabular-nums"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  {QUICK_ADD.map((inc) => (
                    <button key={inc} type="button" onClick={() => handleQuickAdd(inc)}
                      className="py-2.5 rounded-xl text-sm font-semibold text-slate-200 border border-white/[0.08] bg-white/[0.03] hover:border-brand-500/50 hover:text-white hover:bg-brand-500/10 transition-all active:scale-95">
                      +${inc.toLocaleString('en-US')}
                    </button>
                  ))}
                </div>

                {/* ── ≤ $1L: UPI QR generation ─────────────────────────────── */}
                {!isHighValue && (
                  <>
                    <button type="button" onClick={handleGenerate} disabled={generating || numericAmount <= 0}
                      className="w-full mt-7 py-4 rounded-2xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 28px ${CRIMSON}44` }}>
                      {generating
                        ? <><RiLoader4Line className="animate-spin text-lg" /> Generating…</>
                        : <><RiQrCodeLine className="text-lg" /> Proceed · Generate Secure QR</>}
                    </button>
                    <div className="flex items-center justify-center gap-2 mt-5 text-slate-500 text-xs">
                      <RiShieldCheckLine style={{ color: '#ff3d52' }} />
                      <span>UPI payments are processed over an encrypted network</span>
                    </div>
                  </>
                )}

                {/* ── > $1L: Card / Net Banking method cards ───────────────── */}
                {isHighValue && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="mt-7">
                    {/* Info sub-badge */}
                    <div className="flex items-start gap-2 rounded-xl px-4 py-3 mb-4 border"
                      style={{ background: 'rgba(200,16,46,0.07)', borderColor: 'rgba(200,16,46,0.28)' }}>
                      <RiInformationLine className="mt-0.5 flex-shrink-0" style={{ color: '#ff8090' }} />
                      <p className="text-xs leading-relaxed" style={{ color: '#ffb3bf' }}>
                        ℹ UPI/QR payments are capped at $100,000. Please select Card or Net Banking to complete this transaction safely.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Card Payment */}
                      <button type="button" onClick={() => handleCheckout('card')}
                        disabled={Boolean(checkoutMethod)}
                        className="group text-left rounded-2xl p-5 border transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: '#0d0e12', borderColor: 'rgba(255,255,255,0.08)' }}>
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 border"
                          style={{ background: 'rgba(200,16,46,0.12)', borderColor: 'rgba(200,16,46,0.3)' }}>
                          {checkoutMethod === 'card'
                            ? <RiLoader4Line className="animate-spin text-xl" style={{ color: '#ff3d52' }} />
                            : <RiBankCardLine className="text-xl" style={{ color: '#ff3d52' }} />}
                        </div>
                        <p className="text-white font-semibold text-sm">Card Payment</p>
                        <p className="text-slate-400 text-[11px] mt-1 leading-snug">
                          All major Domestic &amp; International Debit and Credit Cards.
                        </p>
                      </button>

                      {/* Net Banking — opens our custom partner-bank grid below */}
                      <button type="button"
                        onClick={() => { setNetBankingOpen((v) => !v); setSelectedBank(null); }}
                        disabled={Boolean(checkoutMethod)}
                        aria-expanded={netBankingOpen}
                        className="group text-left rounded-2xl p-5 border transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: '#0d0e12', borderColor: netBankingOpen ? CRIMSON : 'rgba(255,255,255,0.08)' }}>
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 border"
                          style={{ background: 'rgba(200,16,46,0.12)', borderColor: 'rgba(200,16,46,0.3)' }}>
                          <RiBankLine className="text-xl" style={{ color: '#ff3d52' }} />
                        </div>
                        <p className="text-white font-semibold text-sm">Net Banking</p>
                        <p className="text-slate-400 text-[11px] mt-1 leading-snug">
                          Major corporate &amp; retail banking portals.
                        </p>
                      </button>
                    </div>

                    {/* Custom matte-black partner-bank selector (Net Banking).
                        Selecting a bank forwards its code to the hosted widget so
                        the user lands straight on that bank's login — no card data
                        on our page, PCI SAQ A preserved. */}
                    <AnimatePresence initial={false}>
                      {netBankingOpen && (
                        <motion.div key="nb-grid"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden">
                          <div className="mt-3 rounded-2xl border p-4"
                            style={{ background: '#0d0e12', borderColor: 'rgba(255,255,255,0.08)' }}>
                            <p className="text-slate-300 text-[11px] font-medium uppercase tracking-widest mb-3">
                              Select your bank
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                              {NETBANKING_BANKS.map((bank) => {
                                const active = selectedBank?.code === bank.code;
                                return (
                                  <button key={bank.code} type="button"
                                    onClick={() => setSelectedBank(bank)}
                                    disabled={Boolean(checkoutMethod)}
                                    className="flex items-center gap-2 text-left rounded-xl px-3 py-2.5 border text-xs font-semibold transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                                    style={{
                                      background: active ? 'rgba(200,16,46,0.12)' : 'rgba(255,255,255,0.03)',
                                      borderColor: active ? CRIMSON : 'rgba(255,255,255,0.08)',
                                      color: active ? '#ffb3bf' : '#cbd5e1',
                                    }}>
                                    <RiBankLine className="flex-shrink-0" style={{ color: active ? '#ff3d52' : '#64748b' }} />
                                    <span className="truncate">{bank.name}</span>
                                  </button>
                                );
                              })}
                            </div>

                            <button type="button"
                              onClick={() => selectedBank && handleCheckout('netbanking', selectedBank.code)}
                              disabled={!selectedBank || Boolean(checkoutMethod)}
                              className="w-full mt-4 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 24px ${CRIMSON}44` }}>
                              {checkoutMethod === 'netbanking'
                                ? <><RiLoader4Line className="animate-spin text-lg" /> Connecting…</>
                                : <><RiBankLine className="text-lg" /> {selectedBank ? `Proceed to ${selectedBank.name}` : 'Select a bank to continue'}</>}
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex items-center justify-center gap-2 mt-5 text-slate-500 text-xs">
                      <RiShieldCheckLine style={{ color: '#ff3d52' }} />
                      <span>Secured by Razorpay · PCI-DSS SAQ A hosted checkout</span>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* ── Phase 2: QR / awaiting confirmation ─────────────────────── */}
            {phase === 'qr' && order && (
              <motion.div key="qr"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                className="p-6 sm:p-8 flex flex-col items-center text-center">

                <p className="text-slate-300 text-sm mb-1">
                  {order.image_url ? 'Scan to pay ' : 'Confirming payment of '}
                  <span className="text-white font-bold">
                    {order.image_url && order.inrAmount ? fmtInr(order.inrAmount) : fmt(order.amount)}
                  </span>
                </p>
                {order.image_url && (
                  <>
                    {order.inrAmount && (
                      <p className="text-slate-400 text-xs mb-1">
                        ≈ <span className="text-slate-200 font-semibold">{fmt(order.amount)}</span> will be added to your balance
                        {order.fxRate ? ` · 1 USD = ₹${Number(order.fxRate).toFixed(2)}` : ''}
                      </p>
                    )}
                    <p className="text-slate-500 text-xs mb-6">Use any UPI app — GPay, PhonePe, Paytm or your bank app</p>
                  </>
                )}

                {/* QR image (UPI flow only) */}
                {order.image_url && (
                  <motion.div
                    initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    className="relative rounded-2xl bg-white"
                    style={{ padding: '16px', boxShadow: `0 0 40px ${CRIMSON}44, 0 18px 50px rgba(0,0,0,0.5)` }}>
                    {/* The backend returns a CLEAN, QR-only image (it decodes the
                        Razorpay poster and regenerates just the scannable code), so
                        we render it straight — no cropping/scaling needed. Layout
                        uses width:100% + height:auto so it renders reliably in every
                        browser. The white padding is the scanner quiet zone. */}
                    <div style={{ width: '100%', maxWidth: '230px', margin: '0 auto' }}>
                      {qrImgError ? (
                        <div style={{ padding: '24px 12px', textAlign: 'center' }}>
                          <p style={{ color: '#c8102e', fontSize: '13px', fontWeight: 600 }}>
                            Couldn’t load the QR image.
                          </p>
                          <p style={{ color: '#555', fontSize: '11px', marginTop: '4px' }}>
                            Please tap “Cancel and change amount” and try again.
                          </p>
                        </div>
                      ) : (
                        <img
                          src={order.image_url}
                          alt="UPI payment QR code"
                          onError={() => setQrImgError(true)}
                          style={{ display: 'block', width: '100%', height: 'auto' }}
                        />
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Pulsing crimson waiting state */}
                <div className="mt-7 w-full rounded-2xl border border-brand-500/25 px-5 py-4"
                  style={{ background: 'rgba(200,16,46,0.06)' }}>
                  <div className="flex items-center justify-center gap-3">
                    <motion.span
                      className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: CRIMSON }}
                      animate={{ scale: [1, 1.5, 1], opacity: [1, 0.4, 1], boxShadow: [`0 0 0 0 ${CRIMSON}66`, `0 0 0 8px ${CRIMSON}00`, `0 0 0 0 ${CRIMSON}00`] }}
                      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <p className="text-sm font-medium" style={{ color: '#ff8090' }}>
                      Waiting for secure payment network confirmation…
                    </p>
                  </div>
                  <p className="text-slate-400 text-xs mt-1.5">Do not close this panel.</p>
                </div>

                <button type="button" onClick={handleReset}
                  className="mt-6 inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
                  <RiArrowLeftLine /> Cancel and change amount
                </button>
              </motion.div>
            )}

            {/* ── Phase 3: success ────────────────────────────────────────── */}
            {phase === 'success' && (
              <motion.div key="success"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="p-8 sm:p-10 flex flex-col items-center text-center">

                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16 }}
                  className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
                  style={{ background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.5)' }}>
                  <motion.div
                    initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 14 }}>
                    <RiCheckLine className="text-5xl text-green-400" />
                  </motion.div>
                </motion.div>

                <h2 className="font-display font-bold text-white text-2xl tracking-tight"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  Deposit Successful
                </h2>
                <p className="text-green-400 font-semibold text-lg mt-1">{fmt(creditedAmount)} added</p>
                {newBalance != null && (
                  <p className="text-slate-400 text-sm mt-2">
                    Updated balance: <span className="text-white font-semibold tabular-nums">{fmt(newBalance)}</span>
                  </p>
                )}

                <div className="flex items-center gap-2 mt-6 text-slate-400 text-xs">
                  <RiLoader4Line className="animate-spin" style={{ color: '#ff3d52' }} />
                  Redirecting to your transactions…
                </div>

                <button type="button" onClick={() => { handleReset(); navigate('/dashboard/transactions'); }}
                  className="w-full max-w-xs mt-6 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`, boxShadow: `0 0 24px ${CRIMSON}44` }}>
                  View Transactions <RiArrowRightLine className="text-lg" />
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <p className="text-center text-slate-600 text-[11px] mt-5">
          🔒 Secured by Alister Bank Core Ecosystem
        </p>
      </div>
    </div>
  );
}
