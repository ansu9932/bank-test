import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RiSearchLine, RiArrowRightLine, RiRefreshLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { safeFormat } from '../../utils/dateHelpers';

const kycBadge = { pending: 'badge-warning', under_review: 'badge-info', video_kyc_pending: 'badge-brand', approved: 'badge-success', rejected: 'badge-danger' };
const statusBadge = { active: 'badge-success', pending: 'badge-warning', frozen: 'badge-danger', closed: 'badge-info' };

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kycFilter, setKycFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users', { params: { search, kycStatus: kycFilter, page, limit: 20 }, headers });
      setUsers(data.data.users);
      setTotal(data.data.pagination.total);
    } catch { toast.error('Failed to fetch users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchUsers(); }, [search, kycFilter, page]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Users & KYC</h1>
          <p className="text-dark-300 text-sm mt-0.5">{total} total users</p>
        </div>
        <button onClick={fetchUsers} className="btn-ghost"><RiRefreshLine /></button>
      </div>

      <div className="glass-card p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <RiSearchLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
          <input type="text" placeholder="Search name, email, customer ID..."
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input-field pl-10 py-2.5" />
        </div>
        <select className="input-field w-auto" value={kycFilter} onChange={e => { setKycFilter(e.target.value); setPage(1); }}>
          <option value="">All KYC Status</option>
          {['pending','under_review','video_kyc_pending','approved','rejected'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
          ))}
        </select>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/[0.05] text-dark-400 text-xs uppercase tracking-wide">
          <div className="col-span-3">Customer</div>
          <div className="col-span-2">Customer ID</div>
          <div className="col-span-2">Account</div>
          <div className="col-span-2">KYC Status</div>
          <div className="col-span-2">Joined</div>
          <div className="col-span-1" />
        </div>

        {loading ? (
          <div className="p-8 text-center"><div className="spinner w-8 h-8 mx-auto" style={{ borderWidth: 3 }} /></div>
        ) : users.map(u => (
          <div key={u.id} className="flex sm:grid sm:grid-cols-12 gap-4 items-center px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
            <div className="sm:col-span-3 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-brand-500/15 flex items-center justify-center flex-shrink-0">
                <span className="text-brand-400 text-xs font-bold">{u.first_name?.[0]}{u.last_name?.[0]}</span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{u.first_name} {u.last_name}</p>
                <p className="text-dark-400 text-xs truncate">{u.email}</p>
              </div>
            </div>
            <div className="hidden sm:block sm:col-span-2">
              <p className="text-white font-mono text-xs">{u.customer_id}</p>
            </div>
            <div className="hidden sm:block sm:col-span-2">
              <p className="text-dark-300 text-xs font-mono">{u.account?.account_number?.slice(-4) ? `****${u.account.account_number.slice(-4)}` : '—'}</p>
              {u.account && <p className="text-dark-500 text-[10px]">${parseFloat(u.account.balance||0).toLocaleString('en-US')}</p>}
            </div>
            <div className="hidden sm:block sm:col-span-2">
              <span className={`badge ${kycBadge[u.kyc_status]} text-[10px]`}>{u.kyc_status?.replace(/_/g,' ')}</span>
            </div>
            <div className="hidden sm:block sm:col-span-2">
              <p className="text-dark-300 text-xs">{safeFormat(u.created_at, 'dd MMM yyyy')}</p>
            </div>
            <div className="sm:col-span-1 flex justify-end">
              <Link to={`/admin/users/${u.id}`}
                className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors">
                <RiArrowRightLine />
              </Link>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-dark-400">
        <span>Page {page}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="btn-ghost text-xs disabled:opacity-30">Prev</button>
          <button onClick={() => setPage(p => p+1)} disabled={users.length < 20} className="btn-ghost text-xs disabled:opacity-30">Next</button>
        </div>
      </div>
    </div>
  );
}
