import React, { useEffect, useState } from 'react';
import { RiSearchLine, RiAlertLine, RiRefreshLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { safeFormat } from '../../utils/dateHelpers';

export default function AdminTransactionsPage() {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [page, setPage] = useState(1);
  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const fetch = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/transactions', { params: { search, flagged: flagged||undefined, page, limit: 30 }, headers });
      setTxns(data.data.transactions);
    } catch { toast.error('Failed to fetch'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [search, flagged, page]);

  const flagTx = async (id) => {
    const reason = prompt('Flag reason:');
    if (!reason) return;
    try {
      await api.post(`/admin/transactions/${id}/flag`, { reason }, { headers });
      toast.success('Transaction flagged');
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Transactions</h1>
        <button onClick={fetch} className="btn-ghost"><RiRefreshLine /></button>
      </div>

      <div className="glass-card p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <RiSearchLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
          <input type="text" placeholder="Search reference, account name..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} className="input-field pl-10 py-2.5" />
        </div>
        <button onClick={() => { setFlagged(!flagged); setPage(1); }}
          className={`btn-secondary ${flagged ? 'border-red-500/50 text-red-400' : ''}`}>
          <RiAlertLine /> {flagged ? 'All' : 'Flagged Only'}
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 border-b border-white/[0.05] text-dark-400 text-xs uppercase tracking-wide">
          <div className="col-span-3">Reference</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2">Mode</div>
          <div className="col-span-2">Amount</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-1" />
        </div>

        {loading ? (
          <div className="p-8 text-center"><div className="spinner w-8 h-8 mx-auto" style={{ borderWidth: 3 }} /></div>
        ) : (txns || []).map(tx => (
          <div key={tx.id} className={`flex sm:grid sm:grid-cols-12 gap-3 items-center px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] ${tx.is_flagged ? 'bg-red-500/5' : ''}`}>
            <div className="sm:col-span-3">
              <p className="text-white font-mono text-xs">{tx.reference_number}</p>
              <p className="text-dark-400 text-[10px] mt-0.5 truncate">{tx.description}</p>
            </div>
            <div className="hidden sm:block sm:col-span-2">
              <span className={`badge text-[10px] ${tx.transaction_type === 'credit' ? 'badge-success' : 'badge-danger'}`}>{tx.transaction_type}</span>
            </div>
            <div className="hidden sm:block sm:col-span-2">
              <span className="badge badge-info text-[10px]">{tx.transfer_mode}</span>
            </div>
            <div className="hidden sm:block sm:col-span-2">
              <p className={`font-bold text-sm ${tx.transaction_type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                ${parseFloat(tx.amount).toLocaleString('en-US')}
              </p>
            </div>
            <div className="hidden sm:block sm:col-span-2">
              <p className="text-slate-400 text-xs">{safeFormat(tx.created_at || tx.createdAt, 'dd MMM yy HH:mm')}</p>
            </div>
            <div className="sm:col-span-1 flex justify-end items-center gap-1">
              {tx.is_flagged && <RiAlertLine className="text-red-400 text-sm" />}
              {!tx.is_flagged && (
                <button onClick={() => flagTx(tx.id)}
                  className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors text-xs">
                  <RiAlertLine />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-dark-400">
        <span>Page {page}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page===1} className="btn-ghost text-xs disabled:opacity-30">Prev</button>
          <button onClick={() => setPage(p => p+1)} disabled={txns.length<30} className="btn-ghost text-xs disabled:opacity-30">Next</button>
        </div>
      </div>
    </div>
  );
}
