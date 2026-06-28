import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RiBankLine, RiUserLine, RiLockLine, RiEyeLine, RiEyeOffLine, RiShieldKeyholeLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import ExpiredLinkPage from '../../components/ExpiredLinkPage';

export default function AccountSetupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [validLink, setValidLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', confirm: '', securityPin: '' });
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setValidLink(false); setLoading(false); return; }
    api.get(`/account/verify-setup/${token}`)
      .then(() => setValidLink(true))
      .catch(() => setValidLink(false))
      .finally(() => setLoading(false));
  }, [token]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { toast.error('Passwords do not match'); return; }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (!/^\d{4}$/.test(form.securityPin)) { toast.error('Security PIN must be exactly 4 digits'); return; }
    setSubmitting(true);
    try {
      await api.post('/auth/setup-account', {
        token,
        username: form.username,
        password: form.password,
        securityPin: form.securityPin,
      });
      setDone(true);
      toast.success('Account activated! Welcome to Alister Bank!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-dark-900 flex items-center justify-center"><div className="spinner w-8 h-8" /></div>;

  // Expired / invalid setup link → halt onboarding and show the professional
  // secure-link error terminal (interceptor validation on the token route).
  if (!validLink) return <ExpiredLinkPage type="account-setup" />;

  if (done) return (
    <div className="min-h-screen bg-dark-900 flex items-center justify-center p-6">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="glass-card p-10 text-center max-w-md">
        <div className="text-6xl mb-4">🏦</div>
        <h2 className="font-display text-2xl font-700 text-white mb-3">Account Activated!</h2>
        <p className="text-dark-200 text-sm mb-6">Your Alister Bank account is ready. Log in with your new username and password.</p>
        <button onClick={() => navigate('/login')} className="btn-primary mx-auto px-8">Login Now</button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-900 p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center">
            <RiBankLine className="text-white text-lg" />
          </div>
          <p className="font-display font-700 text-white text-lg">ALISTER BANK</p>
        </div>
        <div className="glass-card p-8">
          <h2 className="font-display text-2xl font-700 text-white mb-1">Set Up Your Account</h2>
          <p className="text-dark-200 text-sm mb-6">Create your login credentials and security PIN</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Choose Username</label>
              <div className="relative">
                <RiUserLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                <input type="text" value={form.username} onChange={set('username')}
                  placeholder="Min. 5 characters" className="input-field pl-10" minLength={5} required />
              </div>
            </div>
            {[
              { key: 'password', label: 'Create Password', placeholder: 'Min. 8 characters' },
              { key: 'confirm', label: 'Confirm Password', placeholder: 'Re-enter password' },
            ].map(f => (
              <div key={f.key}>
                <label className="form-label">{f.label}</label>
                <div className="relative">
                  <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                  <input type={showPwd ? 'text' : 'password'} value={form[f.key]} onChange={set(f.key)}
                    placeholder={f.placeholder} className="input-field pl-10 pr-10" required />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-300 hover:text-white">
                    {showPwd ? <RiEyeOffLine /> : <RiEyeLine />}
                  </button>
                </div>
              </div>
            ))}
            <div>
              <label className="form-label">4-Digit Security PIN</label>
              <div className="relative">
                <RiShieldKeyholeLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                <input type="password" inputMode="numeric" maxLength={4} value={form.securityPin} onChange={set('securityPin')}
                  placeholder="Used to authorize transfers" className="input-field pl-10" pattern="\d{4}" required />
              </div>
              <p className="text-dark-400 text-xs mt-1">This PIN will be required for every transfer.</p>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full py-3.5 mt-2">
              {submitting ? <><div className="spinner w-4 h-4" /> Activating...</> : '🚀 Activate My Account'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
