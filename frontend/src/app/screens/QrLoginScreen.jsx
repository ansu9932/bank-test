/**
 * Scan to Login — approve a NetBanking website login from the app.
 *
 * scan (camera + jsQR, strict payload validation)
 *   → confirm (browser / IP / time context — reject anything unfamiliar)
 *   → swipe ("Swipe to Login" slider)
 *   → mpin (final authorization factor; server enforces 5-try lockout)
 *   → done (the desktop signs in by itself within a second)
 *
 * Security note shown to users: approving signs the WEBSITE in; per the
 * one-session rule the app itself returns to the lock screen afterwards.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import {
  Globe2, MapPin, Clock3, ShieldCheck, ShieldAlert, ChevronsRight, CheckCircle2,
} from 'lucide-react';
import { Screen, AppHeader, Card, PrimaryButton, GhostButton, PinDots, NumberPad } from '../components/AppUI';
import {
  parseQrLoginPayload, qrScan, qrApprove, qrReject, getMpinLength, lockApp,
} from '../services/appAuth';

export default function QrLoginScreen() {
  const navigate = useNavigate();
  // step: scan | confirm | swipe | mpin | done
  const [step, setStep] = useState('scan');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null); // { qrId, context }

  // ── Camera scanner ─────────────────────────────────────────────────────────
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const handlingRef = useRef(false);
  const [cameraError, setCameraError] = useState('');

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const onDecoded = useCallback(async (raw) => {
    if (handlingRef.current) return;
    handlingRef.current = true;

    // Anti-quishing: refuse anything that isn't our exact payload shape,
    // without ever contacting the server.
    const qrId = parseQrLoginPayload(raw);
    if (!qrId) {
      setError('This is not an Alister Bank login code.');
      setTimeout(() => { setError(''); handlingRef.current = false; }, 2500);
      return;
    }

    try {
      setBusy(true);
      const res = await qrScan(raw);
      stopCamera();
      setSession(res);
      setStep('confirm');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not process this code.');
      setTimeout(() => { setError(''); handlingRef.current = false; }, 2500);
    } finally {
      setBusy(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    if (step !== 'scan') return undefined;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const tick = () => {
          if (cancelled || !streamRef.current) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA && !handlingRef.current) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code && code.data) onDecoded(code.data);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) {
          setCameraError('Camera unavailable. Allow camera access to scan the login code.');
        }
      }
    })();

    return () => { cancelled = true; stopCamera(); };
  }, [step, onDecoded, stopCamera]);

  // ── Swipe slider ───────────────────────────────────────────────────────────
  const trackRef = useRef(null);
  const [dragX, setDragX] = useState(0);
  const dragState = useRef({ active: false, startX: 0, max: 0 });

  const KNOB = 56;
  const startDrag = (clientX) => {
    const track = trackRef.current;
    if (!track) return;
    dragState.current = {
      active: true,
      startX: clientX - dragX,
      max: track.clientWidth - KNOB - 8,
    };
  };
  const moveDrag = (clientX) => {
    if (!dragState.current.active) return;
    const next = Math.max(0, Math.min(dragState.current.max, clientX - dragState.current.startX));
    setDragX(next);
  };
  const endDrag = () => {
    if (!dragState.current.active) return;
    dragState.current.active = false;
    if (dragX >= dragState.current.max * 0.92) {
      setDragX(dragState.current.max);
      setStep('mpin');
    } else {
      setDragX(0);
    }
  };

  // ── MPIN entry ─────────────────────────────────────────────────────────────
  const mpinLength = getMpinLength();
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (step !== 'mpin' || pin.length !== mpinLength || busy) return;
    (async () => {
      setBusy(true);
      setError('');
      try {
        await qrApprove(session.qrId, pin);
        setStep('done');
        // One-session rule: minting the web session signs the app session
        // out server-side. Send the app to its lock screen after a beat so
        // the user sees the success state first.
        setTimeout(() => { lockApp(); navigate('/app/lock', { replace: true }); }, 2600);
      } catch (err) {
        setPin('');
        setError(err.response?.data?.message || 'Could not approve the login.');
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, step]);

  const rejectAndExit = async () => {
    if (session?.qrId) await qrReject(session.qrId);
    navigate('/app/home', { replace: true });
  };

  const fmtWhen = (iso) => {
    try { return new Date(iso).toLocaleString(); } catch { return '—'; }
  };

  return (
    <Screen className="pb-10">
      <AppHeader title="Scan to Login" backTo="/app/home" />

      {/* ── Step: camera scan ── */}
      {step === 'scan' && (
        <div className="px-5 flex flex-col gap-4">
          <Card className="overflow-hidden p-0" style={{ aspectRatio: '1 / 1' }}>
            {cameraError ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
                <ShieldAlert size={40} style={{ color: 'var(--app-danger)' }} aria-hidden="true" />
                <p className="app-dim text-sm leading-relaxed">{cameraError}</p>
              </div>
            ) : (
              <div className="relative h-full">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
                {/* Viewfinder frame */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
                  <div className="w-3/5 aspect-square rounded-2xl border-2"
                    style={{ borderColor: 'var(--app-primary)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
                </div>
              </div>
            )}
          </Card>
          {error && <p className="text-sm text-center" style={{ color: 'var(--app-danger)' }} role="alert">{error}</p>}
          <p className="app-dim text-xs text-center text-pretty leading-relaxed">
            Point your camera at the QR code on the Alister Bank NetBanking
            login page. Only official Alister Bank codes are accepted.
          </p>
        </div>
      )}

      {/* ── Step: context confirmation ── */}
      {step === 'confirm' && session && (
        <div className="px-5 flex flex-col gap-4">
          <Card className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ background: 'color-mix(in srgb, var(--app-primary) 15%, transparent)' }}>
                <ShieldCheck size={20} style={{ color: 'var(--app-primary)' }} aria-hidden="true" />
              </span>
              <div>
                <h2 className="font-semibold text-sm">Website login request</h2>
                <p className="app-dim text-xs">Verify this is really you before approving.</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div className="flex items-start gap-3">
                <Globe2 size={16} className="app-dim mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="app-dim text-xs">Browser</p>
                  <p>{session.context?.browser || 'Unknown browser'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin size={16} className="app-dim mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="app-dim text-xs">IP address</p>
                  <p>{session.context?.ip || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock3 size={16} className="app-dim mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="app-dim text-xs">Requested</p>
                  <p>{fmtWhen(session.context?.requestedAt)}</p>
                </div>
              </div>
            </div>

            <p className="app-dim text-xs leading-relaxed text-pretty rounded-lg p-3"
              style={{ background: 'color-mix(in srgb, var(--app-danger) 8%, transparent)' }}>
              Don&apos;t recognize this? Reject it — nobody can sign in without
              your approval and MPIN.
            </p>
          </Card>

          <PrimaryButton onClick={() => setStep('swipe')}>This is me — continue</PrimaryButton>
          <GhostButton onClick={rejectAndExit}>Reject this login</GhostButton>
        </div>
      )}

      {/* ── Step: swipe to login ── */}
      {step === 'swipe' && (
        <div className="px-5 flex flex-col gap-6 mt-4">
          <p className="app-dim text-sm text-center text-pretty">
            Swipe the slider to continue to your MPIN.
          </p>

          <div
            ref={trackRef}
            className="relative h-16 rounded-full overflow-hidden select-none"
            style={{ background: 'color-mix(in srgb, var(--app-primary) 12%, var(--app-surface))', border: '1px solid var(--app-border)' }}
            role="slider" aria-label="Swipe to login" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round((dragX / Math.max(1, (trackRef.current?.clientWidth || 300) - KNOB - 8)) * 100)}
          >
            <p className="absolute inset-0 flex items-center justify-center text-sm font-medium app-dim pointer-events-none">
              Swipe to Login
            </p>
            <div
              className="absolute top-1 left-1 flex h-14 w-14 items-center justify-center rounded-full touch-none"
              style={{
                transform: `translateX(${dragX}px)`,
                background: 'linear-gradient(135deg, #cc0000, #8f0000)',
                transition: dragState.current.active ? 'none' : 'transform 0.25s ease',
                boxShadow: '0 4px 16px color-mix(in srgb, var(--app-primary) 45%, transparent)',
              }}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); startDrag(e.clientX); }}
              onPointerMove={(e) => moveDrag(e.clientX)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <ChevronsRight size={26} color="#ffffff" aria-hidden="true" />
            </div>
          </div>

          <GhostButton onClick={rejectAndExit}>Cancel</GhostButton>
        </div>
      )}

      {/* ── Step: MPIN ── */}
      {step === 'mpin' && (
        <div className="px-5 flex flex-col items-center gap-6 mt-4">
          <p className="app-dim text-sm text-center">Enter your MPIN to authorize the login.</p>
          <PinDots length={mpinLength} filled={pin.length} error={!!error} />
          {error && <p className="text-sm" style={{ color: 'var(--app-danger)' }} role="alert">{error}</p>}
          <NumberPad
            onDigit={(d) => { if (!busy && pin.length < mpinLength) setPin(pin + d); }}
            onDelete={() => setPin(pin.slice(0, -1))}
          />
          <GhostButton onClick={rejectAndExit}>Cancel</GhostButton>
        </div>
      )}

      {/* ── Step: done ── */}
      {step === 'done' && (
        <div className="px-5 flex flex-col items-center gap-4 mt-16 text-center">
          <CheckCircle2 size={64} style={{ color: 'var(--app-credit, #22c55e)' }} aria-hidden="true" />
          <h2 className="text-lg font-bold">Login approved</h2>
          <p className="app-dim text-sm text-pretty max-w-[280px] leading-relaxed">
            The website is signing you in now. For your security, the app will
            return to the lock screen — one active session at a time.
          </p>
        </div>
      )}
    </Screen>
  );
}
