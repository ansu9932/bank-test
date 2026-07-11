import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Loader2, ShieldCheck, ScanText, Camera, ArrowRight, Lock } from 'lucide-react';
import api from '../../services/api';
import ExpiredLinkPage from '../../components/ExpiredLinkPage';
import useFaceLandmarker from './useFaceLandmarker';
import { preprocessIdImage, binarizeIdImage } from './faceMath';
import { parseIndianId, mergeParsedId } from './idParser';
import StepProgress from './StepProgress';
import ConsentScreen from './ConsentScreen';
import FaceScanStep from './FaceScanStep';
import IDScanStep from './IDScanStep';
import ReviewStep from './ReviewStep';
import SuccessScreen from './SuccessScreen';
import './vkyc.css';

/* ────────────────────────────────────────────────────────────────
   ALISTER BANK · VIDEO KYC (fully on-device biometric flow)
   consent → face positioning → liveness → blink + auto selfie →
   ID scan + OCR → review/edit → submit → success.

   SECURITY NOTE: all liveness/OCR checks here run client-side.
   Production MUST pair this with server-side verification (image
   forensics, document authenticity, selfie↔ID face match) — client
   checks alone cannot stop sophisticated presentation attacks.
   ──────────────────────────────────────────────────────────────── */

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // wipe captures after 5 min idle

// Camera phases render on dark surfaces; the rest are white.
const DARK_PHASES = new Set(['face', 'id-scan']);

// Map flow phase → StepProgress index (face sub-stages update it live).
const PHASE_STEP = {
  consent: 0,
  face: 1,
  'selfie-review': 3,
  'id-scan': 4,
  extracting: 4,
  review: 5,
  done: 6,
};

function describeCameraError(err) {
  const name = err?.name || '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera is blocked for this site. Tap the lock (or info) icon next to the address bar → Permissions → Camera → Allow, then reload. Enabling the camera in phone Settings alone is not enough — browsers block it per website.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'No usable camera was found on this device. Please try a device with a working camera.';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'Your camera is busy or in use by another app. Close other camera apps and tabs, then retry.';
    default:
      return 'Unable to access the camera. Check this site\u2019s camera permission (lock icon → Permissions → Camera → Allow), then retry.';
  }
}

// Email/social in-app WebViews frequently block getUserMedia.
function isInAppBrowser() {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|WhatsApp|MicroMessenger|; wv\)|GSA\//i.test(navigator.userAgent || '');
}

function dataURLToBlob(dataURL) {
  const [header, base64] = String(dataURL).split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default function VideoKYC() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const isProduction = Boolean(token);

  const [linkState, setLinkState] = useState(token ? 'checking' : 'valid');
  const [phase, setPhase] = useState('consent');
  const [stepIndex, setStepIndex] = useState(0);
  const [camError, setCamError] = useState('');
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ocrEmpty, setOcrEmpty] = useState(false);

  // Captured biometrics live ONLY in memory (never localStorage).
  const [selfie, setSelfie] = useState(null);
  const [idPhoto, setIdPhoto] = useState(null);
  const [details, setDetails] = useState({ fullName: '', dob: '', idNumber: '' });
  const [idType, setIdType] = useState('unknown');
  const [idTypeLabel, setIdTypeLabel] = useState('');

  const streamRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const { landmarkerRef, status: lmStatus } = useFaceLandmarker(phase === 'face' || phase === 'consent');

  const inApp = isInAppBrowser();
  const [linkCopied, setLinkCopied] = useState(false);

  const goPhase = useCallback((p) => {
    setPhase(p);
    if (PHASE_STEP[p] !== undefined) setStepIndex(PHASE_STEP[p]);
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const wipeSession = useCallback((message) => {
    stopStream();
    setSelfie(null);
    setIdPhoto(null);
    setDetails({ fullName: '', dob: '', idNumber: '' });
    setIdType('unknown');
    setIdTypeLabel('');
    setOcrEmpty(false);
    goPhase('consent');
    if (message) toast(message);
  }, [stopStream, goPhase]);

  /* Token interceptor — validate the secure link before the wizard. */
  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    api.get(`/account/verify-video-kyc/${token}`)
      .then(() => { if (active) setLinkState('valid'); })
      .catch(() => { if (active) setLinkState('expired'); });
    return () => { active = false; };
  }, [token]);

  /* Session inactivity timeout — wipe all captured data (security). */
  useEffect(() => {
    if (phase === 'consent' || phase === 'done') return undefined;
    const bump = () => { lastActivityRef.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump));
    const id = setInterval(() => {
      if (Date.now() - lastActivityRef.current > SESSION_TIMEOUT_MS) {
        wipeSession('Session timed out — your captured data was wiped for security.');
      }
    }, 15000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(id);
    };
  }, [phase, wipeSession]);

  /* Stop camera + wipe on unmount. */
  useEffect(() => () => stopStream(), [stopStream]);

  /* Camera pings keep the activity clock fresh during hands-free steps. */
  useEffect(() => { lastActivityRef.current = Date.now(); }, [phase]);

  /* ── Step 0 → 1: consent + camera permission ─────────────── */
  const startVerification = useCallback(async () => {
    setCamError('');
    // HTTPS-only guard: camera requires a secure context.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCamError('This flow requires a secure (https) connection. Open the link in Chrome or Safari over https.');
      return;
    }
    setStarting(true);
    const attempts = [
      { video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
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
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') break;
      }
    }
    setStarting(false);
    if (!media) {
      setCamError(describeCameraError(lastErr));
      return;
    }
    streamRef.current = media;
    goPhase('face');
  }, [goPhase]);

  /* ── Step 3: selfie captured ─────────────────────────────── */
  const handleSelfie = useCallback((dataURL) => {
    setSelfie(dataURL);
    goPhase('selfie-review');
  }, [goPhase]);

  const retakeSelfie = useCallback(async () => {
    setSelfie(null);
    if (!streamRef.current || !streamRef.current.active) {
      try {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' } }, audio: false,
        });
      } catch (e) {
        setCamError(describeCameraError(e));
        goPhase('consent');
        return;
      }
    }
    goPhase('face');
  }, [goPhase]);

  /* ── Step 4: ID captured → OCR ───────────────────────────── */
  const handleIdCaptured = useCallback(async (dataURL) => {
    setIdPhoto(dataURL);
    stopStream(); // front stream no longer needed
    goPhase('extracting');
    try {
      // Tesseract is lazy-loaded only when the ID step is reached.
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });

      // Build the image variants (each pass reads text the others miss):
      //   1. grayscale + contrast-stretched (best on shadows/low contrast)
      //   2. Otsu-binarized pure B/W (best on printed labels + numbers)
      //   3. raw capture (best when preprocessing over-corrects)
      const variants = [];
      try { variants.push(await preprocessIdImage(dataURL)); } catch { /* skip */ }
      try { variants.push(await binarizeIdImage(dataURL)); } catch { /* skip */ }
      variants.push(dataURL);

      // Auto-detects which of the 5 Indian IDs (Aadhaar / PAN / Voter /
      // Passport / DL) was scanned and parses per that document's layout.
      // Each pass fills in fields the previous passes missed; stops early
      // once name + DOB + ID number are all extracted.
      let parsed = { idType: 'unknown', fullName: '', dob: '', idNumber: '' };
      for (const image of variants) {
        try {
          const pass = await worker.recognize(image);
          parsed = mergeParsedId(parsed, parseIndianId(pass?.data?.text));
        } catch { /* keep previous results */ }
        if (parsed.fullName && parsed.dob && parsed.idNumber && parsed.idType !== 'unknown') break;
      }
      await worker.terminate();

      const empty = !parsed.fullName && !parsed.dob && !parsed.idNumber;
      setOcrEmpty(empty);
      setIdType(parsed.idType);
      setIdTypeLabel(parsed.idType !== 'unknown' ? parsed.idTypeLabel : '');
      setDetails((d) => ({
        fullName: parsed.fullName || d.fullName,
        dob: parsed.dob || d.dob,
        idNumber: parsed.idNumber || d.idNumber,
      }));
    } catch {
      setOcrEmpty(true);
    }
    goPhase('review');
  }, [goPhase, stopStream]);

  const rescanId = useCallback(() => {
    setIdPhoto(null);
    goPhase('id-scan');
  }, [goPhase]);

  /* ── Step 5 → 6: submit to backend ───────────────────────── */
  const submitKYC = useCallback(async () => {
    if (!idPhoto || !selfie) {
      toast.error('Missing captures — please retake.');
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('document', new File([dataURLToBlob(idPhoto)], `video-kyc-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      form.append('selfie', new File([dataURLToBlob(selfie)], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      if (token) form.append('token', token);
      form.append('details', JSON.stringify({ ...details, idType, idTypeLabel }));

      const { data } = await api.post('/account/kyc/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const stored = data?.data?.stored;
      if (data?.success && (stored || !isProduction)) {
        toast.success('Identity verification submitted.');
        goPhase('done');
      } else if (isProduction && stored === false) {
        toast.error('Your verification link has expired. Please request a new one.');
        setLinkState('expired');
      } else {
        goPhase('done');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || 'Upload could not be confirmed.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }, [idPhoto, selfie, token, details, isProduction, goPhase]);

  const finish = useCallback(() => navigate('/login', { replace: true }), [navigate]);

  const copyKycLink = useCallback(() => {
    try {
      navigator.clipboard?.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch { /* clipboard unavailable */ }
  }, []);

  /* ── Render gates ────────────────────────────────────────── */
  if (linkState === 'checking') {
    return (
      <div className="vkyc vkyc-dark min-h-[100dvh] flex flex-col items-center justify-center gap-4">
        <Loader2 size={32} className="animate-spin text-[#DC2626]" aria-hidden="true" />
        <p className="text-sm tracking-widest uppercase text-white/60">Validating secure link…</p>
      </div>
    );
  }
  if (linkState === 'expired') return <ExpiredLinkPage type="video-kyc" />;

  const dark = DARK_PHASES.has(phase);

  return (
    <div
      className={`vkyc flex flex-col ${dark ? 'vkyc-dark h-[100dvh] overflow-hidden' : 'bg-white min-h-[100dvh]'}`}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {inApp && (
        <div className="px-4 py-3 text-center text-[13px] leading-snug bg-[#DC2626] text-white">
          Your camera may be blocked here. Open this page in <strong>Chrome</strong> or <strong>Safari</strong> (not inside the email/app).
          <button onClick={copyKycLink} className="ml-2 underline font-semibold whitespace-nowrap">
            {linkCopied ? 'Link copied' : 'Copy link'}
          </button>
        </div>
      )}

      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#DC2626] flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" aria-hidden="true" />
          </div>
          <p className={`vkyc-heading font-bold tracking-tight ${dark ? 'text-white' : 'text-[#0A0A0A]'}`}>
            Alister<span className="text-[#DC2626]"> vKYC</span>
          </p>
        </div>
        <span className={`hidden sm:flex items-center gap-1.5 text-[11px] font-medium ${dark ? 'text-white/50' : 'text-[#0A0A0A]/45'}`}>
          <Lock size={12} aria-hidden="true" /> On-device · Secure session
        </span>
      </header>

      {/* Step progress */}
      <div className="shrink-0 pb-3 sm:pb-4">
        <StepProgress current={stepIndex} dark={dark} />
      </div>

      {/* Main */}
      <main className="flex-1 min-h-0 flex flex-col">
        <AnimatePresence mode="wait">
          {phase === 'consent' && (
            <ConsentScreen key="consent" onStart={startVerification} starting={starting} error={camError} />
          )}

          {phase === 'face' && (
            <motion.div key="face" className="flex-1 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <FaceScanStep
                stream={streamRef.current}
                landmarkerRef={landmarkerRef}
                lmStatus={lmStatus}
                onSelfie={handleSelfie}
                onStage={setStepIndex}
              />
            </motion.div>
          )}

          {phase === 'selfie-review' && (
            <motion.div
              key="selfie-review"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-sm mx-auto px-4 text-center"
            >
              <h2 className="vkyc-heading text-2xl font-bold text-[#0A0A0A] mb-1">Selfie captured</h2>
              <p className="text-sm text-[#0A0A0A]/60 mb-5">Make sure your face is clear and well lit.</p>
              <div className="rounded-2xl overflow-hidden bg-[#F4F4F5] mb-5" onContextMenu={(e) => e.preventDefault()}>
                <img src={selfie || undefined} alt="Captured selfie preview" className="vkyc-protected w-full aspect-square object-cover" draggable={false} />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={retakeSelfie}
                  className="flex-1 min-h-[50px] rounded-xl border-2 border-[#0A0A0A]/15 text-[#0A0A0A] font-semibold text-sm flex items-center justify-center gap-2 hover:border-[#DC2626] hover:text-[#DC2626] transition-colors"
                >
                  <Camera size={16} aria-hidden="true" /> Retake
                </button>
                <button
                  onClick={() => goPhase('id-scan')}
                  className="flex-1 min-h-[50px] rounded-xl bg-[#DC2626] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  Continue <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          )}

          {phase === 'id-scan' && (
            <motion.div key="id-scan" className="flex-1 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <IDScanStep onCaptured={handleIdCaptured} />
            </motion.div>
          )}

          {phase === 'extracting' && (
            <motion.div
              key="extracting"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-4 px-6"
            >
              <div className="relative w-20 h-20 rounded-2xl bg-[#F4F4F5] flex items-center justify-center overflow-hidden">
                <ScanText size={32} className="text-[#DC2626]" aria-hidden="true" />
                <motion.div
                  className="absolute left-0 right-0 h-0.5 bg-[#DC2626]"
                  animate={{ top: ['15%', '85%', '15%'] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
              <p aria-live="polite" className="vkyc-heading text-lg font-semibold text-[#0A0A0A]">
                Extracting details…
              </p>
              <p className="text-sm text-[#0A0A0A]/55 text-center max-w-xs leading-relaxed">
                Reading your ID on-device with OCR. This takes a few seconds.
              </p>
            </motion.div>
          )}

          {phase === 'review' && (
            <ReviewStep
              key="review"
              selfie={selfie}
              idPhoto={idPhoto}
              details={details}
              idTypeLabel={idTypeLabel}
              onDetailsChange={setDetails}
              ocrEmpty={ocrEmpty}
              onRetakeSelfie={retakeSelfie}
              onRescanId={rescanId}
              onSubmit={submitKYC}
              submitting={submitting}
            />
          )}

          {phase === 'done' && <SuccessScreen key="done" details={details} onFinish={finish} />}
        </AnimatePresence>
      </main>

      <footer className={`shrink-0 text-center text-[10px] tracking-[0.25em] uppercase py-2.5 sm:py-4 px-4 ${dark ? 'text-white/30' : 'text-[#0A0A0A]/30'}`}>
        Alister Bank · Biometric data never leaves this device
      </footer>
    </div>
  );
}
