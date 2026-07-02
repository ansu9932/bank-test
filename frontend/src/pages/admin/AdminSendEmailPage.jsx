import React, { useEffect, useMemo, useState } from 'react';
import {
  RiMailSendLine, RiSearchLine, RiRefreshLine, RiCheckLine,
  RiCloseLine, RiGroupLine, RiUserLine, RiSendPlaneFill,
} from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * Admin → Send Email
 *
 * Compose a plain-text message (full copy-paste support in the body box) and
 * dispatch it to a hand-picked set of users or to everyone. Recipients are
 * mailed individually through the branded Alister Bank email pipeline, so no
 * customer ever sees another customer's address.
 */
export default function AdminSendEmailPage() {
  // ── Compose state ─────────────────────────────────────────────────────────
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [greet, setGreet] = useState(true);

  // ── Recipient state ───────────────────────────────────────────────────────
  const [mode, setMode] = useState('selected'); // 'selected' | 'all'
  const [onlyActive, setOnlyActive] = useState(false);

  // Users list (for the picker)
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Selected recipients — kept in a Map (id -> {name, email}) so the choice
  // survives searching/filtering the list.
  const [selected, setSelected] = useState(() => new Map());

  const [sending, setSending] = useState(false);

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
    const t = setTimeout(fetchUsers, 300); // debounce search
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
  const allVisibleSelected = users.length > 0 && users.every((u) => selected.has(u.id));

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
    const payload = { subject: subject.trim(), body, greet };
    if (mode === 'all') { payload.sendToAll = true; payload.onlyActive = onlyActive; }
    else { payload.userIds = Array.from(selected.keys()); }

    try {
      const { data } = await api.post('/admin/send-email', payload);
      const { sent, total, failed } = data.data || {};
      if (failed) {
        toast.success(`Sent to ${sent}/${total}. ${failed} failed — check logs.`, { duration: 6000 });
      } else {
        toast.success(`Email sent to ${sent} recipient${sent === 1 ? '' : 's'}. 🎉`);
      }
      // Reset the composer but keep the recipient selection cleared.
      setSubject('');
      setBody('');
      clearSelection();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send the email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Send Email</h1>
          <p className="text-dark-300 text-sm mt-0.5">Compose a message and send it to your users</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-brand-400">
          <RiMailSendLine className="text-2xl" />
        </div>
      </div>

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
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-dark-200 text-sm">Message</label>
                <span className="text-dark-400 text-xs">{body.length} characters</span>
              </div>
              {/* Plain textarea — supports copy / paste / cut natively (Ctrl/Cmd+C/V/X). */}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={"Write or paste your message here...\n\nTip: leave a blank line between paragraphs. Line breaks are preserved."}
                rows={12}
                className="input-field resize-y leading-relaxed font-normal"
                spellCheck
              />
              <p className="text-dark-400 text-xs mt-1.5">
                Your message is wrapped in the official Alister Bank email template automatically.
              </p>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={greet}
                onChange={(e) => setGreet(e.target.checked)}
                className="w-4 h-4 accent-brand-500"
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
                <>
                  <span className="spinner w-4 h-4" style={{ borderWidth: 2 }} /> Sending...
                </>
              ) : (
                <>
                  <RiSendPlaneFill /> Send Email
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Recipients ────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-4 space-y-3">
            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMode('selected')}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${mode === 'selected' ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25' : 'bg-dark-800 text-dark-300 border border-white/[0.06] hover:text-white'}`}
              >
                <RiUserLine /> Pick users
              </button>
              <button
                onClick={() => setMode('all')}
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
                  />
                  <span className="text-dark-200 text-sm">Only users with an active account</span>
                </label>
                <p className="text-dark-400 text-xs mt-2">
                  The email will be delivered to every registered user{onlyActive ? ' whose account is active' : ''}.
                </p>
              </div>
            ) : (
              <>
                {/* Search + bulk actions */}
                <div className="relative">
                  <RiSearchLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                  <input
                    type="text"
                    placeholder="Search name, email, customer ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="input-field pl-10 py-2.5"
                  />
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-dark-400">
                    {selectedCount} selected
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={selectAllVisible} className="px-2 py-1 rounded-lg text-brand-400 hover:bg-brand-500/10">
                      Select shown
                    </button>
                    <button onClick={clearSelection} disabled={!selectedCount} className="px-2 py-1 rounded-lg text-dark-300 hover:bg-white/[0.05] disabled:opacity-30">
                      Clear
                    </button>
                    <button onClick={fetchUsers} className="p-1.5 rounded-lg text-dark-300 hover:bg-white/[0.05]" title="Refresh">
                      <RiRefreshLine />
                    </button>
                  </div>
                </div>

                {/* User list */}
                <div className="max-h-[420px] overflow-y-auto rounded-xl border border-white/[0.05] divide-y divide-white/[0.04]">
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
                          disabled={!u.email}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors
                            ${isSel ? 'bg-brand-500/10' : 'hover:bg-white/[0.02]'} disabled:opacity-40`}
                        >
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 border transition-colors
                            ${isSel ? 'bg-brand-500 border-brand-500' : 'border-white/20'}`}>
                            {isSel && <RiCheckLine className="text-white text-xs" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm font-medium truncate">
                              {u.first_name} {u.last_name}
                            </p>
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
                        <RiCloseLine
                          className="cursor-pointer flex-shrink-0"
                          onClick={() => setSelected((prev) => { const n = new Map(prev); n.delete(id); return n; })}
                        />
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
