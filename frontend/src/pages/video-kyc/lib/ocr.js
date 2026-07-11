/* ────────────────────────────────────────────────────────────────────────────
   ALISTER BANK vKYC · On-device OCR (Tesseract.js, lazy-loaded)
   Runs entirely in the browser. Extracts Name / DOB / ID number from the
   captured ID-card frame with defensive regex parsing.
   ──────────────────────────────────────────────────────────────────────────── */

/** Lazy-load tesseract.js and OCR the given image (data URL or canvas). */
export async function recognizeID(image) {
  const Tesseract = await import('tesseract.js');
  const { data } = await Tesseract.recognize(image, 'eng');
  return data?.text || '';
}

// ─── Field parsing ────────────────────────────────────────────────────────────

const DOB_PATTERNS = [
  // DD/MM/YYYY · DD-MM-YYYY · DD.MM.YYYY
  /\b(\d{2})[/\-.](\d{2})[/\-.](\d{4})\b/,
  // YYYY-MM-DD
  /\b(\d{4})[/\-.](\d{2})[/\-.](\d{2})\b/,
];

const NAME_STOPWORDS = /\b(government|india|united|states|republic|income|tax|department|permanent|account|number|card|identity|national|driving|licen[cs]e|passport|date|birth|dob|male|female|signature|father|mother|address|issue|expiry|valid)\b/i;

/** ID number candidates: PAN, Aadhaar, passport, generic alphanumeric IDs. */
const ID_PATTERNS = [
  /\b[A-Z]{5}\d{4}[A-Z]\b/,               // PAN (ABCDE1234F)
  /\b\d{4}\s?\d{4}\s?\d{4}\b/,            // Aadhaar (1234 5678 9012)
  /\b[A-Z]\d{7}\b/,                       // Passport (A1234567)
  /\b[A-Z]{2}\d{2}\s?\d{11}\b/,           // Driving licence (KA01 12345678901)
  /\b[A-Z0-9]{8,17}\b/,                   // Generic fallback
];

function cleanLine(line) {
  return line.replace(/[^A-Za-z\s.'-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Parse raw OCR text into { fullName, dob, idNumber } (best-effort). */
export function parseIDText(raw) {
  const text = String(raw || '');
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  // ── DOB ──
  let dob = '';
  for (const pattern of DOB_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      if (m[1].length === 4) {
        dob = `${m[3]}/${m[2]}/${m[1]}`; // YYYY-MM-DD → DD/MM/YYYY
      } else {
        dob = `${m[1]}/${m[2]}/${m[3]}`;
      }
      break;
    }
  }

  // ── ID number ──
  let idNumber = '';
  for (const pattern of ID_PATTERNS) {
    const m = text.toUpperCase().match(pattern);
    if (m) { idNumber = m[0].replace(/\s+/g, ' ').trim(); break; }
  }

  // ── Name: first plausible mostly-alphabetic line that isn't a header word ──
  let fullName = '';
  for (const line of lines) {
    const cleaned = cleanLine(line);
    const words = cleaned.split(' ').filter((w) => w.length > 1);
    if (
      words.length >= 2 &&
      words.length <= 5 &&
      cleaned.length >= 6 &&
      cleaned.length <= 40 &&
      !NAME_STOPWORDS.test(cleaned) &&
      /^[A-Za-z\s.'-]+$/.test(cleaned)
    ) {
      // Prefer uppercase-heavy lines (typical on ID cards)
      const upperRatio = (cleaned.match(/[A-Z]/g) || []).length / cleaned.replace(/\s/g, '').length;
      if (upperRatio > 0.5) { fullName = titleCase(cleaned); break; }
      if (!fullName) fullName = titleCase(cleaned);
    }
  }

  return { fullName, dob, idNumber };
}

function titleCase(s) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

// ─── Field validation (used by the review form) ───────────────────────────────

export function validateName(name) {
  const v = String(name || '').trim();
  if (v.length < 3) return 'Enter your full name (at least 3 characters).';
  if (!/^[A-Za-z\s.'-]+$/.test(v)) return 'Name can only contain letters, spaces, dots and hyphens.';
  return '';
}

export function validateDOB(dob) {
  const m = String(dob || '').trim().match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{4})$/);
  if (!m) return 'Use the format DD/MM/YYYY.';
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return 'That date does not exist.';
  }
  const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < 18) return 'You must be at least 18 years old.';
  if (age > 120) return 'Please check the year of birth.';
  return '';
}

export function validateIDNumber(id) {
  const v = String(id || '').trim();
  if (v.length < 6) return 'ID number looks too short.';
  if (!/^[A-Z0-9\s-]+$/i.test(v)) return 'ID number can only contain letters, digits and hyphens.';
  return '';
}

/** Sanitize free-text input before it is stored or submitted. */
export function sanitizeField(value) {
  return String(value || '').replace(/[<>"`;\\]/g, '').slice(0, 60).trim();
}
