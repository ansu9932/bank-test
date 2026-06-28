import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { RiBankLine, RiLockLine, RiEyeLine, RiEyeOffLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import Turnstile from '../../components/common/Turnstile';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const MAX_FAILED_ATTEMPTS = 3;

// ─── Live password-strength scoring ──────────────────────────────────────────
// Mirrors the backend policy (8+ chars, upper, lower, number) and adds a bonus
// for special characters / longer passwords.
function scorePassword(pwd) {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd) || pwd.length >= 12) score++;
  return score; // 0–5
}

const STRENGTH_META = [
  { label: '', color: '', bar: 'bg-dark-600', width: '0%' },
  { label: 'Very weak', color: 'text-red-400', bar: 'bg-red-500', width: '20%' },
  { label: 'Weak', color: 'text-orange-400', bar: 'bg-orange-500', width: '40%' },
  { label: 'Fair', color: 'text-yellow-400', bar: 'bg-yellow-500', width: '60%' },
  { label: 'Good', color: 'text-lime-400', bar: 'bg-lime-500', width: '80%' },
  { label: 'Strong', color: 'text-green-400', bar: 'bg-green-500', width: '100%' },
];

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const [form, setForm] = useState({ newPassword: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);

  const locked = failedAttempts >= MAX_FAILED_ATTEMPTS;
  const strength = useMemo(() => scorePassword(form.newPassword), [form.newPassword]);
  const meta = STRENGTH_META[strength];

  // When a site key is configured, a CAPTCHA token is mandatory to submit.
  const captchaRequired = Boolean(TURNSTILE_SITE_KEY);
  const captchaSatisfied = !captchaRequired || Boolean(captchaToken);
  const submitDisabled = loading || locked || !captchaSatisfied;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked) return;
    if (form.newPassword !== form.confirm) { toast.error('Passwords do not match'); return; }
    if (form.newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    if (!/[A-Z]/.test(form.newPassword) || !/[a-z]/.test(form.newPassword) || !/[0-9]/.test(form.newPassword)) {
      toast.error('Password must include uppercase, lowercase, and a number');
      return;
    }
    if (captchaRequired && !captchaToken) { toast.error('Please complete the CAPTCHA'); return; }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        newPassword: form.newPassword,
        captchaToken,
      });
      toast.success('Password reset successful!');
      navigate('/login');
    } catch (err) {
      const status = err.response?.status;
      if (status === 400) {
        setFailedAttempts((n) => n + 1);
      }
      // A used CAPTCHA token can only be redeemed once — force a fresh challenge.
      setCaptchaToken('');
      toast.error(err.response?.data?.message || 'Reset failed. Link may be expired.');
    } finally {
      setLoading(false);
    }
  };

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
          <h2 className="font-display text-2xl font-700 text-white mb-1">Reset Password</h2>
          <p className="text-dark-200 text-sm mb-6">Create a new secure password for your account.</p>
          {!token ? (
            <p className="text-red-400 text-sm">Invalid or missing reset token. <Link to="/forgot-password" className="text-brand-400">Request new link</Link></p>
          ) : locked ? (
            <div className="text-center py-4">
              <p className="text-red-400 text-sm mb-4">
                Too many attempts. Please request a new reset link.
              </p>
              <Link to="/forgot-password" className="btn-primary inline-flex px-6 py-2.5">
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { key: 'newPassword', label: 'New Password', placeholder: 'Min. 8 characters' },
                { key: 'confirm', label: 'Confirm Password', placeholder: 'Repeat your password' },
              ].map(f => (
                <div key={f.key}>
                  <label className="form-label">{f.label}</label>
                  <div className="relative">
                    <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
                    <input
                      type={show ? 'text' : 'password'}
                      value={form[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder} className="input-field pl-10 pr-10"
                    />
                    <button type="button" onClick={() => setShow(!show)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-dark-300 hover:text-white">
                      {show ? <RiEyeOffLine /> : <RiEyeLine />}
                    </button>
                  </div>
                  {/* Live password-strength indicator (under the New Password field). */}
                  {f.key === 'newPassword' && form.newPassword && (
                    <div className="mt-2">
                      <div className="h-1.5 w-full rounded-full bg-dark-600 overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-300 ${meta.bar}`} style={{ width: meta.width }} />
                      </div>
                      <p className={`text-xs mt-1 ${meta.color}`}>{meta.label}</p>
                    </div>
                  )}
                </div>
              ))}

              {/* Bot protection — rendered only when a site key is configured. */}
              {captchaRequired && (
                <div>
                  <Turnstile
                    siteKey={TURNSTILE_SITE_KEY}
                    onVerify={setCaptchaToken}
                    onExpire={() => setCaptchaToken('')}
                    theme="dark"
                  />
                </div>
              )}

              <button type="submit" disabled={submitDisabled} className="btn-primary w-full py-3.5 disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? <><div className="spinner w-4 h-4" /> Resetting...</> : 'Reset Password'}
              </button>

              {failedAttempts > 0 && (
                <p className="text-yellow-400 text-xs text-center">
                  {MAX_FAILED_ATTEMPTS - failedAttempts} attempt(s) remaining before you'll need a new link.
                </p>
              )}
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
