import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import {
  RiSearchLine, RiFilterLine, RiArrowDownLine, RiArrowUpLine,
  RiDownloadLine, RiRefreshLine,
} from 'react-icons/ri';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { safeFormat, safeCurrency } from '../../utils/dateHelpers';

const modeColor = { NEFT: 'badge-info', RTGS: 'badge-brand', IMPS: 'badge-warning', INTERNAL: 'badge-success', SALARY: 'badge-success', INTEREST: 'badge-info', SYSTEM: 'badge-info', CHARGE: 'badge-danger' };

export default function TransactionsPage() {
  const dispatch = useDispatch();
  const { transactions, pagination, loading } = useSelector(s => s.transaction);
  const [filters, setFilters] = useState({ search: '', type: '', mode: '', startDate: '', endDate: '' });
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

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
                  className="flex sm:grid sm:grid-cols-12 gap-4 items-center px-5 py-3.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
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
    </div>
  );
}
