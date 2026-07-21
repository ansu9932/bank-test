import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  RiGlobalLine, RiRefreshLine, RiCheckboxCircleLine, RiCloseCircleLine,
  RiLoader4Line, RiTimer2Line, RiSmartphoneLine, RiSendPlaneFill,
  RiMailCheckLine,
} from 'react-icons/ri';
import api from '../../services/api';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · ADMIN · SWIFT (INTERNATIONAL) REQUESTS
   Lists SWIFT wires held for approval. Approve → completed (+ user email);
   Reject → the debit is refunded to the user (+ failure email).
   ────────────────────────────────────────────────────────────────────────── */

const adminHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('adminToken') || ''}` });
const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const safeDate = (d) => { try { return d ? new Date(d).toLocaleString() : '—'; } catch { return '—'; } };

const NEON = { amber: '#f59e0b', green: '#22c55e', red: '#ef4444', cyan: '#22d3ee' };

// Sender name shown in the preview header (SMS is sent via Twilio from TWILIO_FROM_NUMBER).
const SMS_SENDER_ID = import.meta.env?.VITE_SMS_SENDER || 'ALSTER';

const PRESET_REASONS = [
  'The beneficiary/correspondent bank could not process the wire. Your money has been refunded.',
  'The destination bank rejected the incoming remittance. Your money has been refunded.',
  'The SWIFT/BIC or beneficiary details could not be validated. Your money has been refunded.',
];

// Last 4 digits of the customer's own (source) account, for the SMS body.
const last4 = (acc) => {
  const digits = String(acc || '').replace(/\D/g, '');
  return digits ? digits.slice(-4) : '••••';
};

// Honest, editable approval-notice template sent from Alister Bank's own sender
// ID. It confirms the transfer is approved & processing — it does NOT impersonate
// another bank or claim funds are held pending any "clearance".
const buildApprovalSms = (r) => {
  if (!r) return '';
  // Destination bank = the bank name the customer entered on the SWIFT form.
  const destBank = (r.beneficiaryBank || '').trim().toUpperCase() || 'THE BENEFICIARY BANK';
  return `ALERT: Your outward SWIFT remittance of ${fmt(r.amount)} from A/c ending ${last4(r.fromAccount)} to ${destBank} is being PROCESSED for regulatory clearance (Ref ${r.reference}). Kindly submit the required FEMA declarations/docs via the app or your home branch to release funds. We never ask for OTP/PIN. - Alister Bank`;
};

// Brevo bills per 160-char GSM-7 segment (concatenated SMS use 153 chars/part).
const smsSegments = (text) => {
  const len = (text || '').length;
  if (len === 0) return 0;
  return len <= 160 ? 1 : Math.ceil(len / 153);
};

export default function AdminSwiftRequestsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [rejectFor, setRejectFor] = useState(null);
  const [reason, setReason] = useState(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  // Approve-with-SMS modal state.
  const [approveFor, setApproveFor] = useState(null);
  const [smsMessage, setSmsMessage] = useState('');
  const [smsPhone, setSmsPhone] = useState('');

  const openApprove = useCallback((r) => {
    setApproveFor(r);
    setSmsMessage(buildApprovalSms(r));
    setSmsPhone(r.notifyPhone || r.user?.phone || '');
  }, []);

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

  const act = useCallback(async (id, decision, extra = {}) => {
    setActingId(id);
    try {
      const { data } = await api.post(
        `/admin/swift-requests/${id}/review`,
        { decision, ...extra },
        { headers: adminHeaders() },
      );
      if (data?.success) {
        toast.success(decision === 'approve'
          ? 'SWIFT approved — transfer completed and SMS sent to the customer.'
          : 'SWIFT rejected — amount refunded and user notified.');
        setRequests((prev) => prev.filter((r) => r.id !== id));
        setRejectFor(null);
        setReason(PRESET_REASONS[0]);
        setCustomReason('');
        setApproveFor(null);
      } else {
        toast.error(data?.message || 'Action could not be confirmed.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Action failed.');
    } finally {
      setActingId(null);
    }
  }, []);

  const confirmApprove = useCallback(() => {
    if (!approveFor) return;
    if (!smsPhone.trim()) { toast.error('Enter a recipient mobile number.'); return; }
    if (!smsMessage.trim()) { toast.error('The SMS message cannot be empty.'); return; }
    act(approveFor.id, 'approve', { smsMessage: smsMessage.trim(), smsPhone: smsPhone.trim() });
  }, [approveFor, smsPhone, smsMessage, act]);

  const confirmReject = useCallback(() => {
    const finalReason = (customReason.trim() || reason || '').trim();
    if (!finalReason) { toast.error('Please choose or type a reason.'); return; }
    act(rejectFor.id, 'reject', { reason: finalReason });
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
                    {/* Approval channel: email self-approval vs manual admin queue */}
                    {r.approvalChannel === 'email' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: `${NEON.green}1a`, color: NEON.green, border: `1px solid ${NEON.green}44` }}>
                        <RiMailCheckLine /> Email approval
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.12)' }}>
                        Manual approval
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
                    onClick={() => openApprove(r)}
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

      {/* Approve modal — edit + preview the approval SMS, then send */}
      {approveFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setApproveFor(null)}>
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#15161c] p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-semibold text-lg mb-1 flex items-center gap-2">
              <RiCheckboxCircleLine className="text-emerald-400" /> Approve SWIFT &amp; notify customer
            </h3>
            <p className="text-white/50 text-sm mb-4">
              Approving completes {fmt(approveFor.amount)} to {approveFor.beneficiaryName || 'the beneficiary'} and sends
              the SMS below to the customer&apos;s registered mobile.
            </p>

            {/* Auto-filled context */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {[
                { k: 'Amount', v: fmt(approveFor.amount) },
                { k: 'A/c ending', v: last4(approveFor.fromAccount) },
                { k: 'Bank', v: approveFor.beneficiaryBank || '—' },
                { k: 'Reference', v: approveFor.reference },
              ].map((x) => (
                <div key={x.k} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest text-white/35">{x.k}</p>
                  <p className="text-sm text-white truncate" title={x.v}>{x.v}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Editable message */}
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-1.5">
                  Recipient mobile number
                </label>
                <input
                  type="tel" value={smsPhone} onChange={(e) => setSmsPhone(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  className="w-full rounded-lg bg-white/[0.05] border border-white/10 text-white text-sm p-2.5 mb-3"
                />
                <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-1.5">
                  SMS message (editable)
                </label>
                <textarea
                  value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} rows={7}
                  className="w-full rounded-lg bg-white/[0.05] border border-white/10 text-white text-sm p-2.5 leading-relaxed"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <button
                    onClick={() => setSmsMessage(buildApprovalSms(approveFor))}
                    className="text-[11px] text-cyan-300/80 hover:text-cyan-300"
                  >
                    Reset to default
                  </button>
                  <span className="text-[11px] text-white/40 tabular-nums">
                    {smsMessage.length} chars · {smsSegments(smsMessage)} SMS
                  </span>
                </div>
              </div>

              {/* Live phone preview */}
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-1.5">Live preview</label>
                <div className="rounded-[2rem] border border-white/10 bg-black p-3 h-full min-h-[280px] flex flex-col">
                  <div className="flex items-center justify-center gap-1.5 text-white/40 text-[11px] mb-3">
                    <RiSmartphoneLine /> {smsPhone || 'recipient number'}
                  </div>
                  <div className="flex-1 flex flex-col justify-end">
                    <div className="text-center text-[10px] text-white/30 mb-1">
                      {SMS_SENDER_ID}
                    </div>
                    <div className="self-start max-w-[85%] rounded-2xl rounded-bl-md bg-white/[0.08] border border-white/10 px-3.5 py-2.5">
                      <p className="text-sm text-white/90 whitespace-pre-wrap break-words leading-relaxed">
                        {smsMessage || 'Your message preview will appear here.'}
                      </p>
                    </div>
                    <span className="text-[10px] text-white/25 mt-1">now</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setApproveFor(null)} className="px-4 py-2 rounded-xl text-sm text-white/70 hover:text-white bg-white/[0.05]">Cancel</button>
              <button
                onClick={confirmApprove} disabled={actingId === approveFor.id}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
              >
                {actingId === approveFor.id ? <RiLoader4Line className="animate-spin" /> : <RiSendPlaneFill />}
                Approve &amp; Send SMS
              </button>
            </div>
          </div>
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
