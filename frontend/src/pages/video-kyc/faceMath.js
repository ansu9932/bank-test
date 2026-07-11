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

/* ── OCR parsing ─────────────────────────────────────────────── */

const NAME_STOPWORDS = /(government|govt|india|indian|bank|card|license|licence|permanent|account|income|department|authority|republic|identity|national|driving|union|federal|state|birth|male|female|address|issue|expiry|valid|validity|signature|father|mother|transport|blood|group|organ|donor|holder|number|element|minor|west|bengal|issued|date|first)/i;

/** Labels whose value is a RELATIVE's name, never the holder's. */
const RELATIVE_LABEL = /father|mother|husband|guardian|spouse|son\s*\/|daughter|wife/i;

const TITLE_CASE = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

function cleanNameValue(s) {
  return String(s || '')
    .replace(/[^A-Za-z .']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A plausible person name: 2-4 words, each ≥2 letters, no stopwords. */
function isPlausibleName(s) {
  if (!s || s.length < 5 || s.length > 40) return false;
  if (NAME_STOPWORDS.test(s)) return false;
  const words = s.split(' ').filter((w) => w.replace(/[.']/g, '').length >= 2);
  return words.length >= 2 && words.length <= 4;
}

/**
 * Extract DOB. Strategy: collect ALL dates in the text with their
 * surrounding context, then pick the one that is (a) explicitly
 * labelled as birth date, or (b) the only date giving a plausible
 * age (15–100 yrs). This stops the parser grabbing Issue Date /
 * Validity dates that appear FIRST on Indian driving licences.
 */
function extractDob(text) {
  const now = new Date();
  const candidates = [];
  const re = /(\d{2})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{4})|(\d{4})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{2})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let dd; let mm; let yyyy;
    if (m[1]) { dd = +m[1]; mm = +m[2]; yyyy = +m[3]; } else { yyyy = +m[4]; mm = +m[5]; dd = +m[6]; }
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900) continue;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const labelledBirth = /birth|dob|d\.o\.b|born|जन्म/i.test(before);
    const labelledOther = /issue|valid|expir|exp\b|first|renew|upto|till/i.test(before);
    const age = (now - new Date(yyyy, mm - 1, dd)) / (365.25 * 24 * 3600 * 1000);
    const plausibleAge = age >= 15 && age <= 100;
    let score = 0;
    if (labelledBirth) score += 10;
    if (labelledOther) score -= 8;
    if (plausibleAge) score += 5; else score -= 5;
    candidates.push({ dd, mm, yyyy, score });
  }
  if (!candidates.length) return '';
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best.score <= 0) return '';
  const p2 = (n) => String(n).padStart(2, '0');
  return `${p2(best.dd)}/${p2(best.mm)}/${best.yyyy}`;
}

/**
 * Extract the document number. Ordered by specificity so an Indian
 * driving licence number ("WB31 20250008761") wins over the bare
 * digit run inside it, and a PAN ("OHKPS4829C") wins over generic
 * alphanumeric noise.
 */
function extractIdNumber(text, dob) {
  // Remove all date strings so "10-02-2005" can never leak into a
  // generic digit-run match.
  const scrub = text
    .toUpperCase()
    .replace(/(\d{2})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{4})/g, ' ')
    .replace(/(\d{4})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{2})/g, ' ');
  const patterns = [
    /\b[A-Z]{2}[-\s]?\d{2}[-\s]?\d{10,13}\b/, // Indian DL: WB31 20250008761
    /\b[A-Z]{2}\d{13}\b/,                     // DL without space
    /\b[A-Z]{5}\d{4}[A-Z]\b/,                 // PAN: OHKPS4829C
    /\b\d{4}\s\d{4}\s\d{4}\b/,                // Aadhaar: 1234 5678 9012
    /\b[A-Z]{3}\d{7}\b/,                      // Voter ID: ABC1234567
    /\b[A-Z]\d{7}\b/,                         // Passport: A1234567
    /\b\d{9,16}\b/,                           // generic long digit run
  ];
  for (const p of patterns) {
    const m = scrub.match(p);
    if (m && m[0] !== dob) return m[0].replace(/\s+/g, ' ').replace(/-/g, ' ').trim();
  }
  return '';
}

/**
 * Extract the holder's name. Prefers explicit "Name:" labels (same
 * line or the following line), skips relative labels like
 * "Son/Daughter/Wife of" and "Father's Name", then falls back to an
 * uppercase-heavy plausible-name line heuristic.
 */
function extractName(lines) {
  // Pass 1: labelled name
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/name/i.test(line) || RELATIVE_LABEL.test(line)) continue;
    // Value on the same line: "Name: ANSUMAN SAHOO"
    const same = line.match(/name\s*[:\-—]?\s*(.+)$/i);
    let candidate = same && same[1] ? cleanNameValue(same[1]) : '';
    if (isPlausibleName(candidate)) return TITLE_CASE(candidate);
    // Value on the next line (PAN layout: "नाम / Name" then the name)
    for (let j = i + 1; j <= i + 2 && j < lines.length; j += 1) {
      if (RELATIVE_LABEL.test(lines[j]) || /name/i.test(lines[j])) break;
      candidate = cleanNameValue(lines[j]);
      if (isPlausibleName(candidate)) return TITLE_CASE(candidate);
    }
  }
  // Pass 2: best uppercase-heavy candidate line
  let best = '';
  let bestScore = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const prev = i > 0 ? lines[i - 1] : '';
    if (RELATIVE_LABEL.test(prev)) continue; // value under "Father's Name"
    const raw = lines[i];
    if (/\d/.test(raw)) continue;
    const cleaned = cleanNameValue(raw);
    if (!isPlausibleName(cleaned)) continue;
    const letters = cleaned.replace(/[^A-Za-z]/g, '');
    const upperRatio = letters.length ? (cleaned.match(/[A-Z]/g) || []).length / letters.length : 0;
    // ID names are printed in ALL CAPS — heavily favour those lines.
    const score = upperRatio * 10 + (raw === raw.toUpperCase() ? 3 : 0);
    if (score > bestScore) { bestScore = score; best = cleaned; }
  }
  return best ? TITLE_CASE(best) : '';
}

/** Parse OCR text into { fullName, dob, idNumber }. */
export function parseIdText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const dob = extractDob(text);
  const idNumber = extractIdNumber(text, dob);
  const fullName = extractName(lines);
  return { fullName, dob, idNumber };
}

/** Merge two parse results — `primary` wins per field. */
export function mergeParsedId(primary, secondary) {
  return {
    fullName: primary.fullName || secondary.fullName || '',
    dob: primary.dob || secondary.dob || '',
    idNumber: primary.idNumber || secondary.idNumber || '',
  };
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
