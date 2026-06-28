import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { RiAddLine, RiDeleteBin6Line, RiGroupLine, RiCheckLine, RiArrowRightLine } from 'react-icons/ri';
import { fetchBeneficiaries } from '../../store/slices/transactionSlice';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function BeneficiariesPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { beneficiaries } = useSelector(s => s.transaction);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nickname: '', accountNumber: '', accountName: '', bankName: '', ifscCode: '', accountType: 'savings' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { dispatch(fetchBeneficiaries()); }, []);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const addBeneficiary = async () => {
    if (!form.nickname || !form.accountNumber || !form.accountName) {
      toast.error('Nickname, account number, and name are required'); return;
    }
    setLoading(true);
    try {
      await api.post('/transactions/beneficiaries', form);
      toast.success('Beneficiary added!');
      dispatch(fetchBeneficiaries());
      setShowAdd(false);
      setForm({ nickname: '', accountNumber: '', accountName: '', bankName: '', ifscCode: '', accountType: 'savings' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add beneficiary');
    } finally {
      setLoading(false);
    }
  };

  const deleteBeneficiary = async (id) => {
    try {
      await api.delete(`/transactions/beneficiaries/${id}`);
      toast.success('Beneficiary removed');
      dispatch(fetchBeneficiaries());
    } catch { toast.error('Failed to remove beneficiary'); }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Beneficiaries</h1>
          <p className="text-dark-300 text-sm mt-0.5">Manage your saved transfer recipients</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary">
          <RiAddLine /> Add Beneficiary
        </button>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass-card p-5 overflow-hidden">
            <h3 className="text-white font-semibold mb-4">Add New Beneficiary</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {[
                { k: 'nickname', label: 'Nickname *', placeholder: 'e.g. John (HDFC)' },
                { k: 'accountNumber', label: 'Account Number *', placeholder: '13-digit number' },
                { k: 'accountName', label: 'Account Holder Name *', placeholder: 'Full name' },
                { k: 'bankName', label: 'Bank Name', placeholder: 'e.g. HDFC Bank' },
                { k: 'ifscCode', label: 'IFSC Code', placeholder: 'HDFC0001234' },
              ].map(f => (
                <div key={f.k}>
                  <label className="form-label">{f.label}</label>
                  <input className="input-field" value={form[f.k]} onChange={set(f.k)} placeholder={f.placeholder} />
                </div>
              ))}
              <div>
                <label className="form-label">Account Type</label>
                <select className="input-field" value={form.accountType} onChange={set('accountType')}>
                  <option value="savings">Savings</option>
                  <option value="current">Current</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button onClick={addBeneficiary} disabled={loading} className="btn-primary flex-1 justify-center">
                {loading ? <><div className="spinner w-4 h-4" /> Adding...</> : 'Add Beneficiary'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="glass-card overflow-hidden">
        {beneficiaries.length === 0 ? (
          <div className="text-center py-12">
            <RiGroupLine className="text-dark-400 text-5xl mx-auto mb-3" />
            <p className="text-dark-300 text-sm">No beneficiaries added yet</p>
            <p className="text-dark-500 text-xs mt-1">Add people you frequently send money to</p>
          </div>
        ) : beneficiaries.map((b, i) => (
          <motion.div key={b.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="flex items-center gap-4 px-5 py-4 border-b border-white/[0.04] last:border-0">
            <div className="w-11 h-11 rounded-2xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-brand-400 font-bold">{b.nickname?.[0]?.toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-white font-medium text-sm">{b.nickname}</p>
                {b.is_verified && <span className="badge badge-success text-[10px] py-0"><RiCheckLine /> Verified</span>}
              </div>
              <p className="text-dark-300 text-xs mt-0.5">{b.account_number} · {b.bank_name || 'External Bank'}</p>
              <p className="text-dark-500 text-xs">{b.account_name}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate(`/dashboard/transfer?account=${b.account_number}&name=${b.nickname}`)}
                className="p-2 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors text-sm">
                <RiArrowRightLine />
              </button>
              <button onClick={() => deleteBeneficiary(b.id)}
                className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors text-sm">
                <RiDeleteBin6Line />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
