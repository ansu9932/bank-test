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

/* ── OCR image preprocessing ─────────────────────────────────── */

/**
 * Prepare a captured ID photo for OCR: upscale to ~1800px wide,
 * grayscale, and stretch contrast between the 2nd–98th luminance
 * percentiles. Dramatically improves Tesseract accuracy on phone
 * captures with shadows / low contrast.
 */
export async function preprocessIdImage(dataURL) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = dataURL;
  });
  const scale = Math.max(1, Math.min(2.5, 1800 / (img.width || 1)));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const { data } = imgData;
  const total = w * h;
  const gray = new Float32Array(total);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[p] = g;
    hist[g | 0] += 1;
  }
  let lo = 0;
  let hi = 255;
  let acc = 0;
  for (let v = 0; v < 256; v += 1) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
  acc = 0;
  for (let v = 255; v >= 0; v -= 1) { acc += hist[v]; if (acc >= total * 0.02) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const v = Math.max(0, Math.min(255, ((gray[p] - lo) / range) * 255));
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
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
