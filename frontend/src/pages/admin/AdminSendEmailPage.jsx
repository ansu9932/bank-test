import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  RiMailSendLine, RiSearchLine, RiRefreshLine, RiCheckLine,
  RiCloseLine, RiGroupLine, RiUserLine, RiSendPlaneFill,
  RiAttachment2, RiFile3Line, RiHistoryLine,
} from 'react-icons/ri';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';

// Recipients are sent in small batches so we can show real progress and stay
// within the mail relay's throughput. Keep <= backend per-batch cap (100).
const BATCH_SIZE = 25;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACH_MB = 15;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const prettySize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Admin → Send Email
 *
 * Compose a plain-text message (full copy-paste support), optionally attach
 * files, pick recipients (hand-picked or everyone), then send. Sending happens
 * in batches with a live progress bar, and every send is recorded in Mail
 * History. Recipients are mailed individually — no customer sees another's
 * address.
 */
export default function AdminSendEmailPage() {
  // ── Compose state ─────────────────────────────────────────────────────────
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [greet, setGreet] = useState(true);

  // ── Attachments ───────────────────────────────────────────────────────────
  const [files, setFiles] = useState([]); // File[] chosen locally
  const fileInputRef = useRef(null);

  // ── Recipient state ───────────────────────────────────────────────────────
  const [mode, setMode] = useState('selected'); // 'selected' | 'all'
  const [onlyActive, setOnlyActive] = useState(false);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Map()); // id -> {name,email}

  // ── Send / progress state ───────────────────────────────────────────────────
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, sent, failed }

  // ── Fetch users for the picker ──────────────────────────────────────────
  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users', { params: { search, limit: 50 } });
      setUsers(data.data.users || []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(fetchUsers, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleUser = (u) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(u.id)) next.delete(u.id);
      else next.set(u.id, { name: `${u.first_name || ''} ${u.last_name || ''}`.trim(), email: u.email });
      return next;
    });
  };
  const selectAllVisible = () => {
    setSelected((prev) => {
      const next = new Map(prev);
      users.forEach((u) => {
        if (u.email) next.set(u.id, { name: `${u.first_name || ''} ${u.last_name || ''}`.trim(), email: u.email });
      });
      return next;
    });
  };
  const clearSelection = () => setSelected(new Map());

  const selectedCount = selected.size;

  // ── Attachment helpers ────────────────────────────────────────────────────
  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-picking the same file
    if (picked.length === 0) return;
    const tooBig = picked.find((f) => f.size > MAX_ATTACH_MB * 1024 * 1024);
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over ${MAX_ATTACH_MB} MB.`);
      return;
    }
    setFiles((prev) => {
      const merged = [...prev, ...picked].slice(0, MAX_ATTACHMENTS);
      if (prev.length + picked.length > MAX_ATTACHMENTS) {
        toast.error(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      }
      return merged;
    });
  };
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const canSend = useMemo(() => {
    if (!subject.trim() || !body.trim()) return false;
    if (mode === 'selected') return selectedCount > 0;
    return true;
  }, [subject, body, mode, selectedCount]);

  // ── Send ────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!canSend || sending) return;

    const target = mode === 'all'
      ? `ALL users${onlyActive ? ' with an active account' : ''}`
      : `${selectedCount} selected user${selectedCount === 1 ? '' : 's'}`;
    if (!window.confirm(`Send this email to ${target}?`)) return;

    setSending(true);
    setProgress({ done: 0, total: 0, sent: 0, failed: 0 });

    try {
      // 1. Upload attachments (once) → get refs reused for every batch.
      let attachmentRefs = [];
      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        const up = await api.post('/admin/email-attachments', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        attachmentRefs = up.data.data.attachments || [];
      }

      // 2. Resolve recipient IDs.
      let ids;
      if (mode === 'all') {
        const r = await api.get('/admin/user-ids', { params: { onlyActive } });
        ids = r.data.data.ids || [];
      } else {
        ids = Array.from(selected.keys());
      }
      if (ids.length === 0) {
        toast.error('No recipients with an email address were found.');
        setSending(false);
        setProgress(null);
        return;
      }

      setProgress({ done: 0, total: ids.length, sent: 0, failed: 0 });

      // 3. Create the campaign (mail-history row).
      const campaignRes = await api.post('/admin/email-campaigns', {
        subject: subject.trim(),
        body,
        greet,
        sendToAll: mode === 'all',
        onlyActive: mode === 'all' ? onlyActive : false,
        totalRecipients: ids.length,
        attachmentNames: attachmentRefs.map((a) => a.filename),
      });
      const campaignId = campaignRes.data.data.campaignId;

      // 4. Send in batches, updating the progress bar as each returns.
      let sentTotal = 0;
      let failedTotal = 0;
      let done = 0;
      for (const batch of chunk(ids, BATCH_SIZE)) {
        try {
          const res = await api.post('/admin/send-email', {
            subject: subject.trim(),
            body,
            greet,
            userIds: batch,
            attachments: attachmentRefs,
            campaignId,
          });
          sentTotal += res.data.data.sent || 0;
          failedTotal += res.data.data.failed || 0;
        } catch {
          failedTotal += batch.length; // whole batch failed (network/server)
        }
        done += batch.length;
        setProgress({ done, total: ids.length, sent: sentTotal, failed: failedTotal });
      }

      if (failedTotal > 0) {
        toast.success(`Done: ${sentTotal} sent, ${failedTotal} failed.`, { duration: 6000 });
      } else {
        toast.success(`Email sent to ${sentTotal} recipient${sentTotal === 1 ? '' : 's'}. 🎉`);
      }

      // Reset composer (keep a brief view of the completed bar).
      setSubject('');
      setBody('');
      setFiles([]);
      clearSelection();
      setTimeout(() => setProgress(null), 2500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send the email.');
      setProgress(null);
    } finally {
      setSending(false);
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Send Email</h1>
          <p className="text-dark-300 text-sm mt-0.5">Compose a message and send it to your users</p>
        </div>
        <Link to="/admin/mail-history" className="btn-ghost text-sm">
          <RiHistoryLine /> Mail History
        </Link>
      </div>

      {/* Progress bar (shown while/just after sending) */}
      {progress && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-white font-medium flex items-center gap-2">
              {sending ? <span className="spinner w-4 h-4" style={{ borderWidth: 2 }} /> : <RiCheckLine className="text-green-400" />}
              {sending ? 'Sending emails…' : 'Send complete'}
            </span>
            <span className="text-dark-300">
              {progress.done}/{progress.total} · <span className="text-green-400">{progress.sent} sent</span>
              {progress.failed > 0 && <> · <span className="text-red-400">{progress.failed} failed</span></>}
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-dark-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ── Composer ──────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">
          <div className="glass-card p-5 space-y-4">
            <div>
              <label className="block text-dark-200 text-sm mb-1.5">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Important update about your account"
                className="input-field"
                maxLength={200}
                disabled={sending}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-dark-200 text-sm">Message</label>
                <span className="text-dark-400 text-xs">{body.length} characters</span>
              </div>
              {/* Plain textarea — supports copy / paste / cut natively. */}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"Write or paste your message here...\n\nTip: leave a blank line between paragraphs. Line breaks are preserved."}
                rows={11}
                className="input-field resize-y leading-relaxed"
                disabled={sending}
                spellCheck
              />
              <p className="text-dark-400 text-xs mt-1.5">
                Your message is wrapped in the official Alister Bank email template automatically.
              </p>
            </div>

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-dark-200 text-sm">Attachments <span className="text-dark-400">(optional)</span></label>
                <span className="text-dark-400 text-xs">up to {MAX_ATTACHMENTS} files · {MAX_ATTACH_MB} MB each</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={onPickFiles}
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || files.length >= MAX_ATTACHMENTS}
                className="btn-ghost text-sm disabled:opacity-40"
              >
                <RiAttachment2 /> Add files
              </button>

              {files.length > 0 && (
                <div className="mt-2.5 space-y-1.5">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-dark-800 border border-white/[0.06]">
                      <RiFile3Line className="text-brand-400 flex-shrink-0" />
                      <span className="text-white text-sm truncate flex-1">{f.name}</span>
                      <span className="text-dark-400 text-xs flex-shrink-0">{prettySize(f.size)}</span>
                      {!sending && (
                        <RiCloseLine className="text-dark-300 hover:text-red-400 cursor-pointer flex-shrink-0" onClick={() => removeFile(i)} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={greet}
                onChange={(e) => setGreet(e.target.checked)}
                className="w-4 h-4 accent-brand-500"
                disabled={sending}
              />
              <span className="text-dark-200 text-sm">
                Personalize with each recipient's name (<span className="text-dark-400">"Dear John,"</span>)
              </span>
            </label>
          </div>

          {/* Send bar */}
          <div className="glass-card p-4 flex items-center justify-between gap-3">
            <p className="text-dark-300 text-sm">
              {mode === 'all'
                ? <>Sending to <span className="text-brand-400 font-medium">all users{onlyActive ? ' (active only)' : ''}</span></>
                : <>Sending to <span className="text-brand-400 font-medium">{selectedCount}</span> selected user{selectedCount === 1 ? '' : 's'}</>}
            </p>
            <button onClick={handleSend} disabled={!canSend || sending} className="btn-primary">
              {sending ? (
                <><span className="spinner w-4 h-4" style={{ borderWidth: 2 }} /> Sending...</>
              ) : (
                <><RiSendPlaneFill /> Send Email</>
              )}
            </button>
          </div>
        </div>

        {/* ── Recipients ────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('selected')}
                disabled={sending}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${mode === 'selected' ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25' : 'bg-dark-800 text-dark-300 border border-white/[0.06] hover:text-white'}`}
              >
                <RiUserLine /> Pick users
              </button>
              <button
                onClick={() => setMode('all')}
                disabled={sending}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${mode === 'all' ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25' : 'bg-dark-800 text-dark-300 border border-white/[0.06] hover:text-white'}`}
              >
                <RiGroupLine /> All users
              </button>
            </div>

            {mode === 'all' ? (
              <div className="p-3 rounded-xl bg-dark-800 border border-white/[0.06]">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyActive}
                    onChange={(e) => setOnlyActive(e.target.checked)}
                    className="w-4 h-4 accent-brand-500"
                    disabled={sending}
                  />
                  <span className="text-dark-200 text-sm">Only users with an active account</span>
                </label>
                <p className="text-dark-400 text-xs mt-2">
                  The email will be delivered to every registered user{onlyActive ? ' whose account is active' : ''}.
                </p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <RiSearchLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                  <input
                    type="text"
                    placeholder="Search name, email, customer ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-field pl-10 py-2.5"
                    disabled={sending}
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-dark-400">{selectedCount} selected</span>
                  <div className="flex items-center gap-1">
                    <button onClick={selectAllVisible} disabled={sending} className="px-2 py-1 rounded-lg text-brand-400 hover:bg-brand-500/10">Select shown</button>
                    <button onClick={clearSelection} disabled={!selectedCount || sending} className="px-2 py-1 rounded-lg text-dark-300 hover:bg-white/[0.05] disabled:opacity-30">Clear</button>
                    <button onClick={fetchUsers} disabled={sending} className="p-1.5 rounded-lg text-dark-300 hover:bg-white/[0.05]" title="Refresh"><RiRefreshLine /></button>
                  </div>
                </div>

                <div className="max-h-[380px] overflow-y-auto rounded-xl border border-white/[0.05] divide-y divide-white/[0.04]">
                  {loading ? (
                    <div className="p-8 text-center"><div className="spinner w-7 h-7 mx-auto" style={{ borderWidth: 3 }} /></div>
                  ) : users.length === 0 ? (
                    <div className="p-8 text-center text-dark-400 text-sm">No users found</div>
                  ) : (
                    users.map((u) => {
                      const isSel = selected.has(u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => u.email && toggleUser(u)}
                          disabled={!u.email || sending}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors
                            ${isSel ? 'bg-brand-500/10' : 'hover:bg-white/[0.02]'} disabled:opacity-40`}
                        >
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border transition-colors
                            ${isSel ? 'bg-brand-500 border-brand-500' : 'border-white/20'}`}>
                            {isSel && <RiCheckLine className="text-white text-xs" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm font-medium truncate">{u.first_name} {u.last_name}</p>
                            <p className="text-dark-400 text-xs truncate">{u.email || 'No email on file'}</p>
                          </div>
                          <span className="text-dark-500 text-[10px] font-mono flex-shrink-0">{u.customer_id}</span>
                        </button>
                      );
                    })
                  )}
                </div>

                {selectedCount > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {Array.from(selected.entries()).slice(0, 12).map(([id, r]) => (
                      <span key={id} className="badge badge-brand max-w-full">
                        <span className="truncate">{r.name || r.email}</span>
                        {!sending && (
                          <RiCloseLine className="cursor-pointer flex-shrink-0" onClick={() => setSelected((prev) => { const n = new Map(prev); n.delete(id); return n; })} />
                        )}
                      </span>
                    ))}
                    {selectedCount > 12 && <span className="badge badge-info">+{selectedCount - 12} more</span>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
