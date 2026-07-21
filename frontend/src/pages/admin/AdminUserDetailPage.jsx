import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RiArrowLeftLine, RiCheckLine, RiCloseLine, RiLockLine, RiLockUnlockLine, RiAddCircleLine, RiSubtractLine, RiDeleteBin6Line } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

// Absolute backend origin for static /uploads assets. The frontend is served
// from a separate static host, so KYC document links MUST point at the Node
// backend domain explicitly — a relative path would 404 against the frontend
// host. Derived from VITE_API_BASE_URL (with the trailing /api stripped) so it
// always tracks the same backend the API client uses. Falls back to the AWS API.
// The backend serves these under express.static('/uploads'); doc.document_url
// already carries the correct sub-folder (documents/ selfies/ kyc-videos/),
// sliced from file_path, so the prefixed link resolves to e.g.:
//   {BACKEND_ORIGIN}/uploads/documents/{filename}
const BACKEND_ORIGIN = (import.meta.env.VITE_API_BASE_URL || 'https://api.alisterbank.online/api').replace(/\/api\/?$/, '');
const IMG_ORIGIN = BACKEND_ORIGIN;

// /uploads is now an AUTHENTICATED route on the backend. Plain links and
// <img> tags cannot send Authorization headers, so the admin token is appended
// as a query param (the httpOnly cookie also covers same-site loads).
const authedUploadUrl = (docUrl) => {
  if (!docUrl) return null;
  const token = localStorage.getItem('adminToken');
  return `${IMG_ORIGIN}${docUrl}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};

// Tolerant JSON parse for the account.transfer_methods value (object or string).
const safeParse = (v) => { try { return JSON.parse(v); } catch { return null; } };

// The four manageable rails, with copy for the admin toggle panel.
const TRANSFER_METHOD_DEFS = [
  { key: 'imps', label: 'IMPS', desc: 'Instant external transfer' },
  { key: 'neft', label: 'NEFT', desc: 'Batch-settled external transfer' },
  { key: 'upi', label: 'UPI', desc: 'Pay to any UPI ID' },
  { key: 'internal', label: 'Alister Internal', desc: 'On-us Alister → Alister' },
  { key: 'add_money', label: 'Add Money', desc: 'Deposit / top-up funds' },
  { key: 'swift', label: 'SWIFT (International)', desc: 'Cross-border wire · demo/simulated' },
];

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [manualTx, setManualTx] = useState({ type: 'credit', amount: '', description: '', reason: '' });
  const [txLoading, setTxLoading] = useState(false);
  const [ceiling, setCeiling] = useState('');
  const [ceilingLoading, setCeilingLoading] = useState(false);
  // Per-user transfer-method locks (IMPS/NEFT/UPI off by default, internal on).
  const [methods, setMethods] = useState({ imps: false, neft: false, upi: false, internal: true, add_money: false, swift: false });
  const [methodsLoading, setMethodsLoading] = useState(false);
  // SWIFT email self-approval eligibility (user-level flag).
  const [emailApproval, setEmailApproval] = useState(false);
  const [emailApprovalLoading, setEmailApprovalLoading] = useState(false);
  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const fetch = async () => {
    try {
      const { data } = await api.get(`/admin/users/${id}`, { headers });
      setUser(data.data.user);
      if (data.data.user?.account?.daily_transfer_limit != null) {
        setCeiling(String(parseFloat(data.data.user.account.daily_transfer_limit)));
      }
      // Hydrate method toggles from the account (NULL → secure default).
      const tm = data.data.user?.account?.transfer_methods;
      const parsed = typeof tm === 'string' ? safeParse(tm) : tm;
      setMethods({
        imps: parsed?.imps === true,
        neft: parsed?.neft === true,
        upi: parsed?.upi === true,
        internal: parsed ? parsed.internal !== false : true,
        add_money: parsed?.add_money === true,
        swift: parsed?.swift === true,
      });
      // SWIFT email self-approval eligibility lives on the USER (not account).
      setEmailApproval(data.data.user?.swift_email_approval === true);
    } catch { toast.error('Failed to load user'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [id]);

  const approveKYC = async () => {
    try {
      const { data } = await api.post(`/admin/users/${id}/approve-kyc`, {}, { headers });
      toast.success(data.message);
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const rejectKYC = async () => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    try {
      await api.post(`/admin/users/${id}/reject-kyc`, { reason }, { headers });
      toast.success('KYC rejected');
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const toggleFreeze = async () => {
    const isActive = user.account_status === 'active';
    const reason = isActive ? prompt('Reason for freezing:') : '';
    try {
      await api.post(`/admin/users/${id}/freeze`, { action: isActive ? 'freeze' : 'unfreeze', reason }, { headers });
      toast.success(`Account ${isActive ? 'frozen' : 'unfrozen'}`);
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const submitManualTx = async () => {
    if (!manualTx.amount) { toast.error('Amount is required'); return; }
    setTxLoading(true);
    try {
      await api.post(`/admin/users/${id}/manual-transaction`, manualTx, { headers });
      toast.success('Transaction applied!');
      setManualTx({ type: 'credit', amount: '', description: '', reason: '' });
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setTxLoading(false); }
  };

  const deleteCard = async (cardId) => {
    // eslint-disable-next-line no-alert, no-restricted-globals
    if (!window.confirm('Permanently delete this card? This cannot be undone.')) return;
    try {
      await api.delete(`/admin/user/${id}/card/${cardId}`, { headers });
      toast.success('Card deleted successfully.');
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete card'); }
  };

  const applyCeiling = async () => {
    const parsed = parseFloat(ceiling);
    if (Number.isNaN(parsed) || parsed < 0) { toast.error('Enter a valid ceiling amount'); return; }
    setCeilingLoading(true);
    try {
      const { data } = await api.post(`/admin/modify-user-ceiling/${id}`,
        { dailyTransferLimit: parsed }, { headers });
      toast.success(data.message || 'Transfer ceiling updated');
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update ceiling'); }
    finally { setCeilingLoading(false); }
  };

  const toggleMethod = (key) => setMethods((m) => ({ ...m, [key]: !m[key] }));

  const saveMethods = async () => {
    setMethodsLoading(true);
    try {
      const { data } = await api.post(`/admin/users/${id}/transfer-methods`,
        { transferMethods: methods }, { headers });
      toast.success(data.message || 'Transfer methods updated');
      fetch();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update transfer methods'); }
    finally { setMethodsLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner w-8 h-8" style={{ borderWidth: 3 }} /></div>;
  if (!user) return <p className="text-dark-300">User not found.</p>;

  const kycColor = { pending: 'yellow', under_review: 'blue', video_kyc_pending: 'purple', approved: 'green', rejected: 'red' }[user.kyc_status] || 'gray';

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link to="/admin/users" className="p-2 rounded-xl hover:bg-white/[0.05] text-dark-300 hover:text-white">
          <RiArrowLeftLine />
        </Link>
        <div>
          <h1 className="page-title">{user.first_name} {user.last_name}</h1>
          <p className="text-dark-300 text-sm">{user.customer_id} · {user.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* User info */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-card p-5">
            <p className="text-white font-semibold mb-3">Personal Details</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Phone', user.phone], ['Date of Birth', user.date_of_birth],
                ['Gender', user.gender], ['Occupation', user.occupation],
                ['Nationality', user.nationality], ['Annual Income', `$${(user.annual_income||0).toLocaleString('en-US')}`],
                ['PAN Number', user.pan_number], ['Aadhaar', user.aadhaar_number ? '****' + user.aadhaar_number.slice(-4) : '—'],
                ['Address', `${user.address_line1}, ${user.city}, ${user.state} - ${user.pincode}`],
              ].map(([k,v]) => (
                <div key={k}>
                  <p className="text-dark-400 text-xs">{k}</p>
                  <p className="text-white text-sm mt-0.5">{v || '—'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Account */}
          {user.account && (
            <div className="glass-card p-5">
              <p className="text-white font-semibold mb-3">Account Details</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['Account Number', user.account.account_number],
                  ['Balance', `$${parseFloat(user.account.balance).toLocaleString('en-US')}`],
                  ['SWIFT Code', user.account.swift_code || 'ALSTINBB'],
                  ['Account Type', user.account.account_type?.replace(/_/g, ' ').toUpperCase()],
                  ['Status', user.account.status],
                  ['Daily Transfer Limit', `$${parseFloat(user.account.daily_transfer_limit || 0).toLocaleString('en-US')}`],
                ].map(([k,v]) => (
                  <div key={k}>
                    <p className="text-dark-400 text-xs">{k}</p>
                    <p className="text-white text-sm mt-0.5">{v || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KYC Documents — Aadhaar / PAN / passport viewer (admin-only) */}
          <div className="glass-card p-5">
            <p className="text-white font-semibold mb-3">KYC Documents</p>
            {user.documents?.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {user.documents.map((doc) => {
                  const hasFile = doc.has_file ?? Boolean(doc.document_url || doc.file_path);
                  const href = doc.document_url ? authedUploadUrl(doc.document_url) : null;
                  const badgeClass = doc.status === 'approved' ? 'badge-success'
                    : doc.status === 'rejected' ? 'badge-danger' : 'badge-warning';
                  const label = String(doc.document_type || 'document').replace(/_/g, ' ');

                  // Clean fallback element when no asset path is present.
                  if (!hasFile || !href) {
                    return (
                      <div key={doc.id} className="p-3 text-center rounded-xl border border-white/[0.06] opacity-60">
                        <span className="text-2xl">🚫</span>
                        <p className="text-dark-200 text-xs mt-1 capitalize">{label}</p>
                        <span className="text-dark-400 text-[10px] mt-1 block">No file uploaded</span>
                      </div>
                    );
                  }
                  return (
                    <a key={doc.id} href={href} target="_blank" rel="noopener noreferrer"
                      className="glass-card-hover p-3 text-center">
                      <span className="text-2xl">📄</span>
                      <p className="text-dark-200 text-xs mt-1 capitalize">{label}</p>
                      <span className={`badge text-[10px] mt-1 ${badgeClass}`}>{doc.status}</span>
                      <span className="block text-brand-400 text-[10px] mt-1">View document →</span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <span className="text-2xl">📂</span>
                <p className="text-dark-300 text-sm mt-2">No KYC documents uploaded by this user.</p>
              </div>
            )}
          </div>

          {/* Cards (debit card requests) */}
          {(() => {
            const cards = (user.cardRequests || []).filter(c => c.request_type === 'debit_card');
            if (cards.length === 0) return null;
            const statusBadge = (s) => s === 'active' ? 'badge-success' : s === 'cancelled' ? 'badge-danger' : 'badge-warning';
            return (
              <div className="glass-card p-5">
                <p className="text-white font-semibold mb-3">Debit Cards</p>
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="text-dark-400 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                        <th className="text-left font-medium py-2 px-1">Network</th>
                        <th className="text-left font-medium py-2 px-1">Tier</th>
                        <th className="text-left font-medium py-2 px-1">Status</th>
                        <th className="text-left font-medium py-2 px-1">Fee</th>
                        <th className="text-right font-medium py-2 px-1">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cards.map((cardItem) => (
                        <tr key={cardItem.id} className="border-b border-white/[0.04] last:border-0">
                          <td className="py-2.5 px-1 text-white">{cardItem.card_network || '—'}</td>
                          <td className="py-2.5 px-1 text-dark-200">{cardItem.card_tier || '—'}</td>
                          <td className="py-2.5 px-1">
                            <span className={`badge ${statusBadge(cardItem.status)} text-[10px]`}>{cardItem.status}</span>
                          </td>
                          <td className="py-2.5 px-1 text-dark-200">${parseFloat(cardItem.issuance_fee || 0).toLocaleString('en-US')}</td>
                          <td className="py-2.5 px-1 text-right">
                            <button onClick={() => deleteCard(cardItem.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 text-xs font-medium transition-colors">
                              <RiDeleteBin6Line /> Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Actions sidebar */}
        <div className="space-y-4">
          {/* Status */}
          <div className="glass-card p-4">
            <p className="text-white font-semibold mb-3 text-sm">Status</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-dark-300 text-xs">KYC Status</span>
                <span className={`badge badge-${kycColor === 'green' ? 'success' : kycColor === 'red' ? 'danger' : 'warning'} text-[10px]`}>
                  {user.kyc_status?.replace(/_/g,' ')}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-dark-300 text-xs">Account</span>
                <span className={`badge ${user.account_status === 'active' ? 'badge-success' : user.account_status === 'frozen' ? 'badge-danger' : 'badge-warning'} text-[10px]`}>
                  {user.account_status}
                </span>
              </div>
            </div>
          </div>

          {/* KYC Actions */}
          {['pending','under_review','video_kyc_pending'].includes(user.kyc_status) && (
            <div className="glass-card p-4">
              <p className="text-white font-semibold mb-3 text-sm">KYC Actions</p>
              <div className="space-y-2">
                <button onClick={approveKYC} className="btn-primary w-full justify-center py-2.5 text-sm">
                  <RiCheckLine /> Approve KYC
                </button>
                <button onClick={rejectKYC} className="btn-secondary w-full justify-center py-2.5 text-sm border-red-500/20 text-red-400">
                  <RiCloseLine /> Reject KYC
                </button>
              </div>
            </div>
          )}

          {/* Freeze */}
          {user.account && (
            <div className="glass-card p-4">
              <p className="text-white font-semibold mb-3 text-sm">Account Control</p>
              <button onClick={toggleFreeze}
                className={`w-full justify-center py-2.5 text-sm ${user.account_status === 'active' ? 'btn-secondary border-red-500/20 text-red-400' : 'btn-primary'}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {user.account_status === 'active' ? <><RiLockLine />Freeze Account</> : <><RiLockUnlockLine />Unfreeze Account</>}
              </button>
            </div>
          )}

          {/* Manual Tx */}
          {user.account && (
            <div className="glass-card p-4">
              <p className="text-white font-semibold mb-3 text-sm">Manual Transaction</p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1">
                  {['credit','debit'].map(t => (
                    <button key={t} onClick={() => setManualTx(f => ({...f, type: t}))}
                      className={`py-2 rounded-lg text-xs font-medium transition-all ${manualTx.type === t ? (t === 'credit' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400') : 'bg-dark-700 text-dark-300'}`}>
                      {t.charAt(0).toUpperCase()+t.slice(1)}
                    </button>
                  ))}
                </div>
                <input type="number" placeholder="Amount ($)" value={manualTx.amount}
                  onChange={e => setManualTx(f => ({...f, amount: e.target.value}))}
                  className="input-field text-sm py-2" />
                <input type="text" placeholder="Description (shown in customer's email)" value={manualTx.description}
                  onChange={e => setManualTx(f => ({...f, description: e.target.value}))}
                  className="input-field text-sm py-2" />
                <input type="text" placeholder="Internal reason (audit log only)" value={manualTx.reason}
                  onChange={e => setManualTx(f => ({...f, reason: e.target.value}))}
                  className="input-field text-sm py-2" />
                <button onClick={submitManualTx} disabled={txLoading} className="btn-primary w-full justify-center py-2.5 text-sm">
                  {txLoading ? <><div className="spinner w-3 h-3" /> Processing...</> : `Apply ${manualTx.type}`}
                </button>
              </div>
            </div>
          )}

          {/* Adjust User Transfer Ceiling */}
          {user.account && (
            <div className="glass-card p-4">
              <p className="text-white font-semibold mb-1 text-sm">Adjust User Transfer Ceiling</p>
              <p className="text-dark-400 text-xs mb-3">
                Current daily limit: ${parseFloat(user.account.daily_transfer_limit || 0).toLocaleString('en-US')}
              </p>
              <div className="space-y-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-300 text-sm">$</span>
                  <input type="number" min="0" step="1000" placeholder="New daily ceiling ($)"
                    value={ceiling} onChange={(e) => setCeiling(e.target.value)}
                    className="input-field text-sm py-2 pl-7" />
                </div>
                <button onClick={applyCeiling} disabled={ceilingLoading}
                  className="btn-primary w-full justify-center py-2.5 text-sm">
                  {ceilingLoading ? <><div className="spinner w-3 h-3" /> Applying...</> : 'Apply New Limits'}
                </button>
              </div>
            </div>
          )}

          {/* Transfer Methods — admin-only activation (IMPS/NEFT/UPI locked by default) */}
          {user.account && (
            <div className="glass-card p-4">
              <p className="text-white font-semibold mb-1 text-sm">Transfer Methods</p>
              <p className="text-dark-400 text-xs mb-3">
                IMPS, NEFT, UPI &amp; Add Money are locked by default. Enable a feature to activate it for this user.
              </p>
              <div className="space-y-2">
                {TRANSFER_METHOD_DEFS.map(({ key, label, desc }) => {
                  const on = !!methods[key];
                  return (
                    <button key={key} type="button" onClick={() => toggleMethod(key)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border transition-colors text-left ${on ? 'border-green-500/40 bg-green-500/10' : 'border-white/[0.08] bg-dark-700/40 hover:border-white/20'}`}>
                      <span>
                        <span className={`block text-sm font-medium ${on ? 'text-green-300' : 'text-white'}`}>{label}</span>
                        <span className="block text-dark-400 text-[11px] mt-0.5">{desc}</span>
                      </span>
                      {/* Toggle switch */}
                      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-dark-500'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </span>
                    </button>
                  );
                })}
                <button onClick={saveMethods} disabled={methodsLoading}
                  className="btn-primary w-full justify-center py-2.5 text-sm">
                  {methodsLoading ? <><div className="spinner w-3 h-3" /> Saving...</> : 'Save Transfer Methods'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
