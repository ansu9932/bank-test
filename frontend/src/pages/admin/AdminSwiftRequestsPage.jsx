import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  RiGlobalLine, RiRefreshLine, RiCheckboxCircleLine, RiCloseCircleLine,
  RiLoader4Line, RiTimer2Line,
} from 'react-icons/ri';
import api from '../../services/api';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · ADMIN · SWIFT (INTERNATIONAL) REQUESTS  — DEMO / SIMULATED
   Lists SWIFT wires held for approval. Approve → completed (+ user email);
   Reject → the debit is refunded to the user (+ failure email). These are
   simulated transfers — no real international payment is made.
   ────────────────────────────────────────────────────────────────────────── */

const adminHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('adminToken') || ''}` });
const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const safeDate = (d) => { try { return d ? new Date(d).toLocaleString() : '—'; } catch { return '—'; } };

const NEON = { amber: '#f59e0b', green: '#22c55e', red: '#ef4444', cyan: '#22d3ee' };

const PRESET_REASONS = [
  'The beneficiary/correspondent bank could not process the wire. Your money has been refunded.',
  'The destination bank rejected the incoming remittance. Your money has been refunded.',
  'The SWIFT/BIC or beneficiary details could not be validated. Your money has been refunded.',
];

export default function AdminSwiftRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [reason, setReason] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState('');

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/swift-requests', { headers: adminHeaders() });
      setRequests(data?.data?.requests || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load SWIFT requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const act = useCallback(async (id, decision, rejReason = '') => {
    setActingId(id);
    try {
      const { data } = await api.post(
        `/admin/swift-requests/${id}/review`,
        { decision, reason: rejReason },
        { headers: adminHeaders() },
      );
      if (data?.success) {
        toast.success(decision === 'approve'
          ? 'SWIFT approved — transfer completed and user notified.'
          : 'SWIFT rejected — amount refunded and user notified.');
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <RiGlobalLine style={{ color: NEON.amber }} /> SWIFT Requests
          </h1>
          <p className="text-white/45 text-sm mt-0.5">
            International wires awaiting approval. Approve to complete, or reject to refund the customer.
          </p>
        </div>
        <button
          onClick={fetchRequests}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-sm text-white/70 transition-colors"
        >
          <RiRefreshLine className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

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

      {loading ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#111118] p-16 text-center">
          <RiLoader4Line className="animate-spin text-3xl mx-auto mb-2" style={{ color: NEON.amber }} />
          <p className="text-white/50 text-sm">Loading SWIFT requests…</p>
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-[#111118] p-16 text-center">
          <RiCheckboxCircleLine className="text-4xl mx-auto mb-2" style={{ color: NEON.green }} />
          <p className="text-white/60 text-sm">No SWIFT transfers awaiting approval</p>
          <p className="text-white/30 text-xs mt-1">New SWIFT requests will appear here.</p>
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
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className="text-2xl font-bold tabular-nums" style={{ color: NEON.amber }}>{fmt(r.amount)}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: `${NEON.amber}1a`, color: NEON.amber, border: `1px solid ${NEON.amber}44` }}>
                      <RiTimer2Line /> Awaiting approval
                    </span>
                    {r.country && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: `${NEON.cyan}1a`, color: NEON.cyan, border: `1px solid ${NEON.cyan}44` }}>
                        <RiGlobalLine /> {r.country}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-white/70 space-y-0.5">
                    <p>Beneficiary: <span className="text-white">{r.beneficiaryName || '—'}</span> · A/C {r.beneficiaryAccount || '—'}</p>
                    <p>SWIFT/BIC: <span className="font-mono text-white">{r.swiftCode || '—'}</span>{r.beneficiaryBank ? ` · ${r.beneficiaryBank}` : ''}</p>
                    <p className="text-white/40 text-xs">
                      Ref {r.reference} · {safeDate(r.createdAt)}{r.eta ? ` · ETA: ${r.eta}` : ''}
                    </p>
                    {r.user && (
                      <p className="text-white/40 text-xs">
                        From: {r.user.name} ({r.user.email}) · {r.user.customerId} · A/C {r.fromAccount}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => act(r.id, 'approve')}
                    disabled={actingId === r.id}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                  >
                    <RiCheckboxCircleLine /> Approve
                  </button>
                  <button
                    onClick={() => { setRejectFor(r); setReason(PRESET_REASONS[0]); setCustomReason(''); }}
                    disabled={actingId === r.id}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                  >
                    <RiCloseCircleLine /> Reject
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRejectFor(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#15161c] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-lg mb-1">Reject SWIFT transfer</h3>
            <p className="text-white/50 text-sm mb-4">{fmt(rejectFor.amount)} to {rejectFor.beneficiaryName}. The amount will be refunded and the user emailed this reason:</p>
            <div className="space-y-2 mb-3">
              {PRESET_REASONS.map((p) => (
                <label key={p} className="flex items-start gap-2 text-sm text-white/80 cursor-pointer">
                  <input type="radio" name="rej" checked={reason === p && !customReason} onChange={() => { setReason(p); setCustomReason(''); }} className="mt-1 accent-red-500" />
                  <span>{p}</span>
                </label>
              ))}
            </div>
            <textarea value={customReason} onChange={(e) => setCustomReason(e.target.value)}
              placeholder="…or type a custom reason" rows={2}
              className="w-full rounded-lg bg-white/[0.05] border border-white/10 text-white text-sm p-2.5 mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRejectFor(null)} className="px-4 py-2 rounded-xl text-sm text-white/70 hover:text-white bg-white/[0.05]">Cancel</button>
              <button onClick={confirmReject} disabled={actingId === rejectFor.id}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 disabled:opacity-50">
                Reject &amp; Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
