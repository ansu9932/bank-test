import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Eye, Loader2, ScanFace,
} from 'lucide-react';
import {
  faceBox, faceWidthRatio, poseFromLandmarks, poseFromMatrix,
  faceSignature, signatureDistance, frameLuminance,
} from './faceMath';

/* ── Tunables ────────────────────────────────────────────────── */
const HOLD_MS = 1000;          // stable hold before positioning passes
const CHALLENGE_HOLD_MS = 350; // pose must be held to count
const CHALLENGE_TIMEOUT = 10000;
const CHALLENGE_COUNT = 2;     // random subset — enough for liveness, less user effort
const CENTER_TOLERANCE = 0.16; // face center vs circle center (normalized)
const MIN_WIDTH = 0.19;        // face width / frame width
const MAX_WIDTH = 0.62;
const MIN_LUMA = 45;           // average luminance floor
const YAW_RATIO = 0.12;        // geometry yaw threshold (gentler turn passes)
const PITCH_UP = 0.46;         // nose above this ratio = looking up
const PITCH_DOWN = 0.63;       // below = looking down
const BLINK_CLOSE = 0.5;
const BLINK_OPEN = 0.25;
const SWAP_THRESHOLD = 0.28;   // face-signature distance = different person

const CHALLENGES = {
  left: { label: 'Turn your head LEFT', icon: ArrowLeft },
  right: { label: 'Turn your head RIGHT', icon: ArrowRight },
  up: { label: 'Look UP', icon: ArrowUp },
  down: { label: 'Look DOWN', icon: ArrowDown },
};

// Random subset + order per session (defeats replay recordings) while
// keeping the flow short and easy for the user.
function shuffledChallenges() {
  const keys = Object.keys(CHALLENGES);
  for (let i = keys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys.slice(0, CHALLENGE_COUNT);
}

function getBlend(categories, name) {
  const c = categories?.find((x) => x.categoryName === name);
  return c ? c.score : 0;
}

/**
 * Steps 1–3 of the vKYC flow on a single camera surface:
 *  positioning (circle guide) → randomized liveness challenges →
 *  blink detection → 3-2-1 countdown → auto selfie capture.
 */
export default function FaceScanStep({ stream, landmarkerRef, lmStatus, onSelfie, onStage }) {
  const videoRef = useRef(null);
  const lumaCanvasRef = useRef(document.createElement('canvas'));
  const snapCanvasRef = useRef(document.createElement('canvas'));

  const [phase, setPhase] = useState('positioning'); // positioning | liveness | blink | countdown
  const [guidance, setGuidance] = useState('Position your face inside the circle');
  const [ringProgress, setRingProgress] = useState(0); // 0..1
  const [ringState, setRingState] = useState('fail');  // fail | adjusting | ok
  const [challengeKey, setChallengeKey] = useState(null);
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeTotal, setChallengeTotal] = useState(4);
  const [count, setCount] = useState(3);
  const [flash, setFlash] = useState(false);

  // Mutable loop state (avoids re-renders inside rAF)
  const S = useRef({
    phase: 'positioning',
    holdStart: 0,
    challenges: [],
    ci: 0,
    challengeStart: 0,
    poseHoldStart: 0,
    blinkClosed: false,
    lastLumaCheck: 0,
    luma: 128,
    faceLostAt: 0,
    signature: null,
    lastSwapCheck: 0,
    countdownStart: 0,
    lastGuidance: '',
    slow: false,
    lenient: false,
    frame: 0,
    paused: false,
    captured: false,
  });

  const setPhaseBoth = useCallback((p) => {
    S.current.phase = p;
    setPhase(p);
    if (p === 'positioning') onStage(1);
    if (p === 'liveness') onStage(2);
    if (p === 'blink' || p === 'countdown') onStage(3);
  }, [onStage]);

  const say = useCallback((text) => {
    if (S.current.lastGuidance !== text) {
      S.current.lastGuidance = text;
      setGuidance(text);
    }
  }, []);

  const resetToPositioning = useCallback((message) => {
    S.current.holdStart = 0;
    S.current.poseHoldStart = 0;
    S.current.signature = null;
    setRingProgress(0);
    setPhaseBoth('positioning');
    if (message) say(message);
  }, [setPhaseBoth, say]);

  // Bind stream
  useEffect(() => {
    const v = videoRef.current;
    if (v && stream && v.srcObject !== stream) {
      v.srcObject = stream;
      const p = v.play();
      if (p?.catch) p.catch(() => {});
    }
  }, [stream]);

  // Pause on tab switch; resume with re-positioning (spec requirement).
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        S.current.paused = true;
      } else {
        S.current.paused = false;
        resetToPositioning('Welcome back — position your face in the circle');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [resetToPositioning]);

  const captureSelfie = useCallback(() => {
    const v = videoRef.current;
    const c = snapCanvasRef.current;
    if (!v || !v.videoWidth || S.current.captured) return;
    S.current.captured = true;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const dataURL = c.toDataURL('image/jpeg', 0.92);
    setFlash(true);
    setTimeout(() => {
      onSelfie(dataURL, S.current.signature);
    }, 350);
  }, [onSelfie]);

  /* ── Main detection loop ─────────────────────────────────── */
  useEffect(() => {
    if (lmStatus !== 'ready') return undefined;
    let raf = 0;
    let lastVideoTime = -1;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const st = S.current;
      const v = videoRef.current;
      const lm = landmarkerRef.current;
      if (st.paused || st.captured || !v || !lm || v.readyState < 2) return;
      if (v.currentTime === lastVideoTime) return;
      lastVideoTime = v.currentTime;

      // Slow-device fallback: halve detection FPS if inference is heavy.
      st.frame += 1;
      if (st.slow && st.frame % 2 === 1) return;

      const t0 = performance.now();
      let res;
      try {
        res = lm.detectForVideo(v, t0);
      } catch {
        return;
      }
      if (performance.now() - t0 > 90) st.slow = true;

      const now = performance.now();
      const faces = res.faceLandmarks || [];

      /* Countdown phase: just require the face to stay present. */
      if (st.phase === 'countdown') {
        if (faces.length !== 1) {
          resetToPositioning('Face lost — let’s re-center and try again');
          return;
        }
        const remaining = 3 - Math.floor((now - st.countdownStart) / 1000);
        if (remaining <= 0) captureSelfie();
        else setCount(remaining);
        return;
      }

      /* No face */
      if (faces.length === 0) {
        if (!st.faceLostAt) st.faceLostAt = now;
        setRingState('fail');
        say('Position your face inside the circle');
        // During liveness/blink a vanished face restarts liveness (anti-spoof).
        if (st.phase !== 'positioning' && now - st.faceLostAt > 1200) {
          resetToPositioning('Face left the frame — restarting checks');
        }
        st.holdStart = 0;
        setRingProgress(0);
        return;
      }

      /* Multiple faces — reject (security requirement). */
      if (faces.length > 1) {
        setRingState('fail');
        say('Only one face should be visible');
        if (st.phase !== 'positioning') resetToPositioning('Multiple faces detected — restarting checks');
        st.holdStart = 0;
        setRingProgress(0);
        return;
      }

      st.faceLostAt = 0;
      const landmarks = faces[0];
      const box = faceBox(landmarks);
      const width = faceWidthRatio(landmarks);

      // Lighting check (throttled to ~2/s)
      if (now - st.lastLumaCheck > 500) {
        st.lastLumaCheck = now;
        st.luma = frameLuminance(v, lumaCanvasRef.current);
      }

      // Face-swap detection between steps (compare landmark signatures).
      if (st.signature && now - st.lastSwapCheck > 1000) {
        st.lastSwapCheck = now;
        const dist = signatureDistance(st.signature, faceSignature(landmarks));
        if (dist > SWAP_THRESHOLD) {
          resetToPositioning('Face changed mid-session — restarting checks');
          return;
        }
      }

      /* ── POSITIONING ─────────────────────────────────────── */
      if (st.phase === 'positioning') {
        const offCenter = Math.hypot(box.cx - 0.5, box.cy - 0.5);
        let problem = '';
        if (st.luma < MIN_LUMA) problem = 'Find better lighting';
        else if (width < MIN_WIDTH) problem = 'Move closer';
        else if (width > MAX_WIDTH) problem = 'Move back';
        else if (offCenter > CENTER_TOLERANCE) problem = 'Center your face in the circle';

        if (problem) {
          setRingState('adjusting');
          say(problem);
          st.holdStart = 0;
          setRingProgress(0);
          return;
        }

        setRingState('ok');
        say('Perfect — hold still');
        if (!st.holdStart) st.holdStart = now;
        const progress = Math.min(1, (now - st.holdStart) / HOLD_MS);
        setRingProgress(progress);
        if (progress >= 1) {
          st.signature = faceSignature(landmarks);
          st.challenges = shuffledChallenges();
          st.ci = 0;
          st.challengeStart = now;
          st.poseHoldStart = 0;
          setChallengeTotal(st.challenges.length);
          setChallengeIndex(0);
          setChallengeKey(st.challenges[0]);
          setRingProgress(0);
          setPhaseBoth('liveness');
        }
        return;
      }

      /* ── LIVENESS CHALLENGES ─────────────────────────────── */
      if (st.phase === 'liveness') {
        const key = st.challenges[st.ci];
        const { yawRatio, pitchRatio } = poseFromLandmarks(landmarks);
        const matrixPose = poseFromMatrix(res.facialTransformationMatrixes?.[0]?.data);

        // If the user struggled past one timeout, soften thresholds ~30%
        // so a smaller head movement still counts (accessibility).
        const ease = st.lenient ? 0.7 : 1;
        const yawT = YAW_RATIO * ease;
        const upT = st.lenient ? PITCH_UP + 0.03 : PITCH_UP;
        const downT = st.lenient ? PITCH_DOWN - 0.03 : PITCH_DOWN;
        const matrixYaw = st.lenient ? 13 : 18;

        let passed = false;
        if (key === 'left') passed = yawRatio < -yawT || (matrixPose && matrixPose.yaw < -matrixYaw);
        if (key === 'right') passed = yawRatio > yawT || (matrixPose && matrixPose.yaw > matrixYaw);
        if (key === 'up') passed = pitchRatio < upT;
        if (key === 'down') passed = pitchRatio > downT;

        setRingState(passed ? 'ok' : 'adjusting');

        if (passed) {
          if (!st.poseHoldStart) st.poseHoldStart = now;
          if (now - st.poseHoldStart >= CHALLENGE_HOLD_MS) {
            st.ci += 1;
            st.poseHoldStart = 0;
            st.challengeStart = now;
            if (st.ci >= st.challenges.length) {
              st.blinkClosed = false;
              setPhaseBoth('blink');
              say('Now blink your eyes');
            } else {
              setChallengeIndex(st.ci);
              setChallengeKey(st.challenges[st.ci]);
            }
          }
        } else {
          st.poseHoldStart = 0;
          if (now - st.challengeStart > CHALLENGE_TIMEOUT) {
            st.challengeStart = now;
            st.lenient = true; // soften thresholds after a struggle
            say('Almost there — a small turn is enough, hold it briefly');
          } else {
            say(CHALLENGES[key].label);
          }
        }
        setRingProgress((st.ci + (passed ? 0.5 : 0)) / st.challenges.length);
        return;
      }

      /* ── BLINK ───────────────────────────────────────────── */
      if (st.phase === 'blink') {
        const cats = res.faceBlendshapes?.[0]?.categories;
        const l = getBlend(cats, 'eyeBlinkLeft');
        const r = getBlend(cats, 'eyeBlinkRight');
        setRingState('adjusting');
        say('Now blink your eyes');
        if (!st.blinkClosed && l > BLINK_CLOSE && r > BLINK_CLOSE) {
          st.blinkClosed = true;
        } else if (st.blinkClosed && l < BLINK_OPEN && r < BLINK_OPEN) {
          // Valid blink (closed then reopened) → countdown to auto-capture.
          st.countdownStart = now;
          setCount(3);
          setRingState('ok');
          say('Great! Hold still…');
          setPhaseBoth('countdown');
        }
      }
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [lmStatus, landmarkerRef, captureSelfie, resetToPositioning, say, setPhaseBoth]);

  /* ── Render ──────────────────────────────────────────────── */
  const circleColor =
    ringState === 'ok' ? '#DC2626' : ringState === 'adjusting' ? '#FFFFFF' : '#DC2626';
  const Challenge = challengeKey ? CHALLENGES[challengeKey] : null;

  return (
    <div className="relative w-full flex-1 flex flex-col items-center overflow-hidden">
      {/* Camera feed — mirrored preview for selfie steps only */}
      <div className="relative w-full flex-1 min-h-[320px] bg-[#0A0A0A] overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Dim everything outside the circular cutout */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="relative rounded-full"
            style={{
              width: 'min(72vw, 320px)',
              height: 'min(72vw, 320px)',
              // 100vmax (not 9999px) — huge spreads exceed iOS Safari's GPU
              // texture limit and render as a glitched solid disc.
              boxShadow: '0 0 0 100vmax rgba(10,10,10,0.72)',
            }}
          >
            {/* Animated ring: red on fail, pulsing red↔white while adjusting */}
            <motion.div
              className="absolute -inset-1 rounded-full border-4"
              animate={{
                borderColor:
                  ringState === 'adjusting'
                    ? ['#DC2626', '#FFFFFF', '#DC2626']
                    : circleColor,
              }}
              transition={
                ringState === 'adjusting'
                  ? { duration: 1.4, repeat: Infinity }
                  : { duration: 0.3 }
              }
            />
            {/* Progress ring (SVG stroke-dashoffset) */}
            <svg
              className="absolute -inset-3 w-[calc(100%+24px)] h-[calc(100%+24px)] -rotate-90"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
              <circle
                cx="50" cy="50" r="47" fill="none"
                stroke="#DC2626" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 47}
                strokeDashoffset={2 * Math.PI * 47 * (1 - ringProgress)}
                style={{ transition: 'stroke-dashoffset 0.2s linear' }}
              />
            </svg>

            {/* Countdown overlay */}
            <AnimatePresence>
              {phase === 'countdown' && (
                <motion.div
                  key={count}
                  initial={{ scale: 1.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <span className="vkyc-heading text-7xl font-bold text-white drop-shadow-lg">
                    {count}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Capture flash */}
        {flash && <div className="vkyc-flash absolute inset-0 bg-white z-20" aria-hidden="true" />}

        {/* Challenge icon (liveness) / blink icon */}
        <div className="absolute top-5 left-0 right-0 flex justify-center pointer-events-none">
          <AnimatePresence mode="wait">
            {phase === 'liveness' && Challenge && (
              <motion.div
                key={challengeKey}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#0A0A0A]/80 border border-white/20 backdrop-blur"
              >
                <motion.span
                  animate={{ x: challengeKey === 'left' ? [-4, 4, -4] : challengeKey === 'right' ? [4, -4, 4] : 0, y: challengeKey === 'up' ? [-4, 4, -4] : challengeKey === 'down' ? [4, -4, 4] : 0 }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  <Challenge.icon size={20} className="text-[#DC2626]" aria-hidden="true" />
                </motion.span>
                <span className="text-sm font-semibold text-white">
                  {challengeIndex + 1} / {challengeTotal}
                </span>
              </motion.div>
            )}
            {phase === 'blink' && (
              <motion.div
                key="blink"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#0A0A0A]/80 border border-white/20 backdrop-blur"
              >
                <motion.span animate={{ scaleY: [1, 0.1, 1] }} transition={{ duration: 1.6, repeat: Infinity }}>
                  <Eye size={20} className="text-[#DC2626]" aria-hidden="true" />
                </motion.span>
                <span className="text-sm font-semibold text-white">Blink now</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Live guidance — high contrast, announced to screen readers */}
        <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-2 px-6 pointer-events-none">
          {lmStatus === 'loading' && (
            <span className="flex items-center gap-2 text-sm text-white/80">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Loading face engine…
            </span>
          )}
          {lmStatus === 'error' && (
            <span role="alert" className="text-sm text-white bg-[#DC2626] px-4 py-2 rounded-lg text-center">
              Face engine failed to load. Check your connection and reload the page.
            </span>
          )}
          <p
            aria-live="polite"
            className="vkyc-heading text-lg sm:text-xl font-semibold text-white text-center text-balance drop-shadow-md"
          >
            {guidance}
          </p>
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/50">
            <ScanFace size={12} aria-hidden="true" /> On-device liveness check
          </span>
        </div>
      </div>
    </div>
  );
}
