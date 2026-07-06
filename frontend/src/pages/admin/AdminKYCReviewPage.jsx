import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiShieldCheckLine, RiCloseCircleLine, RiCheckboxCircleLine,
  RiRefreshLine, RiUserLine, RiTimeLine, RiAlertLine,
  RiFileShield2Line, RiImageLine, RiMailLine, RiPhoneLine,
  RiMapPinLine, RiLoader4Line,
  RiSearchLine, RiZoomInLine, RiCloseLine,
} from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const NEON = { green: '#10b981', cyan: '#06b6d4', red: '#ef4444', amber: '#f59e0b' };

// Absolute backend origin for static /uploads assets. The frontend is served
// from a separate static host, so KYC asset links MUST point at the Node
// backend domain explicitly — a relative path would 404 against the frontend
// host. Derived from VITE_API_BASE_URL (with the trailing /api stripped) so it
// always tracks the same backend the API client uses. Falls back to the AWS API.
// The backend serves these under express.static('/uploads'):
//   documents → {BACKEND_ORIGIN}/uploads/documents/{filename}
//   selfies   → {BACKEND_ORIGIN}/uploads/selfies/{filename}
//   videos    → {BACKEND_ORIGIN}/uploads/kyc-videos/{filename}
// document_url already carries the correct sub-folder (sliced from file_path).
const BACKEND_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'https://api.alisterbank.online/api').replace(/\/api\/?$/, '');
const IMG_ORIGIN = BACKEND_ORIGIN;

// /uploads is now an AUTHENTICATED route on the backend. <img>/<video> tags
// cannot send Authorization headers, so the admin token is appended as a
// query param (the httpOnly cookie also covers same-site loads as a fallback).
const authedUploadUrl = (docUrl) => {
  if (!docUrl) return null;
  const token = localStorage.getItem('adminToken');
  return `${IMG_ORIGIN}${docUrl}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};

// Safe date formatter — never throws on null/invalid timestamps.
const safeDate = (value, pattern = 'dd MMM yyyy, HH:mm', fallback = 'Recent') => {
  if (!value) return fallback;
  const d = new Date(value);
  if (isNaN(d.getTime())) return fallback;
  try { return format(d, pattern); } catch { return fallback; }
};

const adminHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('adminToken')}` });

// Resolve the best snapshot document for a queue entry (shared by the inline
// viewer and the full-size lightbox). Prefers the Phase-5 video_kyc capture.
const resolveSnapshot = (documents) => {
  if (!documents || documents.length === 0) return null;
  return (
    documents.find((d) => d.document_type === 'video_kyc') ||
    documents.find((d) => ['selfie', 'passport', 'aadhaar'].includes(d.document_type)) ||
    documents[0]
  );
};

// Quick-filter definitions for the queue.
const FILTERS = [
  { key: 'all',      label: 'All Pending' },
  { key: 'awaiting', label: 'Awaiting Capture' },
  { key: 'received', label: 'Capture Received' },
];

const matchesFilter = (user, key) => {
  if (key === 'awaiting') return !user.video_kyc_completed;
  if (key === 'received') return !!user.video_kyc_completed;
  return true; // 'all'
};

const matchesSearch = (user, term) => {
  if (!term) return true;
  const t = term.toLowerCase();
  return [
    user.first_name, user.last_name, user.email, user.customer_id, user.phone,
    `${user.first_name || ''} ${user.last_name || ''}`,
  ].some((v) => String(v || '').toLowerCase().includes(t));
};


// ─── Snapshot viewer (Phase-5 captured ID image) ─────────────────────────────
function SnapshotViewer({ documents, onExpand }) {
  // Prefer the cyber video-KYC capture; fall back to any available document.
  const snapshot = useMemo(() => resolveSnapshot(documents), [documents]);

  if (!snapshot || !snapshot.document_url) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0d0d14] aspect-video flex flex-col items-center justify-center text-center p-6">
        <RiImageLine className="text-4xl text-white/20 mb-2" />
        <p className="text-white/40 text-sm">No captured snapshot on file</p>
        <p className="text-white/25 text-xs mt-1">The user may not have completed Phase 5 capture.</p>
      </div>
    );
  }

  const src = authedUploadUrl(snapshot.document_url);

  return (
    <button
      type="button"
      onClick={onExpand}
      title="Click to inspect full-size"
      className="group relative w-full rounded-2xl border overflow-hidden bg-black cursor-zoom-in"
      style={{ borderColor: `${NEON.cyan}55`, boxShadow: `0 0 26px ${NEON.cyan}22` }}
    >
      <img src={src} alt="Captured KYC snapshot" className="w-full h-full object-contain max-h-80" />
      {/* HUD corner brackets */}
      {['top-3 left-3 border-t-2 border-l-2', 'top-3 right-3 border-t-2 border-r-2',
        'bottom-3 left-3 border-b-2 border-l-2', 'bottom-3 right-3 border-b-2 border-r-2'].map((c, i) => (
        <div key={i} className={`absolute w-6 h-6 ${c}`} style={{ borderColor: NEON.cyan }} />
      ))}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
        style={{ background: `${NEON.cyan}1c`, border: `1px solid ${NEON.cyan}66` }}>
        <RiFileShield2Line size={12} style={{ color: NEON.cyan }} />
        <span className="text-[10px] font-mono tracking-widest" style={{ color: NEON.cyan }}>
          {snapshot.document_type?.toUpperCase().replace('_', ' ')}
        </span>
      </div>
      {/* Hover "View Full-Size" overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'rgba(3,3,8,0.45)' }}>
        <span className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold tracking-wide uppercase"
          style={{ background: `${NEON.cyan}1c`, border: `1px solid ${NEON.cyan}`, color: NEON.cyan, boxShadow: `0 0 18px ${NEON.cyan}55` }}>
          <RiZoomInLine size={15} /> View Full-Size
        </span>
      </div>
    </button>
  );
}

// ─── Full-size snapshot lightbox ──────────────────────────────────────────────
function SnapshotLightbox({ open, src, label, applicant, onClose }) {
  // Close on Escape for fast keyboard-driven review.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && src && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ background: 'rgba(2,2,6,0.88)', backdropFilter: 'blur(6px)' }}
          onClick={onClose}
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-4">
            <div className="flex items-center gap-2">
              <RiFileShield2Line size={16} style={{ color: NEON.cyan }} />
              <span className="text-[11px] font-mono tracking-widest uppercase" style={{ color: NEON.cyan }}>
                {label || 'KYC Snapshot'}
              </span>
              {applicant && <span className="text-white/40 text-xs">· {applicant}</span>}
            </div>
            <div className="flex items-center gap-2">
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 px-3 h-9 rounded-xl border text-[11px] font-semibold tracking-wide uppercase transition-colors"
                style={{ borderColor: `${NEON.cyan}66`, background: `${NEON.cyan}14`, color: NEON.cyan }}
                aria-label="Open the original document in a new browser tab"
              >
                <RiFileShield2Line size={14} /> Open Original
              </a>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center border text-white/70 hover:text-white transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}
                aria-label="Close full-size view"
              >
                <RiCloseLine size={18} />
              </button>
            </div>
          </div>

          {/* Framed image */}
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="relative rounded-2xl border overflow-hidden"
            style={{ borderColor: `${NEON.cyan}`, boxShadow: `0 0 50px ${NEON.cyan}55`, maxWidth: '92vw', maxHeight: '82vh' }}
          >
            <img src={src} alt="Full-size KYC snapshot" className="block max-w-full" style={{ maxHeight: '82vh' }} />
            {/* HUD corner brackets */}
            {['top-3 left-3 border-t-2 border-l-2', 'top-3 right-3 border-t-2 border-r-2',
              'bottom-3 left-3 border-b-2 border-l-2', 'bottom-3 right-3 border-b-2 border-r-2'].map((c, i) => (
              <div key={i} className={`absolute w-8 h-8 ${c} pointer-events-none`} style={{ borderColor: NEON.cyan }} />
            ))}
          </motion.div>

          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/35 text-[11px] tracking-widest uppercase">
            Click anywhere or press Esc to close
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


// ─── Profile detail row ───────────────────────────────────────────────────────
function DetailRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-center flex-shrink-0">
        <Icon className="text-sm" style={{ color: NEON.cyan }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-white/35">{label}</p>
        <p className="text-sm text-white/90 font-medium truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

// ─── Queue list card ──────────────────────────────────────────────────────────
function QueueCard({ user, active, onSelect }) {
  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || 'U';
  return (
    <button
      onClick={() => onSelect(user)}
      className="w-full text-left rounded-2xl border p-4 transition-all"
      style={{
        borderColor: active ? `${NEON.cyan}` : 'rgba(255,255,255,0.08)',
        background: active ? `${NEON.cyan}10` : 'rgba(255,255,255,0.02)',
        boxShadow: active ? `0 0 20px ${NEON.cyan}33` : 'none',
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border"
          style={{ background: `${NEON.cyan}1a`, borderColor: `${NEON.cyan}44` }}>
          <span className="text-xs font-bold" style={{ color: NEON.cyan }}>{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{user.first_name} {user.last_name}</p>
          <p className="text-xs text-white/40 truncate">{user.customer_id} · {user.email}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
          style={{ background: `${NEON.amber}1a`, color: NEON.amber, border: `1px solid ${NEON.amber}44` }}>
          <RiTimeLine size={11} /> {user.kyc_status?.replace(/_/g, ' ')}
        </span>
        <span className="text-[10px] text-white/30">{safeDate(user.updated_at, 'dd MMM, HH:mm')}</span>
      </div>
    </button>
  );
}


// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminKYCReviewPage() {
  const [queue, setQueue] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false); // approve/reject in flight
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/kyc-queue', { headers: adminHeaders() });
      const list = data?.data?.queue || [];
      setQueue(list);
      // Keep selection in sync (or auto-select the first item).
      setSelected((prev) => {
        if (prev) {
          const refreshed = list.find((u) => u.id === prev.id);
          return refreshed || list[0] || null;
        }
        return list[0] || null;
      });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to load KYC queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const review = useCallback(async (decision, reason = '') => {
    if (!selected) return;
    setLightboxOpen(false);
    setActing(true);
    try {
      const { data } = await api.post(
        `/admin/users/${selected.id}/kyc-review`,
        { decision, reason },
        { headers: adminHeaders() }
      );
      if (data?.success) {
        toast.success(
          decision === 'approve'
            ? `Approved — account ${data.data?.accountNumber || ''} activated.`
            : 'Submission rejected. User notified.'
        );
        // Remove the actioned user from the queue and advance selection.
        setQueue((prev) => {
          const remaining = prev.filter((u) => u.id !== selected.id);
          setSelected(remaining[0] || null);
          return remaining;
        });
      } else {
        toast.error(data?.message || 'Action could not be confirmed.');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Review action failed.');
    } finally {
      setActing(false);
    }
  }, [selected]);

  // Confirm rejection from the themed modal (replaces the native window.prompt).
  const confirmReject = useCallback(() => {
    if (!rejectReason.trim()) { toast.error('A rejection reason is required.'); return; }
    const reason = rejectReason.trim();
    setRejectOpen(false);
    setRejectReason('');
    review('reject', reason);
  }, [rejectReason, review]);

  // Live-filtered queue (search term + quick filter), recomputed reactively.
  const filteredQueue = useMemo(
    () => queue.filter((u) => matchesFilter(u, filterMode) && matchesSearch(u, searchTerm)),
    [queue, filterMode, searchTerm]
  );

  // Resolve the currently-selected snapshot for the full-size lightbox.
  const selectedSnapshot = useMemo(
    () => (selected ? resolveSnapshot(selected.documents) : null),
    [selected]
  );
  const lightboxSrc = selectedSnapshot?.document_url ? authedUploadUrl(selectedSnapshot.document_url) : null;

  return (
    <div className="text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <RiShieldCheckLine style={{ color: NEON.cyan }} /> KYC Review Console
          </h1>
          <p className="text-white/45 text-sm mt-0.5">
            Verify pending biometric submissions and activate approved accounts.
          </p>
        </div>
        <button
          onClick={fetchQueue}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] text-sm text-white/70 transition-colors"
        >
          <RiRefreshLine className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Pending Review', value: queue.length, color: NEON.amber },
          { label: 'Awaiting Capture', value: queue.filter((u) => !u.video_kyc_completed).length, color: NEON.cyan },
          { label: 'Capture Received', value: queue.filter((u) => u.video_kyc_completed).length, color: NEON.green },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-[#111118] p-4">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-[11px] uppercase tracking-widest text-white/40 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Two-column workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Queue list */}
        <div className="lg:col-span-1 space-y-3">
          <p className="text-[11px] uppercase tracking-widest text-white/35 px-1">Submission Queue</p>

          {/* Search bar */}
          <div className="relative">
            <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={15} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, email, ID, phone…"
              className="w-full rounded-xl bg-[#0d0d14] border border-white/10 pl-9 pr-9 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/25 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70"
                aria-label="Clear search"
              >
                <RiCloseLine size={16} />
              </button>
            )}
          </div>

          {/* Quick-toggle filters */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => {
              const active = filterMode === f.key;
              const count = queue.filter((u) => matchesFilter(u, f.key)).length;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilterMode(f.key)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold tracking-wide transition-all border"
                  style={{
                    borderColor: active ? NEON.cyan : 'rgba(255,255,255,0.08)',
                    background: active ? `${NEON.cyan}1a` : 'rgba(255,255,255,0.02)',
                    color: active ? NEON.cyan : 'rgba(255,255,255,0.55)',
                    boxShadow: active ? `0 0 14px ${NEON.cyan}33` : 'none',
                  }}
                >
                  {f.label}
                  <span className="ml-1.5 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RiLoader4Line className="animate-spin text-3xl" style={{ color: NEON.cyan }} />
            </div>
          ) : queue.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-[#111118] p-8 text-center">
              <RiCheckboxCircleLine className="text-4xl mx-auto mb-2" style={{ color: NEON.green }} />
              <p className="text-white/60 text-sm">Queue is clear</p>
              <p className="text-white/30 text-xs mt-1">No pending KYC submissions.</p>
            </div>
          ) : filteredQueue.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.06] bg-[#111118] p-8 text-center">
              <RiSearchLine className="text-3xl mx-auto mb-2 text-white/20" />
              <p className="text-white/55 text-sm">No matches</p>
              <p className="text-white/30 text-xs mt-1">Try a different search or filter.</p>
            </div>
          ) : (
            filteredQueue.map((u) => (
              <QueueCard key={u.id} user={u} active={selected?.id === u.id} onSelect={setSelected} />
            ))
          )}
        </div>

        {/* Detail + actions */}
        <div className="lg:col-span-2">
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }}
                className="rounded-3xl border border-white/[0.06] bg-[#111118] p-6"
                style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.5)' }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Snapshot */}
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-white/35 mb-2">Phase 5 · Captured Snapshot</p>
                    <SnapshotViewer documents={selected.documents} onExpand={() => setLightboxOpen(true)} />
                  </div>

                  {/* Profile */}
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-white/35 mb-2">Applicant Profile</p>
                    <div className="rounded-2xl border border-white/[0.06] bg-[#0d0d14] px-4 py-1">
                      <DetailRow icon={RiUserLine} label="Full Name" value={`${selected.first_name || ''} ${selected.last_name || ''}`} />
                      <DetailRow icon={RiFileShield2Line} label="Customer ID" value={selected.customer_id} />
                      <DetailRow icon={RiMailLine} label="Email" value={selected.email} />
                      <DetailRow icon={RiPhoneLine} label="Phone" value={selected.phone} />
                      <DetailRow icon={RiMapPinLine} label="Location" value={[selected.city, selected.state].filter(Boolean).join(', ')} />
                      <DetailRow icon={RiFileShield2Line} label="Account Type" value={selected.account_type?.toUpperCase()} />
                    </div>
                  </div>
                </div>

                {/* Status banner */}
                <div className="flex items-center gap-2 mt-5 px-4 py-3 rounded-xl border"
                  style={{ borderColor: `${NEON.amber}44`, background: `${NEON.amber}10` }}>
                  <RiAlertLine style={{ color: NEON.amber }} />
                  <span className="text-sm text-white/70">
                    Status: <span className="font-semibold" style={{ color: NEON.amber }}>{selected.kyc_status?.replace(/_/g, ' ')}</span>
                    {' · '}Submitted {safeDate(selected.updated_at)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 mt-5">
                  <button
                    onClick={() => setRejectOpen(true)}
                    disabled={acting}
                    className="flex-1 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase flex items-center justify-center gap-2 border disabled:opacity-50"
                    style={{ borderColor: `${NEON.red}66`, background: `${NEON.red}12`, color: NEON.red }}
                  >
                    <RiCloseCircleLine size={18} /> Reject
                  </button>
                  <button
                    onClick={() => review('approve')}
                    disabled={acting}
                    className="flex-1 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase flex items-center justify-center gap-2 text-white disabled:opacity-60"
                    style={{ background: `linear-gradient(135deg, ${NEON.green}, ${NEON.cyan})`, boxShadow: `0 0 26px ${NEON.green}44` }}
                  >
                    {acting
                      ? <><RiLoader4Line className="animate-spin" size={18} /> Processing…</>
                      : <><RiCheckboxCircleLine size={18} /> Approve &amp; Activate</>}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-3xl border border-white/[0.06] bg-[#111118] p-16 text-center h-full flex flex-col items-center justify-center"
              >
                <RiShieldCheckLine className="text-5xl text-white/15 mb-3" />
                <p className="text-white/50 text-sm">Select a submission to review</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Reject reason modal (themed replacement for window.prompt) ─────── */}
      <AnimatePresence>
        {rejectOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ background: 'rgba(3,3,8,0.72)', backdropFilter: 'blur(4px)' }}
            onClick={() => { if (!acting) { setRejectOpen(false); setRejectReason(''); } }}
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
                  <h3 className="text-white font-bold text-base leading-tight">Reject Submission</h3>
                  <p className="text-white/45 text-xs mt-0.5">
                    {selected ? `${selected.first_name} ${selected.last_name} · ${selected.customer_id}` : ''}
                  </p>
                </div>
              </div>

              <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-2">
                Reason (visible to the user)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="e.g. Captured document is blurred — please retake in better lighting."
                className="w-full rounded-xl bg-[#06060c] border border-white/10 p-3 text-sm text-white placeholder-white/25 outline-none resize-none focus:border-white/25"
              />

              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setRejectOpen(false); setRejectReason(''); }}
                  disabled={acting}
                  className="flex-1 py-3 rounded-2xl font-semibold text-sm tracking-wide uppercase border border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={acting || !rejectReason.trim()}
                  className="flex-1 py-3 rounded-2xl font-semibold text-sm tracking-wide uppercase flex items-center justify-center gap-2 text-white disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${NEON.red}, #b91c1c)`, boxShadow: `0 0 22px ${NEON.red}44` }}
                >
                  {acting
                    ? <><RiLoader4Line className="animate-spin" size={16} /> Rejecting…</>
                    : <><RiCloseCircleLine size={16} /> Confirm Reject</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full-size snapshot lightbox ───────────────────────────────────── */}
      <SnapshotLightbox
        open={lightboxOpen}
        src={lightboxSrc}
        label={selectedSnapshot?.document_type?.toUpperCase().replace('_', ' ')}
        applicant={selected ? `${selected.first_name} ${selected.last_name}` : ''}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
