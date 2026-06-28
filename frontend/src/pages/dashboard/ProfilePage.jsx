import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RiUserLine, RiMailLine, RiPhoneLine, RiMapPinLine, RiBankCardLine, RiEdit2Line, RiCheckLine } from 'react-icons/ri';
import { updateProfile } from '../../store/slices/accountSlice';
import { updateUser } from '../../store/slices/authSlice';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user } = useSelector(s => s.auth);
  const { account } = useSelector(s => s.account);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ accountNickname: user?.accountNickname || '' });
  const [cardLoading, setCardLoading] = useState(false);

  const handleSave = async () => {
    try {
      await dispatch(updateProfile(form));
      dispatch(updateUser(form));
      setEditing(false);
      toast.success('Profile updated!');
    } catch { toast.error('Update failed'); }
  };

  const requestCard = async (type) => {
    setCardLoading(true);
    try {
      await api.post('/account/request-card', { requestType: type });
      toast.success(`${type === 'debit_card' ? 'Debit card' : 'Cheque book'} request placed!`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Request failed');
    } finally {
      setCardLoading(false);
    }
  };

  const InfoRow = ({ icon: Icon, label, value }) => (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0">
      <div className="w-8 h-8 rounded-xl bg-dark-700 flex items-center justify-center flex-shrink-0">
        <Icon className="text-dark-300 text-sm" />
      </div>
      <div className="flex-1">
        <p className="text-dark-400 text-xs">{label}</p>
        <p className="text-white text-sm font-medium mt-0.5">{value || '—'}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="page-title">My Profile</h1>
        <button onClick={() => editing ? handleSave() : setEditing(true)}
          className={editing ? 'btn-primary' : 'btn-secondary'}>
          {editing ? <><RiCheckLine /> Save Changes</> : <><RiEdit2Line /> Edit Profile</>}
        </button>
      </div>

      {/* Profile header */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-5 mb-5">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/20 border-2 border-brand-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-brand-400 font-display font-700 text-2xl">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          <div>
            <h2 className="text-white font-display font-700 text-xl">{user?.firstName} {user?.lastName}</h2>
            <p className="text-dark-300 text-sm">Customer ID: <span className="text-white font-mono">{user?.customerId}</span></p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="badge badge-success">{user?.accountStatus}</span>
              <span className="badge badge-info">{user?.kycStatus}</span>
            </div>
          </div>
        </div>

        {editing && (
          <div className="mb-4">
            <label className="form-label">Account Nickname</label>
            <input className="input-field" value={form.accountNickname}
              onChange={e => setForm(f => ({...f, accountNickname: e.target.value}))}
              placeholder="e.g. My Main Account" />
          </div>
        )}

        <InfoRow icon={RiMailLine}   label="Email Address" value={user?.email} />
        <InfoRow icon={RiPhoneLine}  label="Phone Number"  value={user?.phone} />
        <InfoRow icon={RiUserLine}   label="Username"      value={user?.username} />
      </div>

      {/* Account details */}
      <div className="glass-card p-5">
        <p className="text-white font-semibold mb-4">Account Information</p>
        <InfoRow icon={RiBankCardLine} label="Account Number" value={account?.account_number} />
        <InfoRow icon={RiBankCardLine} label="SWIFT Code"     value={account?.swift_code} />
        <InfoRow icon={RiBankCardLine} label="Account Type"   value={account?.account_type?.toUpperCase()} />
        <InfoRow icon={RiBankCardLine} label="Branch"         value={account?.branch_name} />
      </div>

      {/* Card & Cheque requests */}
      <div className="glass-card p-5">
        <p className="text-white font-semibold mb-4">Banking Services</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { type: 'debit_card', icon: '💳', label: 'Request Debit Card', desc: 'Physical debit card delivery in 7-10 days' },
            { type: 'cheque_book', icon: '📖', label: 'Request Cheque Book', desc: '25-leaf cheque book, delivery in 5-7 days' },
          ].map(s => (
            <button key={s.type}
              onClick={() => s.type === 'debit_card' ? navigate('/dashboard/cards') : requestCard(s.type)}
              disabled={cardLoading && s.type !== 'debit_card'}
              className="glass-card-hover p-4 text-left">
              <span className="text-2xl">{s.icon}</span>
              <p className="text-white font-medium text-sm mt-2">{s.label}</p>
              <p className="text-dark-400 text-xs mt-1">{s.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
