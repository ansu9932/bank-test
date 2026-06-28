import React, { useEffect, useState } from 'react';
import { RiFileShield2Line, RiRefreshLine } from 'react-icons/ri';
import api from '../../services/api';
import { safeFormat } from '../../utils/dateHelpers';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/audit-logs', { params: { page, limit: 50 }, headers });
      setLogs(data.data.logs);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [page]);

  const statusColor = { success: 'badge-success', failure: 'badge-danger', warning: 'badge-warning' };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="text-dark-300 text-sm mt-0.5">Complete system activity trail</p>
        </div>
        <button onClick={fetch} className="btn-ghost"><RiRefreshLine /></button>
      </div>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center"><div className="spinner w-8 h-8 mx-auto" style={{ borderWidth: 3 }} /></div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <RiFileShield2Line className="text-dark-400 text-5xl mx-auto mb-2" />
            <p className="text-dark-300 text-sm">No audit logs found</p>
          </div>
        ) : logs.map(log => (
          <div key={log.id} className="flex items-start gap-4 px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-white text-sm font-mono font-medium">{log.action}</p>
                <span className={`badge ${statusColor[log.status] || 'badge-info'} text-[10px]`}>{log.status}</span>
              </div>
              <p className="text-dark-400 text-xs truncate">{log.description}</p>
              <p className="text-dark-500 text-[10px] mt-1">IP: {log.ip_address} · {safeFormat(log.created_at, 'dd MMM yyyy HH:mm:ss')}</p>
            </div>
            <div className="text-right flex-shrink-0">
              {log.entity_type && <span className="badge badge-info text-[10px]">{log.entity_type}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-dark-400">
        <span>Page {page}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} className="btn-ghost text-xs disabled:opacity-30">Prev</button>
          <button onClick={() => setPage(p=>p+1)} disabled={logs.length<50} className="btn-ghost text-xs disabled:opacity-30">Next</button>
        </div>
      </div>
    </div>
  );
}
