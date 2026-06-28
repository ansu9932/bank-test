import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  RiBankLine, RiRefreshLine, RiCheckboxCircleLine, RiCloseCircleLine,
  RiLoader4Line, RiTimer2Line, RiUserLine, RiBankCard2Line,
} from 'react-icons/ri';
import api from '../../services/api';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · ADMIN · NEFT REQUESTS
   Lists NEFT transfers held for approval. Approve → completed (+ user email);
   Reject → the debit is refunded to the user (+ failure email). Other transfer
   rails (IMPS / UPI / Internal) settle instantly and never appear here.
   ────────────────────────────────────────────────────────────────────────── */

const adminHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('adminToken') || ''}` });
const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const safeDate = (d) => { try { return d ? new Date(d).toLocaleString() : '—'; } catch { return '—'; } };

const NEON = { amber: '#f59e0b', green: '#22c55e', red: '#ef4444', cyan: '#22d3ee' };

// Preset rejection reasons the user will see verbatim (their money is refunded).
const PRESET_REASONS = [
  'The beneficiary bank is currently not responding. Your money has been refunded.',
  'The bank server is temporarily down. Your money has been refunded — please try again later.',
  'The beneficiary account could not be validated by the destination bank. Your money has been refunded.',
];

export default function AdminNeftRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  // Reject modal state.
  const [rejectFor, setRejectFor] = useState(null); // the request being rejected
  const [reason, setReason] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/neft-requests', { headers: adminHeaders() });
      setRequests(data?.data?.requests || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load NEFT requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const act = useCallback(async (id, decision, rejReason = '') => {
    setActingId(id);
    try {
      const { data } = await api.post(
        `/admin/neft-requests/${id}/review`,
        { decision, reason: rejReason },
        { headers: adminHeaders() },
      );
      if (data?.success) {
        toast.success(decision === 'approve'
          ? 'NEFT approved — transfer completed and user notified.'
          : 'NEFT rejected — amount refunded and user notified.');
        setRequests((prev) => prev.filter((r) => r.id !== id));
        setRejectFor(null);
        setReason(PRESET_REASONS[0]);
        setCustomReason('');
      } else {
        toast.error(data?.message || 'Action could not be confirmed.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Action failed.');
    } finally {
      setActingId(null);
    }
  }, []);

  const confirmReject = useCallback(() => {
    const finalReason = (customReason.trim() || reason || '').trim();
    if (!finalReason) { toast.error('Please choose or type a reason.'); return; }
    act(rejectFor.id, 'reject', finalReason);
  }, [customReason, reason, rejectFor, act]);

  const totalPending = requests.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div className="text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <RiBankLine style={{ color: NEON.amber }} /> NEFT Requests
          </h1>
          <p className="text-white/45 text-sm mt-0.5">
            Approve to complete the transfer, or reject to refund the customer. IMPS / UPI / Internal are unaffected.
          </p>
        </div>
        <button
          onClick={fetchRequests}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-sm text-white/70 transition-colors"
        >
          <RiRefreshLine className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
        <div className="rounded-2xl border border-white/[0.06] bg-[#111118] p-4">
          <p className="text-2xl font-bold" style={{ color: NEON.amber }}>{requests.length}</p>
          <p className="text-[11px] uppercase tracking-widest text-white/40 mt-1">Awaiting Approval</p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-[#111118] p-4">
          <p className="text-2xl font-bold tabular-nums" style={{ color: NEON.cyan }}>{fmt(totalPending)}</p>
          <p className="text-[11px] uppercase tracking-widest text-white/40 mt-1">Total Held</p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#111118] p-16 text-center">
          <RiLoader4Line className="animate-spin text-3xl mx-auto mb-2" style={{ color: NEON.amber }} />
          <p className="text-white/50 text-sm">Loading NEFT requests…</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#111118] p-16 text-center">
          <RiCheckboxCircleLine className="text-4xl mx-auto mb-2" style={{ color: NEON.green }} />
          <p className="text-white/60 text-sm">No NEFT transfers awaiting approval</p>
          <p className="text-white/30 text-xs mt-1">New NEFT requests will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-[#111118] p-5"
              style={{ boxShadow: '0 16px 40px rgba(0,0,0,0.35)' }}
            >
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                {/* Left: amount + beneficiary */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl font-bold tabular-nums" style={{ color: NEON.amber }}>{fmt(r.amount)}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: `${NEON.amber}1a`, color: NEON.amber, border: `1px solid ${NEON.amber}44` }}>
                      <RiTimer2Line /> Awaiting approval
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <Detail icon={RiUserLine} label="Beneficiary" value={r.beneficiaryName || '—'} />
                    <Detail icon={RiBankCard2Line} label="Account No." value={r.beneficiaryAccount || '—'} mono />
                    <Detail icon={RiBankCard2Line} label="IFSC" value={r.ifsc || '—'} mono />
                    <Detail icon={RiBankCard2Line} label="Reference" value={r.reference || '—'} mono />
                    <Detail icon={RiUserLine} label="From (Customer)" value={r.user ? `${r.user.name} · ${r.user.customerId || ''}` : '—'} />
                    <Detail icon={RiBankLine} label="From Account" value={r.fromAccount || '—'} mono />
                  </div>
                  <p className="text-white/35 text-[11px] mt-2">
                    Requested {safeDate(r.createdAt)} · ETA shown to user: {r.eta}
                  </p>
                </div>

                {/* Right: actions */}
                <div className="flex flex-row lg:flex-col gap-2 lg:w-44 shrink-0">
                  <button
                    onClick={() => act(r.id, 'approve')}
                    disabled={actingId === r.id}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 text-white disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg, ${NEON.green}, #15803d)` }}
                  >
                    {actingId === r.id
                      ? <RiLoader4Line className="animate-spin" />
                      : <><RiCheckboxCircleLine /> Approve</>}
                  </button>
                  <button
                    onClick={() => { setRejectFor(r); setReason(PRESET_REASONS[0]); setCustomReason(''); }}
                    disabled={actingId === r.id}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border disabled:opacity-60"
                    style={{ borderColor: `${NEON.red}66`, background: `${NEON.red}12`, color: NEON.red }}
                  >
                    <RiCloseCircleLine /> Reject
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Reject reason modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {rejectFor && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(3,3,8,0.72)', backdropFilter: 'blur(4px)' }}
            onClick={() => { if (!actingId) setRejectFor(null); }}
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="w-full max-w-md rounded-3xl border bg-[#0d0d14] p-6"
              style={{ borderColor: `${NEON.red}44`, boxShadow: `0 24px 70px rgba(0,0,0,0.6), 0 0 30px ${NEON.red}22` }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0"
                  style={{ borderColor: `${NEON.red}55`, background: `${NEON.red}14` }}>
                  <RiCloseCircleLine size={20} style={{ color: NEON.red }} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">Reject &amp; Refund</h3>
                  <p className="text-white/45 text-xs mt-0.5">
                    {fmt(rejectFor.amount)} → {rejectFor.beneficiaryName || rejectFor.beneficiaryAccount}
                  </p>
                </div>
              </div>

              <p className="text-white/55 text-xs mb-3">
                The full amount will be refunded to the customer and they will receive this reason by email:
              </p>

              <div className="space-y-2 mb-3">
                {PRESET_REASONS.map((opt) => (
                  <label key={opt} className="flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors"
                    style={{
                      borderColor: reason === opt && !customReason ? `${NEON.red}66` : 'rgba(255,255,255,0.08)',
                      background: reason === opt && !customReason ? `${NEON.red}10` : 'transparent',
                    }}>
                    <input type="radio" name="neft-reason" className="mt-0.5 accent-red-500"
                      checked={reason === opt && !customReason}
                      onChange={() => { setReason(opt); setCustomReason(''); }} />
                    <span className="text-sm text-white/80">{opt}</span>
                  </label>
                ))}
              </div>

              <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-1.5">
                Or type a custom reason
              </label>
              <textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                rows={2}
                placeholder="e.g. Beneficiary IFSC is no longer in service."
                className="w-full rounded-xl bg-[#06060c] border border-white/10 p-3 text-sm text-white placeholder-white/25 outline-none resize-none focus:border-white/25"
              />

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { if (!actingId) { setRejectFor(null); setCustomReason(''); } }}
                  disabled={!!actingId}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border text-white/80 disabled:opacity-50"
                  style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={!!actingId}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${NEON.red}, #991b1b)` }}
                >
                  {actingId === rejectFor.id
                    ? <><RiLoader4Line className="animate-spin" /> Refunding…</>
                    : <>Reject &amp; Refund {fmt(rejectFor.amount)}</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Small label/value row used in each request card.
function Detail({ icon: Icon, label, value, mono }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="text-white/30 shrink-0" />
      <span className="text-white/40 text-xs shrink-0">{label}:</span>
      <span className={`text-white/85 truncate ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
