import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiSmartphoneLine, RiRefreshLine, RiCheckboxCircleFill,
  RiCloseCircleFill, RiTimeLine, RiShieldCheckLine, RiQrCodeLine,
} from 'react-icons/ri';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { qrLogin } from '../../store/slices/authSlice';

/**
 * "Scan to Login" panel on the NetBanking login page.
 *
 * The QR is generated ON DEMAND: the user clicks "Generate QR Code", the
 * code lives for 60 seconds with a countdown ring, and when it expires the
 * button simply comes back — no codes are minted that nobody asked for.
 * While live, we short-poll /qr-login/status/:qrId every 2s through:
 *   pending → scanned → approved (one-time token → exchange → dashboard)
 *                     → rejected | expired
 *
 * Polling (not WebSocket) keeps this compatible with the existing
 * Express + PM2 deployment with zero new infrastructure.
 */
const QR_TTL_SECONDS = 60;

export default function QrLoginPanel({ onSuccess }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // ui: idle | loading | active | scanned | approving | success | rejected | expired | error
  const [ui, setUi] = useState('idle');
  const [qr, setQr] = useState(null); // { qrId, qrImage, expiresAt }
  const [secondsLeft, setSecondsLeft] = useState(QR_TTL_SECONDS);
  const pollRef = useRef(null);
  const tickRef = useRef(null);
  const deadRef = useRef(false); // guards state updates after unmount

  const stopTimers = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  };

  const createSession = useCallback(async () => {
    stopTimers();
    setUi('loading');
    try {
      const { data } = await api.post('/qr-login/create');
      const info = data.data || data;
      if (deadRef.current) return;
      // Guard against unexpected server responses (old backend, proxy HTML,
      // etc.) — never render a broken image or a NaN countdown.
      if (!info || !info.qrId || !info.qrImage || !info.expiresAt) {
        throw new Error('QR login is not available right now.');
      }
      const ttl = Math.round((new Date(info.expiresAt) - Date.now()) / 1000);
      setQr(info);
      setSecondsLeft(Number.isFinite(ttl) ? Math.max(1, Math.min(ttl, QR_TTL_SECONDS)) : QR_TTL_SECONDS);
      setUi('active');

      // Countdown tick (1s)
      tickRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) return 0;
          return s - 1;
        });
      }, 1000);

      // Status poll (2s)
      pollRef.current = setInterval(async () => {
        try {
          const { data: st } = await api.get(`/qr-login/status/${info.qrId}`);
          const body = st.data || st;
          if (deadRef.current) return;

          if (body.status === 'scanned') {
            setUi('scanned');
          } else if (body.status === 'approved' && body.loginToken) {
            stopTimers();
            setUi('approving');
            const result = await dispatch(qrLogin({ qrId: info.qrId, loginToken: body.loginToken }));
            if (qrLogin.fulfilled.match(result)) {
              setUi('success');
              toast.success('Welcome back!');
              if (onSuccess) onSuccess();
              navigate('/dashboard');
            } else {
              setUi('error');
            }
          } else if (body.status === 'rejected') {
            stopTimers();
            setUi('rejected');
          } else if (body.status === 'expired') {
            stopTimers();
            setUi('expired');
          }
        } catch {
          /* transient poll errors are ignored; expiry timer still runs */
        }
      }, info.pollMs || 2000);
    } catch (err) {
      if (deadRef.current) return;
      setUi('error');
      toast.error(err.response?.data?.message || err.message || 'Could not generate a QR code.');
    }
  }, [dispatch, navigate, onSuccess]);

  // When the countdown hits zero while still waiting for a scan, the code
  // is dead — stop everything and bring the Generate button back.
  useEffect(() => {
    if (secondsLeft === 0 && ui === 'active') {
      stopTimers();
      setUi('expired');
    }
  }, [secondsLeft, ui]);

  // No auto-generation on mount: codes are only minted when the user asks.
  useEffect(() => {
    deadRef.current = false;
    return () => { deadRef.current = true; stopTimers(); };
  }, []);

  const pct = Math.max(0, Math.min(100, (secondsLeft / QR_TTL_SECONDS) * 100));

  return (
    <div className="flex flex-col items-center text-center">
      {/* QR area */}
      <div className="relative w-[260px] h-[260px] rounded-2xl overflow-hidden border border-white/10 bg-white flex items-center justify-center">
        <AnimatePresence mode="wait">
          {ui === 'idle' && (
            <motion.div key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 px-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#CC0000]/10 border border-[#CC0000]/25" aria-hidden="true">
                <RiQrCodeLine className="text-3xl text-[#CC0000]" />
              </span>
              <p className="text-[#101623]/60 text-xs leading-relaxed max-w-[200px]">
                Generate a one-time QR code, then scan it with the Alister Bank app.
              </p>
              <button
                type="button"
                onClick={createSession}
                className="px-6 py-3 rounded-[10px] bg-[#CC0000] text-white text-sm font-semibold hover:bg-[#E60000] transition-colors shadow-[0_4px_14px_rgba(204,0,0,0.3)]"
              >
                Generate QR Code
              </button>
            </motion.div>
          )}

          {ui === 'loading' && (
            <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 text-[#101623]">
              <RiRefreshLine className="text-3xl animate-spin" />
              <p className="text-sm font-medium">Generating secure code…</p>
            </motion.div>
          )}

          {ui === 'active' && qr && (
            <motion.img key="q" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }} src={qr.qrImage} alt="Scan this QR code with the Alister Bank mobile app to log in"
              className="w-full h-full object-contain" />
          )}

          {ui === 'scanned' && (
            <motion.div key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 px-6">
              <RiSmartphoneLine className="text-4xl text-[#CC0000]" />
              <p className="text-[#101623] font-semibold text-sm">Scanned</p>
              <p className="text-[#101623]/60 text-xs leading-relaxed">
                Approve the login on your phone — swipe and enter your MPIN.
              </p>
              <span className="mt-1 inline-block w-6 h-6 rounded-full border-2 border-[#CC0000] border-t-transparent animate-spin" aria-hidden="true" />
            </motion.div>
          )}

          {(ui === 'approving' || ui === 'success') && (
            <motion.div key="a" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-3 px-6">
              <RiCheckboxCircleFill className="text-5xl text-green-600" />
              <p className="text-[#101623] font-semibold text-sm">
                {ui === 'success' ? 'Signed in — welcome back!' : 'Approved — signing you in…'}
              </p>
            </motion.div>
          )}

          {ui === 'rejected' && (
            <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 px-6">
              <RiCloseCircleFill className="text-5xl text-[#CC0000]" />
              <p className="text-[#101623] font-semibold text-sm">Login rejected</p>
              <p className="text-[#101623]/60 text-xs">The request was declined on your phone.</p>
            </motion.div>
          )}

          {(ui === 'expired' || ui === 'error') && (
            <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 px-6">
              <RiTimeLine className="text-5xl text-[#101623]/40" />
              <p className="text-[#101623] font-semibold text-sm">
                {ui === 'expired' ? 'QR code expired' : 'Something went wrong'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Countdown bar (only while a live code is on screen) */}
      {ui === 'active' && (
        <div className="w-[260px] mt-3">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${pct}%`,
                background: secondsLeft <= 10 ? '#CC0000' : '#22c55e',
              }}
            />
          </div>
          <p className="text-white/40 text-xs mt-1.5" aria-live="polite">
            Refreshes in {secondsLeft}s
          </p>
        </div>
      )}

      {/* The Generate button comes back for every terminal state */}
      {['rejected', 'expired', 'error'].includes(ui) && (
        <button
          type="button"
          onClick={createSession}
          className="mt-4 px-6 py-3 rounded-[10px] bg-[#CC0000] text-white text-sm font-semibold hover:bg-[#E60000] transition-colors shadow-[0_4px_14px_rgba(204,0,0,0.3)]"
        >
          Generate QR Code
        </button>
      )}

      {/* How-to steps */}
      <div className="mt-5 w-full max-w-[300px] text-left space-y-2.5">
        {[
          'Open the Alister Bank app on your registered phone',
          'Tap "Scan to Login" and point at this code',
          'Verify the details, swipe, and enter your MPIN',
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#CC0000]/15 border border-[#CC0000]/40 text-[#FF3333] text-[11px] font-bold flex items-center justify-center">
              {i + 1}
            </span>
            <p className="text-white/50 text-[13px] leading-snug">{step}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-white/30 text-[11px]">
        <RiShieldCheckLine className="text-sm" />
        No password typed — nothing for phishing pages to steal.
      </p>
    </div>
  );
}
