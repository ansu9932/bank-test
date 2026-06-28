import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDispatch } from 'react-redux';
import {
  RiBankCard2Line, RiVisaLine, RiMastercardLine, RiAddLine, RiCloseLine,
  RiLoader4Line, RiShieldCheckLine, RiSnowyLine, RiBankLine, RiGlobalLine,
  RiStore2Line, RiCheckLine, RiLock2Line, RiInformationLine,
  RiEyeLine, RiEyeOffLine,
} from 'react-icons/ri';
import api from '../../services/api';
import { fetchAccount } from '../../store/slices/accountSlice';
import toast from 'react-hot-toast';

const CRIMSON = '#c8102e';

// Server-authoritative catalogue is the source of truth; this mirrors it for
// display only (fees/benefits are re-validated on the backend).
const TIERS = [
  { key: 'Gold',     fee: 500,  benefit: 'Standard cashback privileges',
    gradient: 'linear-gradient(135deg,#7a5c12 0%,#caa024 50%,#b8860b 100%)' },
  { key: 'Platinum', fee: 1000, benefit: 'Airport lounge access + enhanced transfer limits',
    gradient: 'linear-gradient(135deg,#2b2b34 0%,#5a5a66 50%,#1a1a1f 100%)' },
  { key: 'Business', fee: 2500, benefit: 'Zero cross-border markup + premium accounting tools',
    gradient: 'linear-gradient(135deg,#0f1f1a 0%,#1f3d34 50%,#0a1512 100%)' },
];
const TIER_MAP = TIERS.reduce((m, t) => { m[t.key] = t; return m; }, {});
const NETWORKS = ['Visa', 'Mastercard'];

const fmtINR = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// ─── Premium card visual (tier-themed) ────────────────────────────────────────
function CardVisual({ card, revealed, onEyeClick }) {
  const tier = TIER_MAP[card.tier] || TIERS[0];
  const frozen = card.controls?.frozen;
  const isActive = card.status === 'active';
  // When revealed, show the full PAN/expiry/CVV returned by the secure endpoint.
  const displayNumber = revealed?.formattedNumber || card.maskedNumber || 'XXXX XXXX XXXX XXXX';
  const displayExpiry = revealed?.expiry || (isActive ? '••/••' : (card.expiry || '••/••'));
  return (
    <div
      className="relative w-full max-w-md mx-auto rounded-2xl p-6 text-white overflow-hidden"
      style={{
        aspectRatio: '1.586',
        background: tier.gradient,
        boxShadow: '0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
      }}
    >
      {/* sheen */}
      <div className="absolute -top-1/3 -right-10 w-2/3 h-2/3 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)' }} />

      {frozen && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl"
          style={{ background: 'rgba(10,12,20,0.55)', backdropFilter: 'blur(2px)' }}>
          <span className="flex items-center gap-2 text-sm font-semibold text-white/90">
            <RiSnowyLine className="text-lg" /> Frozen
          </span>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/70">Alister Bank</p>
          <p className="text-sm font-semibold mt-0.5">{card.tier} Debit</p>
        </div>
        <span className="text-2xl font-bold italic">
          {card.network === 'Mastercard' ? <RiMastercardLine /> : <RiVisaLine />}
        </span>
      </div>

      {/* chip */}
      <div className="mt-6 w-11 h-8 rounded-md"
        style={{ background: 'linear-gradient(135deg,#d4af37,#f5e7a0)', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.4)' }} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-lg sm:text-xl font-mono tracking-[0.18em]">{displayNumber}</p>
        {isActive && (
          <button
            type="button"
            onClick={onEyeClick}
            aria-label={revealed ? 'Hide card details' : 'Reveal card details'}
            className="z-20 flex-shrink-0 p-2 rounded-lg bg-black/25 hover:bg-black/40 transition-colors"
          >
            {revealed ? <RiEyeOffLine className="text-lg" /> : <RiEyeLine className="text-lg" />}
          </button>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-[9px] uppercase tracking-widest text-white/60">Valid Thru</p>
          <p className="text-sm font-medium tabular-nums">{displayExpiry}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-widest text-white/60">CVV</p>
          <p className="text-sm font-medium tabular-nums">{revealed?.cvv || '•••'}</p>
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-widest text-white/60">Status</p>
          <p className={`text-sm font-semibold ${frozen ? 'text-blue-200' : 'text-green-300'}`}>
            {frozen ? 'Frozen' : 'Active'}
          </p>
        </div>
      </div>

      {revealed && (
        <p className="absolute bottom-2 left-0 right-0 text-center text-[9px] text-white/50">
          Details auto-hide in a few seconds · keep them private
        </p>
      )}
    </div>
  );
}

// ─── A single control toggle row ──────────────────────────────────────────────
function ControlRow({ icon: Icon, label, desc, value, onToggle, disabled }) {
  return (
    <div className="flex items-center gap-3 py-3.5 border-b border-white/[0.05] last:border-0">
      <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center flex-shrink-0">
        <Icon className="text-brand-400 text-lg" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium">{label}</p>
        <p className="text-dark-400 text-xs truncate">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={value}
        className="relative w-12 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
        style={{ background: value ? CRIMSON : 'rgba(255,255,255,0.15)' }}
      >
        <span
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
          style={{ transform: value ? 'translateX(24px)' : 'translateX(0)' }}
        />
      </button>
    </div>
  );
}

// ─── Security PIN modal ───────────────────────────────────────────────────────
function PinModal({ open, onClose, onConfirm, submitting, actionLabel }) {
  const [pin, setPin] = useState('');
  useEffect(() => { if (!open) setPin(''); }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 16 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-white/[0.08] p-6"
            style={{ background: '#15161c' }}
          >
            <div className="flex items-center gap-2 mb-1">
              <RiLock2Line className="text-brand-400 text-xl" />
              <h3 className="text-white font-semibold text-lg">Confirm with Security PIN</h3>
            </div>
            <p className="text-dark-300 text-sm mb-5">
              Enter your 4-digit transaction PIN to {actionLabel || 'apply this change'}.
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              className="w-full bg-[#0d0e12] border border-white/[0.08] rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] text-white outline-none focus:border-brand-500"
            />
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={onClose} disabled={submitting}
                className="flex-1 py-3 rounded-xl border border-white/[0.1] text-dark-200 hover:text-white text-sm font-medium transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={() => onConfirm(pin)} disabled={submitting || pin.length !== 4}
                className="flex-1 py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                style={{ background: `linear-gradient(135deg,${CRIMSON},#850a1e)` }}>
                {submitting ? <><RiLoader4Line className="animate-spin" /> Verifying…</> : <>Confirm</>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Request-card modal (network + tier selection) ────────────────────────────
function RequestModal({ open, onClose, onSubmit, submitting }) {
  const [network, setNetwork] = useState('Visa');
  const [tier, setTier] = useState('Gold');
  useEffect(() => { if (open) { setNetwork('Visa'); setTier('Gold'); } }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-white/[0.08] my-8"
            style={{ background: '#15161c' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <h3 className="text-white font-semibold text-lg">Request a Premium Card</h3>
              <button onClick={onClose} className="p-1.5 rounded-lg text-dark-300 hover:text-white hover:bg-white/[0.05]">
                <RiCloseLine className="text-xl" />
              </button>
            </div>

            <div className="p-6">
              {/* Network */}
              <p className="text-dark-300 text-xs font-medium uppercase tracking-widest mb-3">Select Network</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {NETWORKS.map((n) => (
                  <button key={n} type="button" onClick={() => setNetwork(n)}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-all"
                    style={{
                      background: network === n ? 'rgba(200,16,46,0.12)' : 'rgba(255,255,255,0.03)',
                      borderColor: network === n ? CRIMSON : 'rgba(255,255,255,0.08)',
                      color: network === n ? '#fff' : '#cbd5e1',
                    }}>
                    {n === 'Mastercard' ? <RiMastercardLine className="text-xl" /> : <RiVisaLine className="text-xl" />}
                    {n}
                  </button>
                ))}
              </div>

              {/* Tier */}
              <p className="text-dark-300 text-xs font-medium uppercase tracking-widest mb-3">Select Tier</p>
              <div className="space-y-3">
                {TIERS.map((t) => (
                  <button key={t.key} type="button" onClick={() => setTier(t.key)}
                    className="w-full text-left rounded-xl border p-4 transition-all"
                    style={{
                      background: tier === t.key ? 'rgba(200,16,46,0.10)' : 'rgba(255,255,255,0.03)',
                      borderColor: tier === t.key ? CRIMSON : 'rgba(255,255,255,0.08)',
                    }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: t.gradient }} />
                        <span className="text-white font-semibold text-sm">{t.key}</span>
                        {tier === t.key && <RiCheckLine className="text-brand-400" />}
                      </div>
                      <span className="text-white font-bold text-sm tabular-nums">{fmtINR(t.fee)}</span>
                    </div>
                    <p className="text-dark-300 text-xs mt-2 leading-snug">{t.benefit}</p>
                  </button>
                ))}
              </div>

              <div className="flex items-start gap-2 mt-5 text-dark-400 text-xs">
                <RiInformationLine className="mt-0.5 flex-shrink-0" />
                <span>The issuance fee for the selected tier will be debited from your account immediately upon application.</span>
              </div>

              <button type="button" onClick={() => onSubmit({ network, tier })} disabled={submitting}
                className="w-full mt-6 py-3.5 rounded-xl text-white text-sm font-semibold uppercase tracking-wide flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: `linear-gradient(135deg,${CRIMSON},#850a1e)`, boxShadow: `0 0 24px ${CRIMSON}44` }}>
                {submitting
                  ? <><RiLoader4Line className="animate-spin text-lg" /> Submitting…</>
                  : <>Pay {fmtINR(TIER_MAP[tier].fee)} &amp; Apply</>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CardsPage() {
  const dispatch = useDispatch();
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // PIN modal drives either a pending controls patch OR a secure reveal.
  const [pinOpen, setPinOpen] = useState(false);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [pinMode, setPinMode] = useState('controls'); // 'controls' | 'reveal'
  const [pendingControls, setPendingControls] = useState(null); // { patch, label }

  // Temporary plaintext reveal (auto-hides). Never persisted anywhere.
  const [revealed, setRevealed] = useState(null);
  const revealTimerRef = useRef(null);

  const loadCard = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/requests/my-card');
      setCard(data?.data?.card ?? null);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not load your card.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCard(); }, [loadCard]);

  // Clear any reveal timer on unmount (and wipe the plaintext from memory).
  useEffect(() => () => { if (revealTimerRef.current) clearTimeout(revealTimerRef.current); }, []);

  const submitRequest = async ({ network, tier }) => {
    setSubmitting(true);
    try {
      const { data } = await api.post('/requests/debit-card', { network, tier });
      toast.success(data?.message || 'Card application submitted.');
      setRequestOpen(false);
      dispatch(fetchAccount());
      await loadCard();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not submit the card request.');
    } finally {
      setSubmitting(false);
    }
  };

  // A control toggle stages a patch then opens the PIN modal in 'controls' mode.
  const requestControlChange = (patch, label) => {
    setPinMode('controls');
    setPendingControls({ patch, label });
    setPinOpen(true);
  };

  // The eye button: if currently revealed, hide immediately; else open the PIN
  // modal in 'reveal' mode.
  const handleEyeClick = () => {
    if (revealed) {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      setRevealed(null);
      return;
    }
    setPinMode('reveal');
    setPendingControls(null);
    setPinOpen(true);
  };

  // Single PIN-confirm handler routing to controls OR reveal.
  const confirmPin = async (pin) => {
    if (!card) return;
    setPinSubmitting(true);
    try {
      if (pinMode === 'reveal') {
        const { data } = await api.post(`/requests/card/${card.id}/reveal`, { securityPin: pin });
        const details = data?.data;
        if (details?.number) {
          setRevealed(details);
          // Auto-hide after 30s so plaintext never lingers on screen.
          if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
          revealTimerRef.current = setTimeout(() => setRevealed(null), 30000);
          toast.success('Card details revealed. They will hide automatically.');
        }
        setPinOpen(false);
      } else {
        const { data } = await api.patch(`/requests/card/${card.id}/controls`, {
          securityPin: pin,
          controls: pendingControls.patch,
        });
        toast.success(data?.message || 'Card controls updated.');
        setPinOpen(false);
        setPendingControls(null);
        if (data?.data?.controls) setCard((cur) => ({ ...cur, controls: data.data.controls }));
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not verify your PIN. Please try again.');
    } finally {
      setPinSubmitting(false);
    }
  };

  const c = card?.controls || {};
  const isActive = card?.status === 'active';
  const isPending = card?.status === 'pending' || card?.status === 'processing';

  return (
    <div className="w-full max-w-3xl mx-auto px-1 py-6 sm:py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center border border-brand-500/30"
          style={{ background: 'rgba(200,16,46,0.12)' }}>
          <RiBankCard2Line className="text-2xl" style={{ color: '#ff3d52' }} />
        </div>
        <div>
          <h1 className="font-display font-bold text-white text-xl leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Debit Card Management
          </h1>
          <p className="text-slate-400 text-xs mt-0.5">Request, view &amp; control your premium Alister card</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RiLoader4Line className="animate-spin text-brand-400 text-3xl" />
        </div>
      ) : !card || card.status === 'cancelled' ? (
        /* ── Empty state ──────────────────────────────────────────────── */
        <div className="rounded-3xl border border-white/[0.06] p-8 sm:p-12 text-center" style={{ background: '#15161c' }}>
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-5">
            <RiBankCard2Line className="text-3xl text-brand-400" />
          </div>
          <h2 className="text-white font-semibold text-lg">You have no active card</h2>
          <p className="text-dark-300 text-sm mt-2 max-w-sm mx-auto">
            Request your premium Alister card today and unlock cashback, lounge access, and global usage.
          </p>
          <button type="button" onClick={() => setRequestOpen(true)}
            className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl text-white text-sm font-semibold transition-all active:scale-95"
            style={{ background: `linear-gradient(135deg,${CRIMSON},#850a1e)`, boxShadow: `0 0 24px ${CRIMSON}44` }}>
            <RiAddLine className="text-lg" /> Request Card
          </button>
        </div>
      ) : (
        /* ── Card present ─────────────────────────────────────────────── */
        <div className="space-y-6">
          <CardVisual card={card} revealed={revealed} onEyeClick={handleEyeClick} />

          {isPending && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 border text-sm"
              style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)', color: '#fcd34d' }}>
              <RiLoader4Line className="animate-spin flex-shrink-0" />
              Your {card.tier} {card.network} card application is under review. The issuance fee of {fmtINR(card.issuanceFee)} has been charged.
            </div>
          )}

          {isActive && (
            <div className="rounded-2xl border border-white/[0.06] p-5" style={{ background: '#15161c' }}>
              <div className="flex items-center gap-2 mb-2">
                <RiShieldCheckLine className="text-brand-400" />
                <p className="text-white font-semibold text-sm">Card Controls</p>
              </div>
              <p className="text-dark-400 text-xs mb-2">Each change requires your transaction security PIN.</p>
              <ControlRow icon={RiSnowyLine} label="Freeze Card"
                desc="Temporarily block all transactions"
                value={!!c.frozen}
                onToggle={() => requestControlChange({ frozen: !c.frozen }, c.frozen ? 'unfreeze your card' : 'freeze your card')} />
              <ControlRow icon={RiBankLine} label="ATM Withdrawals"
                desc="Allow cash withdrawals at ATMs"
                value={!!c.atm_enabled}
                onToggle={() => requestControlChange({ atm_enabled: !c.atm_enabled }, 'update ATM withdrawals')} />
              <ControlRow icon={RiStore2Line} label="Domestic Commerce"
                desc="Allow payments within India"
                value={!!c.domestic_enabled}
                onToggle={() => requestControlChange({ domestic_enabled: !c.domestic_enabled }, 'update domestic usage')} />
              <ControlRow icon={RiGlobalLine} label="International Usage"
                desc="Allow payments outside India"
                value={!!c.international_enabled}
                onToggle={() => requestControlChange({ international_enabled: !c.international_enabled }, 'update international usage')} />
            </div>
          )}
        </div>
      )}

      <RequestModal open={requestOpen} onClose={() => setRequestOpen(false)} onSubmit={submitRequest} submitting={submitting} />
      <PinModal
        open={pinOpen}
        onClose={() => { if (!pinSubmitting) { setPinOpen(false); setPendingControls(null); } }}
        onConfirm={confirmPin}
        submitting={pinSubmitting}
        actionLabel={pinMode === 'reveal' ? 'reveal your full card details' : (pendingControls?.label)}
      />
    </div>
  );
}
