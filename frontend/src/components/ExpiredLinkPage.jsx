import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, LifeBuoy, Clock } from 'lucide-react';
import { RiLoader4Line, RiCheckLine, RiSendPlaneLine } from 'react-icons/ri';
import api from '../services/api';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · EXPIRED ONBOARDING LINK + SELF-SERVICE RECOVERY
   Rendered the instant an expired/invalid secure onboarding link (Video KYC or
   Account Setup) is opened. Instead of a dead end, the user can prove identity
   (registered email + Customer ID) and request a fresh 24-hour link right here.
   Theme: matte-black #0d0e12 · deep-crimson #c8102e accents · crisp modern type.
   ────────────────────────────────────────────────────────────────────────── */

const CRIMSON = '#c8102e';

// Resolve the onboarding context from an explicit prop or the current URL path.
function resolveType(explicitType) {
  if (explicitType === 'video-kyc' || explicitType === 'account-setup') return explicitType;
  if (typeof window !== 'undefined' && /video-kyc|cyber-kyc/i.test(window.location.pathname)) {
    return 'video-kyc';
  }
  return 'account-setup';
}

export default function ExpiredLinkPage({ type, supportEmail = 'support@alisterbank.com' }) {
  const resolvedType = resolveType(type);
  const isVideoKyc = resolvedType === 'video-kyc';
  const flowLabel = isVideoKyc ? 'Video KYC' : 'Account Setup';

  const [email, setEmail] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle' | 'success' | 'error'
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!email.trim() || !customerId.trim()) {
      setStatus('error');
      setMessage('Please enter both your registered email and Customer ID.');
      return;
    }

    setLoading(true);
    setStatus('idle');
    setMessage('');

    try {
      const { data } = await api.post('/auth/regenerate-link', {
        email: email.trim(),
        customerId: customerId.trim(),
        type: resolvedType,
      });

      setStatus('success');
      // A genuinely-issued link shows the canonical confirmation; an
      // already-activated account surfaces the server's informative message.
      setMessage(
        data?.data?.alreadyDone
          ? (data.message || 'Your account is already active. Please log in.')
          : 'Link dispatched! Check your email inbox.'
      );
      setEmail('');
      setCustomerId('');
    } catch (err) {
      setStatus('error');
      setMessage(err?.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full rounded-xl px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition-all '
    + 'bg-[#0d0e12] border border-white/[0.1] focus:border-[#c8102e] focus:ring-2 focus:ring-[#c8102e]/25';

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden px-5 py-12"
      style={{ background: '#0d0e12' }}
    >
      {/* Ambient crimson glows */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[620px] h-[620px] rounded-full blur-[150px]"
        style={{ background: 'radial-gradient(circle, rgba(200,16,46,0.18), transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute bottom-0 right-0 w-[420px] h-[420px] rounded-full blur-[140px]"
        style={{ background: 'radial-gradient(circle, rgba(101,8,24,0.22), transparent 70%)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-lg rounded-3xl border border-white/[0.08] p-8 sm:p-10 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(21,22,28,0.92) 0%, rgba(13,14,18,0.96) 100%)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        {/* Brand strip */}
        <div className="flex items-center justify-center gap-2.5 mb-7">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-red-500/40"
            style={{ background: 'rgba(255,255,255,0.04)', boxShadow: `0 0 18px ${CRIMSON}55` }}
          >
            <Clock size={17} style={{ color: '#ff4060' }} />
          </div>
          <p className="font-display font-bold tracking-tight text-white text-lg">
            ALISTER<span style={{ color: '#ff4060' }}> BANK</span>
          </p>
        </div>

        {/* Pulsing alert badge */}
        <motion.div
          animate={{
            boxShadow: [
              `0 0 26px ${CRIMSON}55`,
              `0 0 48px ${CRIMSON}99`,
              `0 0 26px ${CRIMSON}55`,
            ],
          }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center mb-6 border"
          style={{ borderColor: `${CRIMSON}66`, background: `${CRIMSON}14` }}
        >
          <ShieldAlert size={38} style={{ color: '#ff4060' }} />
        </motion.div>

        <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
          {flowLabel} Link Expired
        </h1>

        <p className="text-dark-100 text-sm sm:text-[15px] leading-relaxed max-w-md mx-auto">
          This secure {flowLabel.toLowerCase()} link is no longer valid. Verify your details below and
          we&apos;ll send a fresh link to your registered email.
        </p>

        {/* ── Self-service recovery form ─────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="mt-7 space-y-3.5 text-left">
          <div>
            <label htmlFor="recovery-email" className="block text-[11px] font-medium uppercase tracking-widest text-white/45 mb-1.5">
              Registered Email Address
            </label>
            <input
              id="recovery-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={loading}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="recovery-customer-id" className="block text-[11px] font-medium uppercase tracking-widest text-white/45 mb-1.5">
              Your Alister Customer ID
            </label>
            <input
              id="recovery-customer-id"
              type="text"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="e.g. ALB-XXXXXXXX"
              disabled={loading}
              className={inputCls}
            />
          </div>

          {/* Status messages */}
          {status === 'success' && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm border border-green-500/30 bg-green-500/10 text-green-400">
              <RiCheckLine className="text-lg flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm border border-red-500/30 bg-red-500/10 text-red-300">
              <ShieldAlert size={16} className="flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm tracking-wide uppercase text-white transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: `linear-gradient(135deg, ${CRIMSON}, #850a1e)`,
              boxShadow: `0 0 28px ${CRIMSON}55`,
            }}
          >
            {loading ? (
              <>
                <RiLoader4Line className="animate-spin text-lg" /> Sending…
              </>
            ) : (
              <>
                <RiSendPlaneLine className="text-lg" /> Request Secure Link
              </>
            )}
          </button>
        </form>

        {/* Secondary action */}
        <div className="mt-6 flex items-center justify-center">
          <a
            href={`mailto:${supportEmail}`}
            className="inline-flex items-center gap-2 text-sm text-white/55 hover:text-white transition-colors"
          >
            <LifeBuoy size={15} /> Still stuck? Contact Support
          </a>
        </div>

        <p className="mt-7 text-[11px] text-dark-300 tracking-wide">
          For your security, onboarding links remain valid for 24 hours after issuance.
        </p>
      </motion.div>
    </div>
  );
}
