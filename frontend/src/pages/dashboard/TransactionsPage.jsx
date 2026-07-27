import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import {
  RiSearchLine, RiFilterLine, RiArrowDownLine, RiArrowUpLine,
  RiDownloadLine, RiRefreshLine, RiCloseLine, RiFileList3Line,
  RiDownload2Line,
} from 'react-icons/ri';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { safeFormat, safeCurrency } from '../../utils/dateHelpers';
import { downloadReceipt } from '../../utils/downloadReceipt';

const modeColor = { NEFT: 'badge-info', RTGS: 'badge-brand', IMPS: 'badge-warning', INTERNAL: 'badge-success', SALARY: 'badge-success', INTEREST: 'badge-info', SYSTEM: 'badge-info', CHARGE: 'badge-danger' };

export default function TransactionsPage() {
  const dispatch = useDispatch();
  const { transactions, pagination, loading } = useSelector(s => s.transaction);
  const [filters, setFilters] = useState({ search: '', type: '', mode: '', startDate: '', endDate: '' });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedTx, setSelectedTx] = useState(null); // transaction detail modal

  useEffect(() => {
    dispatch(fetchTransactions({ ...filters, page, limit: 25 }));
  }, [page, filters]);

  const setF = (k) => (e) => { setFilters(f => ({ ...f, [k]: e.target.value })); setPage(1); };

  const downloadStatement = () => {
    const params = new URLSearchParams({ startDate: filters.startDate, endDate: filters.endDate });
    window.open(`/api/transactions/download-statement?${params}`, '_blank');
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Transactions</h1>
          <p className="text-dark-300 text-sm mt-0.5">Complete history of all account transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => dispatch(fetchTransactions({ ...filters, page, limit: 25 }))}
            className="btn-ghost"><RiRefreshLine /></button>
          <button onClick={downloadStatement} className="btn-secondary text-sm">
            <RiDownloadLine /> Statement PDF
          </button>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="glass-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <RiSearchLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
            <input type="text" placeholder="Search transactions, references..."
              value={filters.search} onChange={setF('search')}
              className="input-field pl-10 py-2.5" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`btn-secondary ${showFilters ? 'border-brand-500/50 text-brand-400' : ''}`}>
            <RiFilterLine /> Filters
          </button>
        </div>

        {showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div>
              <label className="form-label">Type</label>
              <select className="input-field" value={filters.type} onChange={setF('type')}>
                <option value="">All</option>
                <option value="credit">Credit</option>
                <option value="debit">Debit</option>
              </select>
            </div>
            <div>
              <label className="form-label">Mode</label>
              <select className="input-field" value={filters.mode} onChange={setF('mode')}>
                <option value="">All</option>
                {['NEFT','RTGS','IMPS','INTERNAL','SALARY','INTEREST'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">From Date</label>
              <input type="date" className="input-field" value={filters.startDate} onChange={setF('startDate')} />
            </div>
            <div>
              <label className="form-label">To Date</label>
              <input type="date" className="input-field" value={filters.endDate} onChange={setF('endDate')} />
            </div>
          </motion.div>
        )}
      </div>

      {/* Transactions table */}
      <div className="glass-card overflow-hidden">
        {/* Table header */}
        <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 border-b border-white/[0.05] text-dark-400 text-xs uppercase tracking-wide">
          <div className="col-span-1" />
          <div className="col-span-3">Description</div>
          <div className="col-span-2">Reference</div>
          <div className="col-span-2">Mode</div>
          <div className="col-span-2">Date</div>
          <div className="col-span-2 text-right">Amount</div>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="spinner w-8 h-8 mx-auto" style={{ borderWidth: 3 }} />
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="p-12 text-center">
            <RiArrowDownLine className="text-dark-400 text-5xl mx-auto mb-3" />
            <p className="text-dark-300 text-sm">No transactions found</p>
          </div>
        ) : (
          <div>
            {transactions.map((tx, idx) => {
              const isCredit = tx.transaction_type === 'credit';
              return (
                <motion.div key={tx.id}
                  initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.02 }}
                  onClick={() => setSelectedTx(tx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTx(tx); } }}
                  className="flex sm:grid sm:grid-cols-12 gap-4 items-center px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors cursor-pointer"
                >
                  {/* Icon */}
                  <div className="sm:col-span-1 flex-shrink-0">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${isCredit ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      {isCredit ? <RiArrowDownLine className="text-green-400" /> : <RiArrowUpLine className="text-red-400" />}
                    </div>
                  </div>
                  {/* Description */}
                  <div className="sm:col-span-3 flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {tx.description || (isCredit ? tx.from_account_name : tx.to_account_name) || 'Transaction'}
                    </p>
                    <p className="text-dark-400 text-xs mt-0.5 truncate">
                      {isCredit ? (tx.from_account_name || 'Credit') : (tx.to_account_name || 'Debit')}
                    </p>
                  </div>
                  {/* Reference */}
                  <div className="hidden sm:block sm:col-span-2">
                    <p className="text-dark-300 text-xs font-mono truncate">{tx.reference_number}</p>
                  </div>
                  {/* Mode badge */}
                  <div className="hidden sm:block sm:col-span-2">
                    <span className={`badge ${modeColor[tx.transfer_mode] || 'badge-info'} text-[10px]`}>
                      {tx.transfer_mode}
                    </span>
                  </div>
                  {/* Date */}
                  <div className="hidden sm:block sm:col-span-2">
                    <p className="text-slate-400 text-xs">{safeFormat(tx.created_at, 'dd MMM yyyy')}</p>
                    <p className="text-slate-500 text-[10px]">{safeFormat(tx.created_at, 'HH:mm', '')}</p>
                  </div>
                  {/* Amount */}
                  <div className="sm:col-span-2 text-right flex-shrink-0">
                    <p className={`font-bold text-sm ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                      {isCredit ? '+' : '-'}${safeCurrency(tx.amount)}
                    </p>
                    <p className="text-slate-500 text-[10px]">
                      Bal: ${safeCurrency(tx.balance_after)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination?.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-white/[0.05]">
            <p className="text-dark-400 text-xs">
              {pagination.total} transactions · Page {pagination.page}/{pagination.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost text-xs disabled:opacity-30">Prev</button>
              <button onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} className="btn-ghost text-xs disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction detail modal + receipt download */}
      <AnimatePresence>
        {selectedTx && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedTx(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog" aria-modal="true" aria-label="Transaction details"
              className="glass-card w-full max-w-md max-h-[85vh] overflow-y-auto"
            >
              {(() => {
                const tx = selectedTx;
                const isCredit = tx.transaction_type === 'credit';
                const rows = [
                  ['Reference', tx.reference_number],
                  ['Date & Time', `${safeFormat(tx.created_at, 'dd MMM yyyy')} · ${safeFormat(tx.created_at, 'HH:mm:ss', '')}`],
                  ['Mode', tx.transfer_mode],
                  ['Status', (tx.status || '').toUpperCase()],
                  ...(tx.to_account_name ? [['Beneficiary', tx.to_account_name]] : []),
                  ...(tx.to_account_number ? [['Beneficiary A/c', tx.to_account_number]] : []),
                  ...(tx.to_bank_name ? [['Bank', tx.to_bank_name]] : []),
                  ...(tx.to_ifsc ? [['IFSC / SWIFT', tx.to_ifsc]] : []),
                  ...(tx.description ? [['Remarks', tx.description]] : []),
                  ['Balance After', `$${safeCurrency(tx.balance_after)}`],
                ];
                return (
                  <div className="p-6">
                    {/* Modal header */}
                    <div className="flex items-start justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isCredit ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                          <RiFileList3Line className={isCredit ? 'text-green-400 text-xl' : 'text-red-400 text-xl'} />
                        </div>
                        <div>
                          <h2 className="text-white font-bold text-base">Transaction Details</h2>
                          <p className="text-dark-400 text-xs mt-0.5">{isCredit ? 'Money received' : 'Money sent'}</p>
                        </div>
                      </div>
                      <button onClick={() => setSelectedTx(null)} className="btn-ghost p-2" aria-label="Close details">
                        <RiCloseLine className="text-lg" />
                      </button>
                    </div>

                    {/* Amount hero */}
                    <div className={`rounded-2xl p-5 text-center mb-5 border ${isCredit ? 'bg-green-500/[0.06] border-green-500/20' : 'bg-red-500/[0.06] border-red-500/20'}`}>
                      <p className={`text-3xl font-bold ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
                        {isCredit ? '+' : '-'}${safeCurrency(tx.amount)}
                      </p>
                      <span className={`badge ${modeColor[tx.transfer_mode] || 'badge-info'} text-[10px] mt-2`}>
                        {tx.transfer_mode}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="bg-dark-700/50 rounded-xl p-4 space-y-2.5 mb-5">
                      {rows.map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4 text-sm">
                          <span className="text-dark-300 flex-shrink-0">{label}</span>
                          <span className="text-white font-medium text-right break-all">{value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Actions */}
                    <button
                      onClick={() => downloadReceipt(tx.id || tx.reference_number, tx.reference_number)}
                      className="btn-primary w-full justify-center"
                    >
                      <RiDownload2Line /> Download Receipt (PDF)
                    </button>
                  </div>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
