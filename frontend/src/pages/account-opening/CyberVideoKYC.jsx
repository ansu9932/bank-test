import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/api';
import {
  Camera, Mic, ShieldCheck, CheckCircle2, AlertTriangle,
  ArrowRight, ScanLine, SwitchCamera, RefreshCw, Loader2, Lock,
  Cpu, Wifi, Check, CreditCard, Zap, Power, Layers, Sun, FileCheck,
} from 'lucide-react';
import ExpiredLinkPage from '../../components/ExpiredLinkPage';

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · VIDEO KYC (manual-click edition)
   A 3-phase identity-verification wizard (state machine).
   Theme: deep-black #0d0e12, crimson-red accents, glassmorphism panels.
   Flow: Secure Link → Selfie Capture (manual shutter) → ID Capture (rear cam)
   ────────────────────────────────────────────────────────────────────────── */

// ─── Crimson / black brand palette ────────────────────────────────────────────
const RED = {
  base:  '#dc2626', // red-600
  bright:'#ef4444', // red-500
  deep:  '#991b1b', // red-800
  soft:  '#f87171', // red-400
  black: '#0d0e12',
  panel: '#15161c',
};

// ─── Step metadata ────────────────────────────────────────────────────────────
const STEPS = [
  { id: 0, label: 'Secure Link',   icon: Power },
  { id: 1, label: 'Selfie Capture', icon: Camera },
  { id: 2, label: 'ID Capture',    icon: CreditCard },
];
const TOTAL_PHASES = STEPS.length; // 3

// ─── Identity-verification guidelines (shown before the ID capture phase) ─────
const ID_GUIDELINES = [
  { icon: Layers,   text: 'Keep the ID card completely flat within the visual guidelines.' },
  { icon: Sun,      text: 'Avoid heavy overhead lamp glares or flash artifacts.' },
  { icon: FileCheck, text: 'Accepted credentials: Passport, Driver\'s License, National Identity / Aadhaar Cards.' },
];

// ─── Helper: convert a base64 data URL → Blob (for multipart upload) ──────────
function dataURLToBlob(dataURL) {
  const [header, base64] = String(dataURL).split(',');
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const binary = atob(base64 || '');
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ─── Helper: turn a getUserMedia DOMException into an ACTIONABLE message ──────
// Android's #1 camera-KYC failure: the per-SITE camera permission in the
// browser is set to "Block". That makes getUserMedia throw NotAllowedError
// instantly WITHOUT re-prompting — and enabling the OS-level (Settings → Apps →
// Chrome → Camera) permission does NOT fix it, because the site-level block is
// separate. So we must tell the user exactly how to clear the site block.
function describeCameraError(err) {
  const name = err && err.name ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera is blocked for this site. Tap the lock 🔒 (or ⓘ) icon next to the address bar → Permissions → Camera → Allow, then reload this page. Note: enabling the camera in your phone\'s Settings is not enough — the browser blocks it separately for each website.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'No usable camera was found on this device. Please try a device with a working camera.';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'Your camera is busy or in use by another app. Close other camera apps and browser tabs, then tap Retry.';
    default:
      return 'Unable to access the camera. Please check your browser\'s camera permission for this site (tap the 🔒 icon → Permissions → Camera → Allow) and tap Retry.';
  }
}


// ─── Crimson grid background ──────────────────────────────────────────────────
function GridBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Perspective grid (crimson lines) */}
      <div
        className="absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(220,38,38,0.4) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(220,38,38,0.4) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, #000 35%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, #000 35%, transparent 80%)',
        }}
      />
      {/* Ambient crimson glows */}
      <div
        className="absolute -top-40 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full blur-[140px]"
        style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.20), transparent 70%)' }}
      />
      <div
        className="absolute bottom-0 right-0 w-[480px] h-[480px] rounded-full blur-[130px]"
        style={{ background: 'radial-gradient(circle, rgba(153,27,27,0.18), transparent 70%)' }}
      />
      {/* Scan sweep */}
      <motion.div
        className="absolute left-0 right-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(239,68,68,0.55), transparent)' }}
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}


// ─── Top step indicator (crimson nodes + connector) ──────────────────────────
function StepIndicator({ current }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 mb-8">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = s.icon;
        const accent = done || active ? RED.bright : 'rgba(255,255,255,0.12)';
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                animate={{
                  borderColor: accent,
                  boxShadow: active ? `0 0 18px ${RED.bright}aa` : done ? `0 0 12px ${RED.base}66` : '0 0 0 transparent',
                }}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex items-center justify-center bg-white/[0.03] backdrop-blur-md"
              >
                {done
                  ? <Check size={16} style={{ color: RED.bright }} />
                  : <Icon size={16} style={{ color: active ? RED.bright : '#5b5b66' }} />}
              </motion.div>
              <span
                className="text-[9px] sm:text-[10px] font-medium tracking-wider uppercase hidden sm:block"
                style={{ color: active || done ? RED.soft : '#55555f' }}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-5 sm:w-10 h-px relative top-[-9px]">
                <div className="absolute inset-0 bg-white/10 rounded-full" />
                <motion.div
                  className="absolute inset-0 rounded-full origin-left"
                  initial={false}
                  animate={{ scaleX: done ? 1 : 0 }}
                  transition={{ duration: 0.4 }}
                  style={{ background: RED.bright, boxShadow: `0 0 8px ${RED.bright}` }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}


// ─── Hardware status pill ─────────────────────────────────────────────────────
function HardwareRow({ icon: Icon, label, state }) {
  // state: 'pending' | 'ok' | 'fail'
  const color = state === 'ok' ? RED.bright : state === 'fail' ? RED.deep : '#6b6b75';
  const text  = state === 'ok' ? 'ONLINE' : state === 'fail' ? 'BLOCKED' : 'PENDING';
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center border"
          style={{ borderColor: `${color}55`, background: `${color}14` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-sm text-white/80 font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {state === 'pending' && (
          <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
        )}
        <span className="text-[11px] font-mono font-bold tracking-widest"
          style={{ color, textShadow: `0 0 10px ${color}99` }}>{text}</span>
      </div>
    </div>
  );
}

// ─── STEP 1 · Camera permission & secure-link initialization ─────────────────
function Step1Setup({ stream, hw, initializing, error, onInitialize, onNext }) {
  return (
    <motion.div key="step1"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-md mx-auto">
      <div className="text-center mb-6">
        <motion.div
          animate={{ boxShadow: [`0 0 24px ${RED.base}55`, `0 0 40px ${RED.bright}88`, `0 0 24px ${RED.base}55`] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="w-16 h-16 mx-auto rounded-2xl border border-red-500/40 bg-white/[0.04] flex items-center justify-center mb-4">
          <Cpu size={28} style={{ color: RED.bright }} />
        </motion.div>
        <h2 className="text-xl font-bold text-white tracking-tight">System Initialization</h2>
        <p className="text-sm text-white/50 mt-1">
          Hardware diagnostics required before establishing the secure biometric link.
        </p>
      </div>

      <div className="space-y-3 mb-5">
        <HardwareRow icon={Camera} label="Optical Camera Sensor" state={hw.camera} />
        <HardwareRow icon={Mic} label="Audio Input Array" state={hw.mic} />
        <HardwareRow icon={Wifi} label="Encrypted Channel" state={hw.channel} />
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 rounded-xl border text-sm"
          style={{ borderColor: `${RED.bright}55`, background: `${RED.bright}12`, color: RED.soft }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {!stream ? (
        <button onClick={onInitialize} disabled={initializing}
          className="group relative w-full py-4 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white overflow-hidden disabled:opacity-60"
          style={{ background: `linear-gradient(135deg, ${RED.base}, ${RED.deep})`, boxShadow: `0 0 30px ${RED.base}66` }}>
          <span className="relative z-10 flex items-center justify-center gap-2">
            {initializing
              ? <><Loader2 size={16} className="animate-spin" /> Establishing Link…</>
              : error
                ? <><RefreshCw size={16} /> Retry Camera Access</>
                : <><Power size={16} /> Initialize Secure Link</>}
          </span>
        </button>
      ) : (
        <button onClick={onNext}
          className="w-full py-4 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${RED.bright}, ${RED.base})`, boxShadow: `0 0 30px ${RED.bright}66` }}>
          <CheckCircle2 size={16} /> Link Active · Proceed
        </button>
      )}
    </motion.div>
  );
}


// ─── STEP 2 · Selfie capture — explicit manual shutter ───────────────────────
// Pure WebRTC front-camera feed inside a circular framed wrapper. A single
// prominent crimson "Capture Selfie" button snapshots the current frame, stores
// it as a base64 asset string, and advances the wizard — no automated tracking,
// centering, bounding boxes, or capture timers.
function SelfieCaptureStep({ stream, onCapture }) {
  const videoRef = useRef(null);
  const snapCanvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  // Bind the shared front-camera stream to the <video> element.
  useEffect(() => {
    const v = videoRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    }
  }, [stream]);

  const captureSelfie = useCallback(() => {
    const v = videoRef.current, c = snapCanvasRef.current;
    if (!v || !c || !v.videoWidth) {
      toast.error('Camera is still warming up — please wait a moment.');
      return;
    }
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    // Un-mirror the front-camera frame so the stored selfie reads naturally.
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const dataURL = c.toDataURL('image/png'); // secure asset string
    onCapture(dataURL);
  }, [onCapture]);

  return (
    <motion.div key="step2"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-md mx-auto flex flex-col items-center">
      <h2 className="text-xl font-bold text-white tracking-tight mb-1 text-center">Selfie Verification</h2>
      <p className="text-sm text-white/50 mb-6 text-center">
        Center your face within the frame, then tap <span style={{ color: RED.soft }}>Capture Selfie</span> when ready.
      </p>

      {/* Circular WebRTC camera feed wrapper */}
      <div className="relative w-72 h-72 sm:w-80 sm:h-80 mb-7">
        <div className="absolute inset-0 rounded-full border-2 border-dashed"
          style={{ borderColor: `${RED.deep}66` }} />
        <div className="absolute inset-2 rounded-full border-4 overflow-hidden bg-black"
          style={{ borderColor: RED.bright, boxShadow: `0 0 38px ${RED.bright}66, inset 0 0 30px ${RED.deep}55` }}>
          <video ref={videoRef} autoPlay={true} muted={true} playsInline={true}
            onLoadedMetadata={() => setReady(true)}
            className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        </div>
        {/* Static framing ticks */}
        {[0, 90, 180, 270].map((deg) => (
          <div key={deg} className="absolute inset-0" style={{ transform: `rotate(${deg}deg)` }}>
            <div className="absolute top-[-6px] left-1/2 -translate-x-1/2 w-1 h-4 rounded-full"
              style={{ background: RED.bright, boxShadow: `0 0 8px ${RED.bright}` }} />
          </div>
        ))}
      </div>

      {/* Prominent crimson manual shutter */}
      <button onClick={captureSelfie} disabled={!ready}
        className="w-full py-4 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white flex items-center justify-center gap-2 disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${RED.bright}, ${RED.deep})`, boxShadow: `0 0 30px ${RED.base}66` }}>
        <Camera size={18} /> Capture Selfie
      </button>

      <p className="text-[11px] font-mono text-white/35 mt-4 tracking-widest">
        {ready ? 'LIVE FEED · MANUAL CAPTURE' : 'ENGAGING CAMERA…'}
      </p>

      <canvas ref={snapCanvasRef} className="hidden" />
    </motion.div>
  );
}


// ─── Identity Verification Guidelines panel (gate before ID capture) ──────────
function GuidelinesPanel({ onProceed }) {
  return (
    <motion.div key="guidelines"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-lg mx-auto">
      <div className="text-center mb-6">
        <motion.div
          animate={{ boxShadow: [`0 0 22px ${RED.base}55`, `0 0 38px ${RED.bright}88`, `0 0 22px ${RED.base}55`] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="w-16 h-16 mx-auto rounded-2xl border border-red-500/40 bg-white/[0.04] flex items-center justify-center mb-4">
          <CreditCard size={26} style={{ color: RED.bright }} />
        </motion.div>
        <h2 className="text-xl font-bold text-white tracking-tight">Identity Verification Guidelines</h2>
        <p className="text-sm text-white/50 mt-1">
          Review the capture rules below to ensure your document is accepted on the first scan.
        </p>
      </div>

      {/* Micro-cards */}
      <div className="space-y-3 mb-6">
        {ID_GUIDELINES.map(({ icon: Icon, text }, i) => (
          <motion.div key={i}
            initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.08 }}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl border border-white/10 bg-white/[0.03]">
            <div className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center border"
              style={{ borderColor: `${RED.bright}55`, background: `${RED.bright}14` }}>
              <Icon size={18} style={{ color: RED.bright }} />
            </div>
            <p className="text-sm text-white/80 leading-snug">{text}</p>
          </motion.div>
        ))}
      </div>

      {/* Broad crimson "Proceed to Scan" trigger (activates rear camera) */}
      <button onClick={onProceed}
        className="w-full py-4 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white flex items-center justify-center gap-2"
        style={{ background: `linear-gradient(135deg, ${RED.bright}, ${RED.deep})`, boxShadow: `0 0 30px ${RED.base}66` }}>
        <ScanLine size={18} /> Proceed to Scan
      </button>
    </motion.div>
  );
}


// ─── STEP 3 · ID document capture — guidelines gate + manual rear-cam shutter ─
function DocumentCaptureStep({ onConfirm, processing }) {
  const liveVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const mountedRef = useRef(true);

  const [scanning, setScanning] = useState(false);     // false = guidelines, true = camera
  const [captured, setCaptured] = useState(null);
  const [camError, setCamError] = useState('');
  const [camReady, setCamReady] = useState(false);
  const [facing, setFacing] = useState('environment'); // 'environment' (rear) | 'user' (front)
  const [switching, setSwitching] = useState(false);

  // Stop ALL active tracks before opening a new stream → prevents the browser
  // camera lock / black-frame glitch when switching devices.
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Acquire a camera for the requested facing mode (exact → loose → any).
  const acquire = useCallback(async (mode) => {
    stopStream();
    setCamReady(false);
    setCamError('');

    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (mountedRef.current) {
        setCamError('Camera unavailable here. Please open this link in Chrome or Safari over a secure (https) connection.');
      }
      return;
    }

    const attempts = [
      { video: { facingMode: { exact: mode } }, audio: false },
      { video: { facingMode: mode }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr = null;
    for (const constraints of attempts) {
      try {
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        if (!mountedRef.current) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = s;
          const p = liveVideoRef.current.play(); if (p && p.catch) p.catch(() => {});
        }
        setCamReady(true);
        return;
      } catch (e) {
        lastErr = e;
        // A hard permission block won't be cured by a looser constraint — stop
        // retrying and report the actionable fix immediately.
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break;
      }
    }
    if (mountedRef.current) setCamError(describeCameraError(lastErr));
  }, [stopStream]);

  // Release everything on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopStream();
    };
  }, [stopStream]);

  // "Proceed to Scan" → engage the REAR device camera.
  const proceedToScan = useCallback(async () => {
    setScanning(true);
    await acquire('environment');
  }, [acquire]);

  // Flip front ⇄ rear — stops the old track first, then opens the new one.
  const flipCamera = useCallback(async () => {
    if (switching || captured) return;
    setSwitching(true);
    const nextFacing = facing === 'environment' ? 'user' : 'environment';
    setFacing(nextFacing);
    await acquire(nextFacing);
    setSwitching(false);
  }, [switching, captured, facing, acquire]);

  // Manual shutter — snapshot the current frame (no auto-capture timer).
  const capture = useCallback(() => {
    const v = liveVideoRef.current, c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext('2d');
    // Un-mirror front-camera captures so the saved still reads correctly.
    if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, c.width, c.height);
    setCaptured(c.toDataURL('image/png'));
    stopStream();
  }, [facing, stopStream]);

  const retake = () => {
    setCaptured(null);
    acquire(facing);
  };

  // ── Gate: show the guidelines panel until the user proceeds ────────────────
  if (!scanning) {
    return <GuidelinesPanel onProceed={proceedToScan} />;
  }

  return (
    <motion.div key="step3"
      initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="w-full max-w-lg mx-auto">
      <h2 className="text-xl font-bold text-white tracking-tight mb-1 text-center">Document Capture</h2>
      <p className="text-sm text-white/50 mb-5 text-center">
        Rear camera engaged. Align your ID inside the frame, then tap the shutter to capture.
      </p>

      <div className="relative w-full rounded-2xl overflow-hidden border bg-black"
        style={{ aspectRatio: '1.586 / 1', borderColor: `${RED.bright}55`, boxShadow: `0 0 30px ${RED.base}33` }}>
        {!captured ? (
          <>
            {/* Front cam is mirrored; rear cam is not */}
            <video ref={liveVideoRef} autoPlay={true} muted={true} playsInline={true}
              className="w-full h-full object-cover"
              style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
            <motion.div className="absolute left-0 right-0 h-[3px]"
              style={{ background: `linear-gradient(90deg, transparent, ${RED.bright}, transparent)`, boxShadow: `0 0 16px ${RED.bright}` }}
              animate={{ top: ['4%', '96%', '4%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
            {['top-3 left-3 border-t-2 border-l-2', 'top-3 right-3 border-t-2 border-r-2',
              'bottom-3 left-3 border-b-2 border-l-2', 'bottom-3 right-3 border-b-2 border-r-2'].map((c, i) => (
              <div key={i} className={`absolute w-7 h-7 ${c}`} style={{ borderColor: RED.bright }} />
            ))}

            {/* Flip-camera toggle (crimson, overlaid top-right) */}
            <button onClick={flipCamera} disabled={switching || !camReady}
              aria-label="Flip camera"
              className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-all disabled:opacity-50"
              style={{ background: `${RED.base}cc`, border: `1px solid ${RED.bright}`, color: '#fff', boxShadow: `0 0 16px ${RED.base}88`, backdropFilter: 'blur(4px)' }}>
              {switching
                ? <Loader2 size={13} className="animate-spin" />
                : <SwitchCamera size={13} />}
              Flip
            </button>

            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full"
              style={{ background: `${RED.bright}1c`, border: `1px solid ${RED.bright}66` }}>
              <ScanLine size={13} style={{ color: RED.bright }} />
              <span className="text-[10px] font-mono tracking-widest" style={{ color: RED.bright }}>
                {!camReady ? 'ENGAGING CAMERA…' : facing === 'environment' ? 'REAR CAM · READY' : 'FRONT CAM · READY'}
              </span>
            </div>
          </>
        ) : (
          <motion.img initial={{ opacity: 0, scale: 1.04 }} animate={{ opacity: 1, scale: 1 }}
            src={captured} alt="Captured ID document" className="w-full h-full object-cover" />
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {camError && (
        <div className="mt-4">
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border text-sm"
            style={{ borderColor: `${RED.bright}55`, background: `${RED.bright}12`, color: RED.soft }}>
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> <span>{camError}</span>
          </div>
          <button onClick={() => acquire(facing)}
            className="w-full mt-3 py-3 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(135deg, ${RED.base}, ${RED.deep})`, boxShadow: `0 0 24px ${RED.base}55` }}>
            <RefreshCw size={16} /> Retry Camera
          </button>
        </div>
      )}

      {!captured ? (
        <div className="flex flex-col items-center mt-5">
          <button onClick={capture} disabled={!camReady}
            className="w-full py-4 rounded-2xl font-semibold text-sm tracking-widest uppercase text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${RED.bright}, ${RED.deep})`, boxShadow: `0 0 30px ${RED.base}66` }}
            aria-label="Capture ID">
            <Camera size={18} /> Capture ID
          </button>
        </div>
      ) : (
        <div className="flex gap-3 mt-5">
          <button onClick={retake} disabled={processing}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase flex items-center justify-center gap-2 border text-white/80 disabled:opacity-40"
            style={{ borderColor: 'rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.04)' }}>
            <RefreshCw size={16} /> Retake Photo
          </button>
          <button onClick={() => onConfirm(captured)} disabled={processing}
            className="flex-1 py-3.5 rounded-2xl font-semibold text-sm tracking-wide uppercase flex items-center justify-center gap-2 text-white disabled:opacity-70"
            style={{ background: `linear-gradient(135deg, ${RED.bright}, ${RED.deep})`, boxShadow: `0 0 26px ${RED.base}66` }}>
            {processing
              ? <><Loader2 size={16} className="animate-spin" /> Processing…</>
              : <><ShieldCheck size={16} /> Confirm &amp; Process</>}
          </button>
        </div>
      )}
    </motion.div>
  );
}


// ─── Completion screen ───────────────────────────────────────────────────────
function CompleteScreen({ production = false, onContinue }) {
  return (
    <motion.div key="done"
      initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md mx-auto text-center">
      <motion.div
        animate={{ boxShadow: [`0 0 30px ${RED.base}66`, `0 0 60px ${RED.bright}aa`, `0 0 30px ${RED.base}66`] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-24 h-24 mx-auto rounded-full border-2 flex items-center justify-center mb-6"
        style={{ borderColor: RED.bright, background: `${RED.bright}14` }}>
        <ShieldCheck size={48} style={{ color: RED.bright }} />
      </motion.div>
      <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Verification Complete</h2>
      <p className="text-sm text-white/55 mb-6">
        Your selfie and identity document were captured and queued for final review.
      </p>
      <div className="grid grid-cols-2 gap-2.5 text-left">
        {['Secure Link', 'Selfie Capture', 'ID Capture', 'Encryption', 'Sealed', 'Submitted'].map((label) => (
          <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03]">
            <CheckCircle2 size={14} style={{ color: RED.bright }} />
            <span className="text-xs text-white/70">{label}</span>
          </div>
        ))}
      </div>

      {production && (
        <div className="mt-6">
          <p className="text-xs text-white/45 mb-3 flex items-center justify-center gap-1.5">
            <Loader2 size={13} className="animate-spin" style={{ color: RED.bright }} />
            We'll email you once an officer approves your account. Redirecting to sign-in…
          </p>
          <button onClick={onContinue}
            className="w-full py-3 rounded-2xl font-semibold text-sm tracking-wide uppercase text-white flex items-center justify-center gap-2"
            style={{ background: `linear-gradient(135deg, ${RED.bright}, ${RED.deep})`, boxShadow: `0 0 24px ${RED.base}66` }}>
            <ArrowRight size={16} /> Continue to Sign-In
          </button>
        </div>
      )}
    </motion.div>
  );
}


// ─── Verifying-link splash (token interceptor in flight) ─────────────────────
function VerifyingSplash() {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden text-white"
      style={{ background: RED.black }}>
      <GridBackground />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <Loader2 size={34} className="animate-spin" style={{ color: RED.bright }} />
        <p className="text-sm font-mono tracking-widest text-white/60 uppercase">Validating Secure Link…</p>
      </div>
    </div>
  );
}


// ─── Helper: detect in-app / embedded browsers where the camera is blocked ───
// Email apps (Gmail/Outlook), Facebook, Instagram, etc. open links inside an
// embedded WebView where getUserMedia is frequently blocked or unsupported —
// the #1 reason "Start Video KYC" appears broken. We detect this so we can tell
// the user to reopen the link in a real browser (Chrome/Safari).
function isInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|WhatsApp|MicroMessenger|; wv\)|GSA\//i.test(ua);
}


// ─── MAIN ORCHESTRATOR · 3-phase state machine ───────────────────────────────
export default function CyberVideoKYC() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const isProduction = Boolean(token);
  const DONE_STEP = TOTAL_PHASES; // index 3 = completion screen

  // Interceptor link validation: 'checking' | 'valid' | 'expired'.
  // Demo mode (no token) is always 'valid'.
  const [linkState, setLinkState] = useState(token ? 'checking' : 'valid');

  const [step, setStep] = useState(0);
  const [stream, setStream] = useState(null);          // shared FRONT stream (selfie capture)
  const [selfie, setSelfie] = useState(null);          // captured selfie asset string
  const [initializing, setInitializing] = useState(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [hw, setHw] = useState({ camera: 'pending', mic: 'pending', channel: 'pending' });

  // In-app/embedded browser detection — used to warn the user (camera is often
  // blocked in email/app WebViews) and let them copy the link to a real browser.
  const inApp = isInAppBrowser();
  const [linkCopied, setLinkCopied] = useState(false);
  const copyKycLink = useCallback(() => {
    try {
      navigator.clipboard?.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch { /* clipboard unavailable */ }
  }, []);

  const next = useCallback(() => setStep((s) => Math.min(s + 1, DONE_STEP)), [DONE_STEP]);

  const stopStream = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const goToLanding = useCallback(() => navigate('/login', { replace: true }), [navigate]);

  // ── Interceptor: validate the onboarding token BEFORE the wizard begins. ───
  // An expired/invalid Video KYC link terminates entry immediately and renders
  // the professional expired-link error page.
  useEffect(() => {
    if (!token) { setLinkState('valid'); return undefined; }
    let active = true;
    api.get(`/account/verify-video-kyc/${token}`)
      .then(() => { if (active) setLinkState('valid'); })
      .catch(() => { if (active) setLinkState('expired'); });
    return () => { active = false; };
  }, [token]);

  // Auto-redirect after sealing the session (production only).
  useEffect(() => {
    if (step === DONE_STEP && isProduction) {
      const t = setTimeout(goToLanding, 6000);
      return () => clearTimeout(t);
    }
  }, [step, DONE_STEP, isProduction, goToLanding]);

  // Store the captured selfie asset string, then advance the step cleanly.
  const handleSelfieCapture = useCallback((dataURL) => {
    if (!dataURL) { toast.error('Selfie capture failed. Please try again.'); return; }
    setSelfie(dataURL);
    toast.success('Selfie captured.');
    next();
  }, [next]);

  // Final submit: ID snapshot → blob → authorized multipart POST.
  const submitKYC = useCallback(async (dataURL) => {
    if (!dataURL) { toast.error('No capture found. Please retake the photo.'); return; }
    setProcessing(true);
    try {
      const blob = dataURLToBlob(dataURL);
      const file = new File([blob], `video-kyc-${Date.now()}.png`, { type: blob.type });
      const form = new FormData();
      form.append('document', file);
      if (token) form.append('token', token);
      // Attach the earlier selfie capture as a secondary biometric asset.
      if (selfie) {
        const selfieFile = new File([dataURLToBlob(selfie)], `selfie-${Date.now()}.png`, { type: 'image/png' });
        form.append('selfie', selfieFile);
      }

      const { data } = await api.post('/account/kyc/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const stored = data?.data?.stored;
      stopStream();

      if (data?.success && (stored || !isProduction)) {
        toast.success('Identity verification submitted successfully.');
        next();
      } else if (isProduction && stored === false) {
        toast.error('Your verification link has expired. Please request a new one.');
        setLinkState('expired');
      } else {
        toast('Submitted, finalizing your session…', { icon: '⚙️' });
        next();
      }
    } catch (err) {
      const msg = err?.response?.data?.message || 'Upload could not be confirmed.';
      toast.error(`${msg} Completing onboarding in safe mode.`);
      stopStream();
      next();
    } finally {
      setProcessing(false);
    }
  }, [token, isProduction, stopStream, next, selfie]);

  // Request the FRONT camera for the selfie phase.
  // Mobile fix: acquire VIDEO ONLY with a graceful `ideal` facingMode so that a
  // missing or blocked microphone can never reject the whole stream and leave
  // the preview stuck on a black "ENGAGING CAMERA…" frame. The microphone is
  // probed separately and is purely optional (not required for photo-based KYC).
  const initialize = useCallback(async () => {
    setError('');
    setInitializing(true);
    setHw({ camera: 'pending', mic: 'pending', channel: 'pending' });

    // Secure-context guard. getUserMedia only works over HTTPS (or localhost);
    // on http:// Android Chrome throws and the wizard would dead-end.
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHw({ camera: 'fail', mic: 'fail', channel: 'fail' });
      setError('Camera unavailable here. Please open this link in Chrome or Safari over a secure (https) connection.');
      setInitializing(false);
      return;
    }

    // Try the front camera, then fall back to ANY camera so a device that
    // can't satisfy the facing-mode hint still yields a working stream instead
    // of failing outright.
    const attempts = [
      { video: { facingMode: { ideal: 'user' } }, audio: false },
      { video: true, audio: false },
    ];

    let media = null;
    let lastErr = null;
    for (const constraints of attempts) {
      try {
        media = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (e) {
        lastErr = e;
        // A hard block/secure error won't be cured by looser constraints.
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break;
      }
    }

    if (media) {
      setStream(media);
      const hasVideo = media.getVideoTracks().length > 0;
      setTimeout(() => setHw((h) => ({ ...h, camera: hasVideo ? 'ok' : 'fail' })), 400);
      setTimeout(() => setHw((h) => ({ ...h, channel: 'ok' })), 1400);

      // Optional, non-blocking microphone probe — drives the diagnostic
      // indicator only. Audio is not required for capture, so a denied or
      // absent mic still resolves the indicator without blocking the flow.
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((mic) => {
          mic.getTracks().forEach((t) => t.stop());
          setHw((h) => ({ ...h, mic: 'ok' }));
        })
        .catch(() => setHw((h) => ({ ...h, mic: 'ok' })));

      setInitializing(false);
      return;
    }

    // All attempts failed — classify the error into an actionable instruction.
    setHw({ camera: 'fail', mic: 'fail', channel: 'fail' });
    setError(describeCameraError(lastErr));
    setInitializing(false);
  }, []);

  // Proactive permission probe (Android Chrome supports the Permissions API;
  // iOS Safari does not — the query simply throws and we ignore it). If the
  // site-level camera permission is already "denied", surface the fix-it
  // instructions immediately so the user isn't left guessing why the prompt
  // never appears.
  useEffect(() => {
    if (!navigator.permissions || !navigator.permissions.query) return;
    let active = true;
    navigator.permissions.query({ name: 'camera' })
      .then((status) => {
        if (active && status && status.state === 'denied') {
          setError(describeCameraError({ name: 'NotAllowedError' }));
        }
      })
      .catch(() => { /* Permissions API / 'camera' name unsupported — ignore. */ });
    return () => { active = false; };
  }, []);

  // Release the front stream on unmount.
  useEffect(() => () => { stream?.getTracks().forEach((t) => t.stop()); }, [stream]);

  // ── Interceptor render gates ───────────────────────────────────────────────
  if (linkState === 'checking') return <VerifyingSplash />;
  if (linkState === 'expired') return <ExpiredLinkPage type="video-kyc" />;

  return (
    <div className="relative min-h-screen w-full overflow-hidden text-white" style={{ background: RED.black }}>
      <GridBackground />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* In-app browser warning — camera is blocked inside email/app WebViews */}
        {inApp && (
          <div className="px-4 py-3 text-center text-[13px] leading-snug" style={{ background: RED.deep, color: '#fff' }}>
            ⚠️ Your camera may be blocked here. Please open this page in <strong>Chrome</strong> or <strong>Safari</strong> (not inside the email/app).
            <button onClick={copyKycLink} className="ml-2 underline font-semibold whitespace-nowrap">
              {linkCopied ? '✓ Link copied' : 'Copy link'}
            </button>
          </div>
        )}

        {/* Header */}
        <header className="flex items-center justify-between px-5 sm:px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border border-red-500/40 bg-white/[0.04]"
              style={{ boxShadow: `0 0 18px ${RED.base}55` }}>
              <Lock size={18} style={{ color: RED.bright }} />
            </div>
            <div>
              <p className="font-bold tracking-tight leading-none">ALISTER<span style={{ color: RED.bright }}> KYC</span></p>
              <p className="text-[10px] tracking-[0.3em] text-white/40 uppercase mt-0.5">Cyber Identity Engine</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03]">
            <Zap size={12} style={{ color: RED.bright }} />
            <span className="text-[10px] font-mono tracking-widest text-white/60">AES-256 · SECURE SESSION</span>
          </div>
        </header>

        {/* Main panel */}
        <main className="flex-1 flex items-center justify-center px-4 sm:px-6 pb-10">
          <div className="w-full max-w-2xl">
            <StepIndicator current={step} />
            <div className="rounded-3xl border border-white/10 p-6 sm:p-9"
              style={{ background: 'rgba(21,22,28,0.65)', backdropFilter: 'blur(12px)', boxShadow: '0 30px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <Step1Setup stream={stream} hw={hw} initializing={initializing} error={error}
                    onInitialize={initialize} onNext={next} />
                )}
                {step === 1 && <SelfieCaptureStep stream={stream} onCapture={handleSelfieCapture} />}
                {step === 2 && <DocumentCaptureStep onConfirm={submitKYC} processing={processing} />}
                {step === DONE_STEP && <CompleteScreen production={isProduction} onContinue={goToLanding} />}
              </AnimatePresence>
            </div>

            <p className="text-center text-[10px] font-mono tracking-[0.3em] text-white/30 mt-6 uppercase">
              {step < DONE_STEP ? `Phase ${step + 1} of ${TOTAL_PHASES}` : 'Session Sealed'} · Alister Bank Biometric Protocol
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
