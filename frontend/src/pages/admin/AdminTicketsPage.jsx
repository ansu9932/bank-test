import React, { useEffect, useState } from 'react';
import { RiCustomerService2Line, RiRefreshLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { safeFormat } from '../../utils/dateHelpers';

const statusColor = { open: 'badge-warning', in_progress: 'badge-info', resolved: 'badge-success', closed: 'badge-info' };

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/tickets', { params: { status: statusFilter || undefined }, headers });
      setTickets(data.data.tickets);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [statusFilter]);

  const updateStatus = async (id, status) => {
    const resolution = status === 'resolved' ? prompt('Resolution note:') : '';
    try {
      await api.put(`/admin/tickets/${id}`, { status, resolution }, { headers });
      toast.success('Ticket updated');
      fetch();
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Support Tickets</h1>
          <p className="text-dark-300 text-sm">{tickets.length} tickets</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input-field w-auto py-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            {['open','in_progress','resolved','closed'].map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
          </select>
          <button onClick={fetch} className="btn-ghost"><RiRefreshLine /></button>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="spinner w-8 h-8 mx-auto" style={{ borderWidth: 3 }} /></div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12">
            <RiCustomerService2Line className="text-dark-400 text-5xl mx-auto mb-2" />
            <p className="text-dark-300 text-sm">No tickets found</p>
          </div>
        ) : tickets.map(t => (
          <div key={t.id} className="px-5 py-4 border-b border-white/[0.04] last:border-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-white font-medium text-sm">{t.subject}</p>
                  <span className={`badge ${statusColor[t.status]} text-[10px]`}>{t.status.replace('_',' ')}</span>
                </div>
                <p className="text-dark-300 text-xs truncate">{t.description}</p>
                <div className="flex items-center gap-3 mt-1.5">
                  <p className="text-dark-500 text-[10px]">#{t.ticket_number}</p>
                  {t.user && <p className="text-dark-400 text-[10px]">{t.user.first_name} {t.user.last_name} · {t.user.email}</p>}
                  <p className="text-dark-500 text-[10px]">{safeFormat(t.created_at || t.createdAt, 'dd MMM yyyy')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {t.status !== 'resolved' && t.status !== 'closed' && (
                  <>
                    <button onClick={() => updateStatus(t.id, 'in_progress')}
                      className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20 transition-colors">
                      In Progress
                    </button>
                    <button onClick={() => updateStatus(t.id, 'resolved')}
                      className="px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 text-xs hover:bg-green-500/20 transition-colors">
                      Resolve
                    </button>
                  </>
                )}
                {(t.status === 'resolved' || t.status === 'in_progress') && (
                  <button onClick={() => updateStatus(t.id, 'closed')}
                    className="px-2.5 py-1 rounded-lg bg-dark-600 text-dark-300 text-xs hover:bg-dark-500 transition-colors">
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
