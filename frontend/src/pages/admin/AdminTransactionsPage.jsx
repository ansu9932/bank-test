import React, { useEffect, useState } from 'react';
import { RiSearchLine, RiAlertLine, RiRefreshLine, RiCloseLine, RiFileList3Line } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { safeFormat } from '../../utils/dateHelpers';

/* ── Detail modal helpers ──────────────────────────────────────────────────── */

const fmtMoney = (n) => {
  const v = parseFloat(n);
  return Number.isNaN(v) ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const STATUS_STYLES = {
  success: 'bg-green-500/15 text-green-400 border-green-500/30',
  processing: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  pending: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  reversed: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

function DetailRow({ label, value, mono = false, valueClass = '' }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-dark-400 text-xs shrink-0 pt-0.5">{label}</span>
      <span className={`text-white text-xs text-right break-all ${mono ? 'font-mono' : ''} ${valueClass}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  // Hide the whole section if every row inside rendered null.
  const hasContent = React.Children.toArray(children).some(Boolean);
  if (!hasContent) return null;
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 mb-3">
      <p className="text-[10px] uppercase tracking-widest text-dark-400 pt-2 pb-1">{title}</p>
      {children}
    </div>
  );
}

function TransactionDetailModal({ tx, onClose, onFlag }) {
  if (!tx) return null;
  const acctUser = tx.account?.user;
  const tags = tx.tags || {};
  const statusClass = STATUS_STYLES[tx.status] || 'bg-white/10 text-white/70 border-white/20';
  const isCredit = tx.transaction_type === 'credit';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#15161c] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction details"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#15161c] border-b border-white/[0.06] px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div>
            <p className="text-white font-semibold flex items-center gap-2">
              <RiFileList3Line className="text-cyan-400" /> Transaction Details
            </p>
            <p className="text-dark-400 text-xs font-mono mt-0.5">{tx.reference_number}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors">
            <RiCloseLine className="text-xl" />
          </button>
        </div>

        <div className="p-5">
          {/* Amount + status banner */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 mb-4 flex items-center justify-between">
            <div>
              <p className={`text-2xl font-bold tabular-nums ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                {isCredit ? '+' : '−'}{fmtMoney(tx.amount)}
              </p>
              <p className="text-dark-400 text-xs mt-0.5">{tx.transfer_mode} · {tx.transaction_type}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-[11px] font-semibold border capitalize ${statusClass}`}>
              {tx.status}
            </span>
          </div>

          <Section title="Overview">
            <DetailRow label="Reference" value={tx.reference_number} mono />
            <DetailRow label="Type" value={tx.transaction_type} valueClass="capitalize" />
            <DetailRow label="Mode" value={tx.transfer_mode} />
            <DetailRow label="Category" value={tx.category} valueClass="capitalize" />
            <DetailRow label="Status" value={tx.status} valueClass="capitalize" />
            <DetailRow label="Description" value={tx.description} />
            <DetailRow label="Narration" value={tx.narration} />
          </Section>

          <Section title="Amount & Balance">
            <DetailRow label="Amount" value={fmtMoney(tx.amount)} valueClass={isCredit ? 'text-green-400' : 'text-red-400'} />
            <DetailRow label="Balance Before" value={tx.balance_before != null ? fmtMoney(tx.balance_before) : null} />
            <DetailRow label="Balance After" value={tx.balance_after != null ? fmtMoney(tx.balance_after) : null} />
          </Section>

          <Section title="Account Holder">
            <DetailRow label="Name" value={acctUser ? `${acctUser.first_name || ''} ${acctUser.last_name || ''}`.trim() : null} />
            <DetailRow label="Customer ID" value={acctUser?.customer_id} mono />
            <DetailRow label="Email" value={acctUser?.email} />
            <DetailRow label="Phone" value={acctUser?.phone} />
            <DetailRow label="Account No." value={tx.account?.account_number} mono />
            <DetailRow label="Account Type" value={tx.account?.account_type} valueClass="capitalize" />
          </Section>

          <Section title="Sender">
            <DetailRow label="From Name" value={tx.from_account_name} />
            <DetailRow label="From Account" value={tx.from_account_number} mono />
          </Section>

          <Section title="Beneficiary">
            <DetailRow label="Name" value={tx.to_account_name} />
            <DetailRow label="Account" value={tx.to_account_number} mono />
            <DetailRow label="Bank" value={tx.to_bank_name} />
            <DetailRow label="IFSC" value={tx.to_ifsc} mono />
            <DetailRow label="SWIFT/BIC" value={tags.swiftCode} mono />
            <DetailRow label="Country" value={tags.countryName || tags.country} />
            <DetailRow label="ETA" value={tags.etaLabel} />
          </Section>

          <Section title="Processing">
            <DetailRow label="Created" value={safeFormat(tx.created_at || tx.createdAt, 'dd MMM yyyy, HH:mm:ss')} />
            <DetailRow label="Processed" value={tx.processed_at ? safeFormat(tx.processed_at, 'dd MMM yyyy, HH:mm:ss') : null} />
            <DetailRow label="Scheduled" value={tx.is_scheduled && tx.scheduled_at ? safeFormat(tx.scheduled_at, 'dd MMM yyyy, HH:mm:ss') : null} />
            <DetailRow label="Settlement" value={tags.settlement} valueClass="capitalize" />
            <DetailRow
              label="Approval Channel"
              value={tags.approvalChannel === 'email' ? 'Email self-approval' : (tags.approvalChannel === 'admin' ? 'Admin approval' : tags.approvalChannel)}
            />
            <DetailRow label="Failure Reason" value={tx.failure_reason} valueClass="text-red-400" />
            <DetailRow label="Reversal Reason" value={tx.reversal_reason} valueClass="text-orange-400" />
          </Section>

          <Section title="Flags & Metadata">
            <DetailRow label="Flagged" value={tx.is_flagged ? 'Yes' : null} valueClass="text-red-400" />
            <DetailRow label="Flag Reason" value={tx.flag_reason} valueClass="text-red-400" />
            <DetailRow label="IP Address" value={tx.ip_address} mono />
            <DetailRow label="Device" value={tx.device_info} />
            <DetailRow label="Transaction ID" value={tx.id} mono />
          </Section>

          <div className="flex gap-2 justify-end mt-4">
            {!tx.is_flagged && (
              <button
                onClick={() => onFlag(tx.id)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-colors"
              >
                <RiAlertLine /> Flag Transaction
              </button>
            )}
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/70 hover:text-white bg-white/[0.05] transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function AdminTransactionsPage() {
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedTx, setSelectedTx] = useState(null);
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
      setSelectedTx(null);
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
          <div
            key={tx.id}
            onClick={() => setSelectedTx(tx)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTx(tx); } }}
            className={`flex sm:grid sm:grid-cols-12 gap-3 items-center px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] cursor-pointer transition-colors ${tx.is_flagged ? 'bg-red-500/5' : ''}`}
          >
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
                <button onClick={(e) => { e.stopPropagation(); flagTx(tx.id); }}
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

      <TransactionDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} onFlag={flagTx} />
    </div>
  );
}
