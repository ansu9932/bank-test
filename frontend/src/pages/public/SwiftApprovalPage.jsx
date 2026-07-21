import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  RiGlobalLine, RiShieldCheckLine, RiLoader4Line, RiCheckDoubleLine,
  RiErrorWarningLine, RiMailSendLine,
} from 'react-icons/ri';
import api from '../../services/api';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · PUBLIC SWIFT EMAIL SELF-APPROVAL PAGE
   Landing page for the "Approve this transaction" button in the payment-
   processing email (/swift-approval?token=…). Flow:
     review details → send OTP to the registered email → verify → the
     transfer completes instantly (post-approval SMS is sent by the backend).
   ────────────────────────────────────────────────────────────────────────── */

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CRIMSON = '#c8102e';

export default function SwiftApprovalPage() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  // phase: loading | invalid | review | otp | done
  const [phase, setPhase] = useState('loading');
  const [details, setDetails] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!token) {
      setErrorMsg('This approval link is missing its token. Please open the link from your email again.');
      setPhase('invalid');
      return;
    }
    (async () => {
      try {
        // `_ts` cache-buster: guarantees a fresh request even for browsers that
        // disk-cached an earlier error response for this exact URL.
        const { data } = await api.get('/swift-approval/review', {
          params: { token, _ts: Date.now() },
          headers: { 'Cache-Control': 'no-cache' },
        });
        setDetails(data.data);
        setMaskedEmail(data.data?.maskedEmail || '');
        setPhase('review');
      } catch (err) {
        setErrorMsg(err?.response?.data?.message || 'This approval link is invalid or has expired.');
        setPhase('invalid');
      }
    })();
  }, [token]);

  const sendOtp = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/swift-approval/send-otp', { token });
      setMaskedEmail(data?.data?.maskedEmail || maskedEmail);
      toast.success(data?.message || 'Verification code sent to your registered email.');
      setOtp('');
      setPhase('otp');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not send the verification code.');
    } finally {
      setBusy(false);
    }
  }, [token, maskedEmail]);

  const verify = useCallback(async () => {
    if (otp.length !== 6) { toast.error('Enter the 6-digit code from your email.'); return; }
    setBusy(true);
    try {
      const { data } = await api.post('/swift-approval/verify', { token, otp });
      setResult(data?.data || null);
      toast.success(data?.message || 'Transfer approved and completed.');
      setPhase('done');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }, [token, otp]);

  const detailRows = details ? [
    ['Reference', details.reference],
    ['Beneficiary', details.beneficiaryName || '—'],
    ['Account', details.beneficiaryAccount || '—'],
    ['Beneficiary Bank', details.beneficiaryBank || '—'],
    ['SWIFT / BIC', details.swiftCode || '—'],
    ['Destination', details.country || '—'],
    ...(details.eta ? [['Expected delivery', details.eta]] : []),
  ] : [];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        className="alb-approval-card w-full max-w-md rounded-2xl border border-white/10 bg-[#111118] p-7">

        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl font-bold text-xl mb-2"
            style={{ background: CRIMSON, color: '#fff', fontFamily: 'Georgia, serif' }}>A</div>
          <h1 className="text-lg font-bold tracking-wide">ALISTER BANK</h1>
          <p className="text-white/40 text-xs mt-0.5 flex items-center justify-center gap-1">
            <RiGlobalLine /> SWIFT Transfer Approval
          </p>
        </div>

        {phase === 'loading' && (
          <div className="text-center py-10">
            <RiLoader4Line className="animate-spin text-3xl mx-auto mb-3" style={{ color: CRIMSON }} />
            <p className="text-white/50 text-sm">Loading your transfer…</p>
          </div>
        )}

        {phase === 'invalid' && (
          <div className="text-center py-8">
            <RiErrorWarningLine className="text-4xl mx-auto mb-3 text-red-400" />
            <p className="text-white/80 text-sm font-medium mb-2">Link not available</p>
            <p className="text-white/50 text-sm mb-6">{errorMsg}</p>
            <Link to="/" className="text-sm font-medium" style={{ color: CRIMSON }}>Return to Alister Bank →</Link>
          </div>
        )}

        {(phase === 'review' || phase === 'otp') && details && (
          <>
            {/* Amount hero */}
            <div className="rounded-xl text-center py-5 mb-4 border border-white/[0.06] bg-white/[0.03]">
              <p className="text-[11px] uppercase tracking-widest text-white/40">You are approving</p>
              <p className="text-3xl font-bold mt-1 tabular-nums text-amber-400">{fmt(details.amount)}</p>
              <p className="text-white/60 text-sm mt-1">to {details.beneficiaryName || 'the beneficiary'}</p>
            </div>

            {/* Read-only details */}
            <div className="rounded-xl border border-white/[0.06] divide-y divide-white/[0.05] mb-5">
              {detailRows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-white/40 text-xs">{label}</span>
                  <span className="text-sm font-medium text-right break-all">{value}</span>
                </div>
              ))}
            </div>

            {phase === 'review' && (
              <>
                <button type="button" onClick={sendOtp} disabled={busy}
                  className="w-full h-12 rounded-xl font-semibold text-[15px] transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: CRIMSON, color: '#fff' }}>
                  {busy ? <RiLoader4Line className="animate-spin" /> : <RiMailSendLine />}
                  Approve this transaction
                </button>
                <p className="text-white/40 text-xs text-center mt-3">
                  A one-time code will be sent to your registered email{maskedEmail ? ` (${maskedEmail})` : ''} to confirm.
                </p>
              </>
            )}

            {phase === 'otp' && (
              <>
                <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-1.5">
                  Verification code {maskedEmail ? `· sent to ${maskedEmail}` : ''}
                </label>
                <input
                  type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="w-full h-12 rounded-xl px-4 mb-3 text-center text-xl tracking-[0.5em] font-bold outline-none bg-white/[0.05] border border-white/10 focus:border-white/30"
                />
                <button type="button" onClick={verify} disabled={busy || otp.length !== 6}
                  className="w-full h-12 rounded-xl font-semibold text-[15px] transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: CRIMSON, color: '#fff' }}>
                  {busy ? <RiLoader4Line className="animate-spin" /> : <RiShieldCheckLine />}
                  Verify &amp; complete transfer
                </button>
                <div className="flex items-center justify-between mt-3">
                  <button type="button" onClick={() => setPhase('review')} className="text-white/40 text-xs hover:text-white/70">
                    ← Back
                  </button>
                  <button type="button" onClick={sendOtp} disabled={busy} className="text-xs font-medium disabled:opacity-50" style={{ color: CRIMSON }}>
                    Resend code
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {phase === 'done' && (
          <div className="text-center py-6">
            <RiCheckDoubleLine className="text-5xl mx-auto mb-3 text-emerald-400" />
            <h2 className="text-lg font-bold mb-1">Transfer approved</h2>
            <p className="text-white/60 text-sm mb-4">
              Your SWIFT transfer{details ? ` of ${fmt(details.amount)}` : ''} has been completed.
              An SMS confirmation is being sent to the mobile number you provided.
            </p>
            {(result?.reference || details?.reference) && (
              <p className="text-white/40 text-xs font-mono mb-6">Ref {result?.reference || details?.reference}</p>
            )}
            <Link to="/" className="text-sm font-medium" style={{ color: CRIMSON }}>Return to Alister Bank →</Link>
          </div>
        )}

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-white/30 mt-6">
          <RiShieldCheckLine /> Secured by Alister Bank · We never ask for your OTP or PIN.
        </p>
      </motion.div>
    </div>
  );
}
