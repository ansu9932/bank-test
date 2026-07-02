import React, { useEffect, useState } from 'react';
import {
  RiHistoryLine, RiRefreshLine, RiMailSendLine, RiAttachment2,
  RiArrowLeftSLine, RiArrowRightSLine, RiCloseLine,
} from 'react-icons/ri';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';

const STATUS_BADGE = {
  completed: 'badge-success',
  partial: 'badge-warning',
  failed: 'badge-danger',
  sending: 'badge-info',
};

const fmtDate = (d) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(d); }
};

/**
 * Admin → Mail History
 *
 * Read-only log of every manual email campaign an admin has sent: subject,
 * sender, recipient count, delivered/failed tallies, attachments, status, and
 * time. Click a row to read the full message that went out.
 */
export default function AdminMailHistoryPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(null); // campaign opened in the reader

  const fetchCampaigns = async (p = page) => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/email-campaigns', { params: { page: p, limit: 20 } });
      setCampaigns(data.data.campaigns || []);
      setTotalPages(data.data.pagination?.totalPages || 1);
      setTotal(data.data.pagination?.total || 0);
    } catch {
      toast.error('Failed to load mail history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><RiHistoryLine className="text-brand-400" /> Mail History</h1>
          <p className="text-dark-300 text-sm mt-0.5">{total} email{total === 1 ? '' : 's'} sent from the admin panel</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchCampaigns(page)} className="btn-ghost text-sm"><RiRefreshLine /> Refresh</button>
          <Link to="/admin/send-email" className="btn-primary text-sm"><RiMailSendLine /> New Email</Link>
        </div>
      </div>

      {/* List */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><div className="spinner w-8 h-8 mx-auto" style={{ borderWidth: 3 }} /></div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center text-dark-400">
            <RiMailSendLine className="text-4xl mx-auto mb-3 opacity-40" />
            <p>No emails have been sent yet.</p>
            <Link to="/admin/send-email" className="text-brand-400 text-sm hover:underline mt-1 inline-block">Compose your first email →</Link>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {campaigns.map((c) => {
              const attachNames = Array.isArray(c.attachment_names) ? c.attachment_names : [];
              return (
                <button
                  key={c.id}
                  onClick={() => setActive(c)}
                  className="w-full text-left px-4 sm:px-5 py-4 hover:bg-white/[0.02] transition-colors flex items-start gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium truncate">{c.subject}</span>
                      <span className={`badge ${STATUS_BADGE[c.status] || 'badge-info'}`}>{c.status}</span>
                      {attachNames.length > 0 && (
                        <span className="badge badge-brand"><RiAttachment2 /> {attachNames.length}</span>
                      )}
                    </div>
                    <p className="text-dark-400 text-xs mt-1 truncate">
                      {c.body}
                    </p>
                    <p className="text-dark-500 text-xs mt-1.5">
                      by {c.admin_name || 'Admin'} · {fmtDate(c.created_at || c.createdAt)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-semibold">{c.sent_count}/{c.total_recipients}</p>
                    <p className="text-dark-400 text-xs">delivered</p>
                    {c.failed_count > 0 && <p className="text-red-400 text-xs">{c.failed_count} failed</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="btn-ghost text-sm disabled:opacity-30"><RiArrowLeftSLine /> Prev</button>
          <span className="text-dark-300 text-sm">Page {page} of {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-ghost text-sm disabled:opacity-30">Next <RiArrowRightSLine /></button>
        </div>
      )}

      {/* Reader modal */}
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setActive(null)}>
          <div className="glass-card w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="min-w-0">
                <h2 className="text-white text-lg font-semibold break-words">{active.subject}</h2>
                <p className="text-dark-400 text-xs mt-1">
                  by {active.admin_name || 'Admin'} · {fmtDate(active.created_at || active.createdAt)}
                </p>
              </div>
              <button onClick={() => setActive(null)} className="p-1.5 rounded-lg text-dark-300 hover:bg-white/[0.06] flex-shrink-0"><RiCloseLine className="text-xl" /></button>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              <span className={`badge ${STATUS_BADGE[active.status] || 'badge-info'}`}>{active.status}</span>
              <span className="badge badge-info">{active.sent_count}/{active.total_recipients} delivered</span>
              {active.failed_count > 0 && <span className="badge badge-danger">{active.failed_count} failed</span>}
              {active.send_to_all && <span className="badge badge-brand">All users{active.only_active ? ' (active)' : ''}</span>}
              {active.greet && <span className="badge badge-success">Personalized</span>}
            </div>

            {Array.isArray(active.attachment_names) && active.attachment_names.length > 0 && (
              <div className="mb-4">
                <p className="text-dark-300 text-xs mb-1.5">Attachments</p>
                <div className="flex flex-wrap gap-2">
                  {active.attachment_names.map((n, i) => (
                    <span key={i} className="badge badge-brand"><RiAttachment2 /> {n}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-xl bg-dark-900 border border-white/[0.06] p-4">
              <p className="text-dark-100 text-sm whitespace-pre-wrap leading-relaxed">{active.body}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
