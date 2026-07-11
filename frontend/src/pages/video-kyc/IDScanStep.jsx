import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Camera, SwitchCamera, AlertTriangle, RefreshCw, Loader2, CreditCard,
} from 'lucide-react';
import { laplacianVariance, frameDiff } from './faceMath';

const STABLE_MS = 1200;      // card must be stable/sharp/lit this long
const SHARPNESS_MIN = 120;   // Laplacian variance floor (blur check)
const LUMA_MIN = 60;
const DIFF_MAX = 9;          // mean frame difference = "stable"
const MANUAL_AFTER_MS = 8000;
const CARD_ASPECT = 1.586;   // ISO ID-1 credit-card ratio

function describeCameraError(err) {
  const name = err?.name || '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera is blocked for this site. Tap the lock icon next to the address bar → Permissions → Camera → Allow, then reload this page.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'No usable camera was found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'Your camera is busy or in use by another app. Close other camera apps, then tap Retry.';
    default:
      return 'Unable to access the camera. Check the camera permission for this site, then tap Retry.';
  }
}

/**
 * Step 4 — ID card scan. Rear camera (not mirrored), rectangular
 * card frame with animated corner brackets + laser line. Auto-captures
 * when the card region is sharp, well lit, and stable for ~1.5s.
 * A manual shutter appears as fallback after 8s.
 */
export default function IDScanStep({ onCaptured }) {
  const videoRef = useRef(null);
  const roiCanvasRef = useRef(document.createElement('canvas'));
  const snapCanvasRef = useRef(document.createElement('canvas'));
  const streamRef = useRef(null);
  const mountedRef = useRef(true);
  const S = useRef({ stableStart: 0, prevRoi: null, startedAt: 0, captured: false });

  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState('');
  const [facing, setFacing] = useState('environment');
  const [switching, setSwitching] = useState(false);
  const [hint, setHint] = useState('Place your ID card inside the frame');
  const [progress, setProgress] = useState(0);
  const [showManual, setShowManual] = useState(false);
  const [flash, setFlash] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const acquire = useCallback(async (mode) => {
    stopStream();
    setCamReady(false);
    setCamError('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamError('Camera unavailable here. Open this link in Chrome or Safari over a secure (https) connection.');
      return;
    }
    const attempts = [
      // Highest available resolution first — sharper text = better OCR.
      { video: { facingMode: { exact: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: mode }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr = null;
    for (const constraints of attempts) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mountedRef.current) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          const p = videoRef.current.play();
          if (p?.catch) p.catch(() => {});
        }
        S.current.startedAt = performance.now();
        setCamReady(true);
        return;
      } catch (e) {
        lastErr = e;
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') break;
      }
    }
    if (mountedRef.current) setCamError(describeCameraError(lastErr));
  }, [stopStream]);

  useEffect(() => {
    mountedRef.current = true;
    acquire('environment');
    return () => {
      mountedRef.current = false;
      stopStream();
    };
  }, [acquire, stopStream]);

  const switchCamera = useCallback(async () => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setSwitching(true);
    setFacing(next);
    await acquire(next);
    setSwitching(false);
  }, [facing, acquire]);

  /* Compute the card ROI rect in video pixel coordinates. */
  const cardRect = useCallback((v) => {
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    let w = vw * 0.82;
    let h = w / CARD_ASPECT;
    if (h > vh * 0.6) { h = vh * 0.6; w = h * CARD_ASPECT; }
    return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
  }, []);

  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || S.current.captured) return;
    S.current.captured = true;
    const { x, y, w, h } = cardRect(v);
    // Pad the crop ~4% so text touching the frame edges isn't cut off (OCR).
    const padX = w * 0.04;
    const padY = h * 0.04;
    const sx = Math.max(0, x - padX);
    const sy = Math.max(0, y - padY);
    const sw = Math.min(v.videoWidth - sx, w + padX * 2);
    const sh = Math.min(v.videoHeight - sy, h + padY * 2);
    const c = snapCanvasRef.current;
    c.width = Math.round(sw);
    c.height = Math.round(sh);
    c.getContext('2d').drawImage(v, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const dataURL = c.toDataURL('image/jpeg', 0.93);
    setFlash(true);
    setTimeout(() => onCaptured(dataURL), 350);
  }, [cardRect, onCaptured]);

  /* Quality-check loop (throttled ~6fps to avoid jank). */
  useEffect(() => {
    if (!camReady) return undefined;
    const id = setInterval(() => {
      const st = S.current;
      const v = videoRef.current;
      if (!v || !v.videoWidth || st.captured || document.hidden) return;

      const { x, y, w, h } = cardRect(v);
      const roi = roiCanvasRef.current;
      const rw = 160;
      const rh = Math.round(rw / CARD_ASPECT);
      roi.width = rw;
      roi.height = rh;
      const ctx = roi.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, x, y, w, h, 0, 0, rw, rh);
      const img = ctx.getImageData(0, 0, rw, rh);

      const sharp = laplacianVariance(img);
      // Measure lighting on the CARD region itself (not the whole frame) so
      // a dark background no longer blocks auto-capture of a well-lit card.
      let lumaSum = 0;
      for (let i = 0; i < img.data.length; i += 16) {
        lumaSum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
      }
      const luma = lumaSum / (img.data.length / 16);
      const diff = frameDiff(img, st.prevRoi);
      st.prevRoi = img;

      const now = performance.now();
      if (now - st.startedAt > MANUAL_AFTER_MS) setShowManual(true);

      let problem = '';
      if (luma < LUMA_MIN) problem = 'Too dark — find better lighting';
      else if (sharp < SHARPNESS_MIN) problem = 'Image is blurry — hold steady, move slightly closer';
      else if (diff > DIFF_MAX) problem = 'Hold the card still inside the frame';

      if (problem) {
        setHint(problem);
        st.stableStart = 0;
        setProgress(0);
        return;
      }

      setHint('Perfect — hold it right there');
      if (!st.stableStart) st.stableStart = now;
      const p = Math.min(1, (now - st.stableStart) / STABLE_MS);
      setProgress(p);
      if (p >= 1) capture();
    }, 160);
    return () => clearInterval(id);
  }, [camReady, cardRect, capture]);

  return (
    <div className="relative w-full flex-1 flex flex-col overflow-hidden">
      <div className="relative w-full flex-1 min-h-[320px] bg-[#0A0A0A] overflow-hidden">
        {/* Rear camera — NOT mirrored */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {camError ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 bg-[#0A0A0A]">
            <div className="max-w-sm text-center">
              <AlertTriangle size={32} className="text-[#DC2626] mx-auto mb-3" aria-hidden="true" />
              <p role="alert" className="text-sm text-white/85 leading-relaxed mb-5">{camError}</p>
              <button
                onClick={() => acquire(facing)}
                className="min-h-[48px] px-6 rounded-xl bg-[#DC2626] text-white font-semibold text-sm inline-flex items-center gap-2"
              >
                <RefreshCw size={16} aria-hidden="true" /> Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Card frame overlay: dim outside the rect cutout */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="relative"
                style={{
                  width: 'min(86vw, 460px)',
                  aspectRatio: `${CARD_ASPECT}`,
                  // 100vmax (not 9999px) — huge spreads exceed iOS Safari's
                  // GPU texture limit and render as a glitched solid fill.
                  boxShadow: '0 0 0 100vmax rgba(10,10,10,0.72)',
                  borderRadius: 14,
                }}
              >
                {/* Animated corner brackets */}
                {[
                  'top-0 left-0 border-t-4 border-l-4 rounded-tl-xl',
                  'top-0 right-0 border-t-4 border-r-4 rounded-tr-xl',
                  'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl',
                  'bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl',
                ].map((cls) => (
                  <motion.div
                    key={cls}
                    className={`absolute w-9 h-9 ${cls}`}
                    animate={{ borderColor: progress > 0 ? '#DC2626' : ['#DC2626', '#FFFFFF', '#DC2626'] }}
                    transition={progress > 0 ? { duration: 0.2 } : { duration: 1.6, repeat: Infinity }}
                  />
                ))}
                {/* Scanning laser line */}
                {!S.current.captured && <div className="vkyc-laser" aria-hidden="true" />}
                {/* Stability progress bar */}
                <div className="absolute -bottom-4 left-2 right-2 h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-[#DC2626] rounded-full"
                    style={{ width: `${progress * 100}%`, transition: 'width 0.15s linear' }}
                  />
                </div>
              </div>
            </div>

            {/* Header pill */}
            <div className="absolute top-5 left-0 right-0 flex flex-col items-center gap-1.5 pointer-events-none px-4">
              <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#0A0A0A]/80 border border-white/20 backdrop-blur">
                <CreditCard size={18} className="text-[#DC2626]" aria-hidden="true" />
                <span className="text-sm font-semibold text-white">Scan the FRONT of your ID</span>
              </div>
              <span className="text-[11px] font-medium tracking-wide text-white/70 bg-[#0A0A0A]/60 px-3 py-1 rounded-full backdrop-blur">
                Aadhaar · PAN · Voter ID · Passport · Driving Licence
              </span>
            </div>

            {/* Guidance + controls */}
            <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3 px-6">
              {!camReady && (
                <span className="flex items-center gap-2 text-sm text-white/80">
                  <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Starting camera…
                </span>
              )}
              <p
                aria-live="polite"
                className="vkyc-heading text-lg font-semibold text-white text-center text-balance drop-shadow-md"
              >
                {hint}
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={switchCamera}
                  disabled={switching}
                  className="min-h-[44px] px-4 rounded-xl border border-white/25 text-white/85 text-sm font-medium inline-flex items-center gap-2 bg-[#0A0A0A]/60 backdrop-blur disabled:opacity-50"
                >
                  <SwitchCamera size={16} aria-hidden="true" />
                  {facing === 'environment' ? 'Front camera' : 'Rear camera'}
                </button>
                {showManual && camReady && (
                  <button
                    onClick={capture}
                    className="min-h-[44px] px-5 rounded-xl bg-[#DC2626] text-white text-sm font-semibold inline-flex items-center gap-2"
                  >
                    <Camera size={16} aria-hidden="true" /> Capture now
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {flash && <div className="vkyc-flash absolute inset-0 bg-white z-20" aria-hidden="true" />}
      </div>
    </div>
  );
}
