/* ────────────────────────────────────────────────────────────────
   Pure math / vision helpers for the Alister Bank vKYC flow.
   All biometric processing stays ON-DEVICE — nothing here talks
   to a network. NOTE: production must pair these client checks
   with server-side verification (image forensics, doc authenticity,
   selfie↔ID face match). Client checks alone cannot stop
   sophisticated presentation attacks.
   ──────────────────────────────────────────────────────────────── */

// Landmark indices (MediaPipe 478-point face mesh)
const NOSE_TIP = 1;
const FOREHEAD = 10;
const CHIN = 152;
const LEFT_EDGE = 234;   // image-left face edge
const RIGHT_EDGE = 454;  // image-right face edge
const LEFT_EYE_OUT = 33;
const RIGHT_EYE_OUT = 263;

/** Bounding box + center of a landmark set (normalized 0..1). */
export function faceBox(landmarks) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: maxX - minX,
    h: maxY - minY,
  };
}

/**
 * Head yaw/pitch in degrees from the facial transformation matrix
 * (column-major 4x4). Positive yaw = user turned to THEIR left
 * (nose toward image-right in the un-mirrored frame).
 */
export function poseFromMatrix(m) {
  if (!m || m.length < 16) return null;
  const r20 = m[2];
  const r21 = m[6];
  const r22 = m[10];
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r20))) * (180 / Math.PI);
  const pitch = Math.atan2(r21, r22) * (180 / Math.PI);
  return { yaw: -yaw, pitch };
}

/**
 * Geometry fallback for head pose (deterministic, mirror-safe since
 * it works on raw landmark coordinates).
 * yawRatio  > 0 → user turned to THEIR left; < 0 → their right.
 * pitchRatio: nose position between forehead(0) and chin(1);
 * neutral ≈ 0.55, look-up smaller, look-down larger.
 */
export function poseFromLandmarks(lm) {
  const nose = lm[NOSE_TIP];
  const left = lm[LEFT_EDGE];
  const right = lm[RIGHT_EDGE];
  const forehead = lm[FOREHEAD];
  const chin = lm[CHIN];
  const spanX = right.x - left.x || 1e-6;
  const spanY = chin.y - forehead.y || 1e-6;
  return {
    yawRatio: (nose.x - left.x) / spanX - 0.5,
    pitchRatio: (nose.y - forehead.y) / spanY,
  };
}

/** Face width relative to frame width (uses cheek-to-cheek span). */
export function faceWidthRatio(lm) {
  return Math.abs(lm[RIGHT_EDGE].x - lm[LEFT_EDGE].x);
}

/**
 * Lightweight face "signature" — scale-invariant ratios used to
 * detect a face swap between steps (same session, different person).
 */
export function faceSignature(lm) {
  const span = Math.hypot(
    lm[RIGHT_EDGE].x - lm[LEFT_EDGE].x,
    lm[RIGHT_EDGE].y - lm[LEFT_EDGE].y
  ) || 1e-6;
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y) / span;
  return [
    d(LEFT_EYE_OUT, RIGHT_EYE_OUT),
    d(NOSE_TIP, CHIN),
    d(FOREHEAD, NOSE_TIP),
    d(LEFT_EYE_OUT, NOSE_TIP),
    d(RIGHT_EYE_OUT, NOSE_TIP),
  ];
}

/** Distance between two signatures. > ~0.22 suggests a different face. */
export function signatureDistance(a, b) {
  if (!a || !b) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

/** Average luminance (0..255) of a video frame, sampled small. */
export function frameLuminance(video, canvas, size = 64) {
  if (!video.videoWidth) return 0;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4);
}

/**
 * Sharpness metric — variance of a 4-neighbour Laplacian over a
 * grayscale downsample of the ROI. Low variance = blurry.
 */
export function laplacianVariance(imageData) {
  const { data, width: w, height: h } = imageData;
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap;
      sum2 += lap * lap;
      n += 1;
    }
  }
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/** Mean absolute pixel difference between two same-size ImageData. */
export function frameDiff(a, b) {
  if (!a || !b || a.data.length !== b.data.length) return 255;
  let sum = 0;
  const step = 16; // sample every 4th pixel
  for (let i = 0; i < a.data.length; i += step) {
    sum += Math.abs(a.data[i] - b.data[i]);
  }
  return sum / (a.data.length / step);
}

/* ── OCR parsing ─────────────────────────────────────────────── */

const NAME_STOPWORDS = /(government|india|bank|card|license|licence|permanent|account|income|department|authority|republic|identity|national|driving|union|federal|state|birth|male|female|address|issue|expiry|valid|signature|father|mother)/i;

/** Parse OCR text into { fullName, dob, idNumber }. */
export function parseIdText(rawText) {
  const text = String(rawText || '');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // DOB — DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY or YYYY-MM-DD
  let dob = '';
  const dmy = text.match(/\b(\d{2})[/\-.](\d{2})[/\-.](\d{4})\b/);
  const ymd = text.match(/\b(\d{4})[/\-.](\d{2})[/\-.](\d{2})\b/);
  if (dmy) dob = `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  else if (ymd) dob = `${ymd[3]}/${ymd[2]}/${ymd[1]}`;

  // ID number — Aadhaar-style groups, PAN-style alnum, or long digit runs
  let idNumber = '';
  const candidates = [
    text.match(/\b\d{4}\s\d{4}\s\d{4}\b/),          // Aadhaar
    text.match(/\b[A-Z]{3,5}\d{4}[A-Z]?\b/),         // PAN-like
    text.match(/\b[A-Z]{1,3}[- ]?\d{6,}\b/),         // DL / passport-like
    text.match(/\b\d{8,}\b/),                        // generic long number
  ];
  for (const m of candidates) {
    if (m && m[0] !== dob) { idNumber = m[0].trim(); break; }
  }

  // Name — first line of 2-4 alphabetic words, no digits, no stopwords
  let fullName = '';
  for (const line of lines) {
    if (/\d/.test(line)) continue;
    if (NAME_STOPWORDS.test(line)) continue;
    const words = line.split(/\s+/).filter((w) => /^[A-Za-z.']{2,}$/.test(w));
    if (words.length >= 2 && words.length <= 4) {
      fullName = words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      break;
    }
  }

  return { fullName, dob, idNumber };
}

/* ── Field validation ────────────────────────────────────────── */

export function validateName(v) {
  if (!v || v.trim().length < 3) return 'Enter your full name.';
  if (!/^[A-Za-z][A-Za-z .']{2,60}$/.test(v.trim())) return 'Letters, spaces and periods only.';
  return '';
}

export function validateDob(v) {
  const m = String(v || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return 'Use DD/MM/YYYY format.';
  const [, dd, mm, yyyy] = m.map(Number);
  const date = new Date(yyyy, mm - 1, dd);
  if (date.getDate() !== dd || date.getMonth() !== mm - 1) return 'Enter a valid date.';
  const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < 18) return 'You must be at least 18 years old.';
  if (age > 120) return 'Enter a valid date of birth.';
  return '';
}

export function validateIdNumber(v) {
  const t = String(v || '').trim();
  if (t.length < 4) return 'ID number looks too short.';
  if (!/^[A-Za-z0-9 /-]{4,24}$/.test(t)) return 'Letters, digits, spaces and dashes only.';
  return '';
}
