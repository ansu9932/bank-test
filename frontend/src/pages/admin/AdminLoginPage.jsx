import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RiShieldLine, RiUserLine, RiLockLine, RiEyeLine, RiEyeOffLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingMsg, setPendingMsg] = useState('');

  // Persistent per-browser device identifier. Generated once and reused so a
  // super-admin can approve THIS device for admin-panel access.
  const getDeviceId = () => {
    let id = localStorage.getItem('adminDeviceId');
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) ||
        `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('adminDeviceId', id);
    }
    return id;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPendingMsg('');
    try {
      const deviceId = getDeviceId();
      const { data } = await api.post('/admin/login', { ...form, deviceId });
      localStorage.setItem('adminToken', data.data.token);
      toast.success(`Welcome, ${data.data.admin.fullName}`);
      navigate('/admin');
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || 'Login failed';
      // 403 = device not approved (pending/revoked) — show a persistent notice.
      if (status === 403) setPendingMsg(msg);
      toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-brand-500 flex items-center justify-center">
            <RiShieldLine className="text-white text-xl" />
          </div>
          <div>
            <p className="font-display font-700 text-white">Alister Bank</p>
            <p className="text-dark-400 text-xs">Admin Portal</p>
          </div>
        </div>
        <div className="glass-card p-8">
          <h2 className="font-display text-xl font-700 text-white mb-1">Admin Login</h2>
          <p className="text-dark-300 text-sm mb-6">Authorized personnel only</p>
          {pendingMsg && (
            <div className="mb-5 rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(204,0,0,0.10)', border: '1px solid rgba(204,0,0,0.35)', color: '#ff8888' }}>
              <p className="font-semibold mb-1">🔒 Device not approved</p>
              <p className="text-[13px] leading-snug">{pendingMsg}</p>
              <p className="text-[11px] text-dark-300 mt-2">Ask a super-admin to approve this device under <strong>Admin → Devices</strong>, then sign in again.</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Username or Email</label>
              <div className="relative">
                <RiUserLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                <input type="text" value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))}
                  placeholder="admin@alisterbank.com" className="input-field pl-10" required />
              </div>
            </div>
            <div>
              <label className="form-label">Password</label>
              <div className="relative">
                <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                <input type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={e => setForm(f => ({...f, password: e.target.value}))}
                  placeholder="Enter admin password" className="input-field pl-10 pr-10" required />
                <button type="button" onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-300 hover:text-white">
                  {showPwd ? <RiEyeOffLine /> : <RiEyeLine />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-3.5">
              {loading ? <><div className="spinner w-4 h-4" /> Authenticating...</> : '🔐 Login to Admin'}
            </button>
          </form>
          <p className="text-dark-500 text-xs text-center mt-4">
            Demo: admin@alisterbank.com / Admin@1234
          </p>
        </div>
      </motion.div>
    </div>
  );
}
