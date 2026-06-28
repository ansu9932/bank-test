import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { RiLockLine, RiShieldLine, RiEyeLine, RiEyeOffLine, RiLogoutBoxLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { logout } from '../../store/slices/authSlice';
import { useNavigate } from 'react-router-dom';

export default function SecurityPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState({ current: '', new: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwd.new !== pwd.confirm) { toast.error('New passwords do not match'); return; }
    if (pwd.new.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: pwd.current, newPassword: pwd.new });
      toast.success('Password changed! Please log in again.');
      await dispatch(logout());
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Password change failed');
    } finally {
      setLoading(false);
    }
  };

  const SecurityItem = ({ icon: Icon, title, desc, action }) => (
    <div className="flex items-center justify-between py-4 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-dark-700 flex items-center justify-center flex-shrink-0">
          <Icon className="text-brand-400 text-lg" />
        </div>
        <div>
          <p className="text-white text-sm font-medium">{title}</p>
          <p className="text-dark-400 text-xs mt-0.5">{desc}</p>
        </div>
      </div>
      {action}
    </div>
  );

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="page-title">Security</h1>
        <p className="text-dark-300 text-sm mt-0.5">Manage your account security settings</p>
      </div>

      {/* Security overview */}
      <div className="glass-card p-5">
        <p className="text-white font-semibold mb-1">Security Overview</p>
        <SecurityItem icon={RiShieldLine} title="Password Protection" desc="Your password is encrypted with bcrypt" action={<span className="badge badge-success">Active</span>} />
        <SecurityItem icon={RiShieldLine} title="Bank-Grade Encryption" desc="256-bit TLS encryption on all connections" action={<span className="badge badge-success">Active</span>} />
        <SecurityItem icon={RiShieldLine} title="Session Management" desc="Auto-logout after inactivity" action={<span className="badge badge-success">Active</span>} />
        <SecurityItem icon={RiShieldLine} title="Transfer PIN" desc="4-digit PIN required for every transfer" action={<span className="badge badge-success">Active</span>} />
      </div>

      {/* Change password */}
      <div className="glass-card p-5">
        <p className="text-white font-semibold mb-4 flex items-center gap-2">
          <RiLockLine className="text-brand-400" /> Change Password
        </p>
        <form onSubmit={changePassword} className="space-y-4">
          {[
            { k: 'current', label: 'Current Password' },
            { k: 'new', label: 'New Password (min 8 characters)' },
            { k: 'confirm', label: 'Confirm New Password' },
          ].map(f => (
            <div key={f.k}>
              <label className="form-label">{f.label}</label>
              <div className="relative">
                <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                <input type={showPwd ? 'text' : 'password'} value={pwd[f.k]}
                  onChange={e => setPwd(p => ({ ...p, [f.k]: e.target.value }))}
                  className="input-field pl-10 pr-10" required />
                {f.k === 'confirm' && (
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-300 hover:text-white">
                    {showPwd ? <RiEyeOffLine /> : <RiEyeLine />}
                  </button>
                )}
              </div>
            </div>
          ))}
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <><div className="spinner w-4 h-4" /> Changing...</> : 'Change Password'}
          </button>
        </form>
      </div>

      {/* Sessions */}
      <div className="glass-card p-5">
        <p className="text-white font-semibold mb-4 flex items-center gap-2">
          <RiLogoutBoxLine className="text-brand-400" /> Active Sessions
        </p>
        <p className="text-dark-300 text-sm mb-3">Signing out will terminate all active sessions on all devices.</p>
        <button onClick={async () => { await dispatch(logout()); navigate('/login'); }}
          className="btn-secondary text-red-400 border-red-500/20 hover:bg-red-500/10">
          <RiLogoutBoxLine /> Sign Out All Devices
        </button>
      </div>
    </div>
  );
}
