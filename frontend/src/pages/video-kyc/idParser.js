/* ────────────────────────────────────────────────────────────────
   Indian ID document parser — detects WHICH of the 5 supported IDs
   was scanned (Aadhaar, PAN, Voter EPIC, Passport, Driving Licence)
   and extracts name / DOB / ID number using that document's known
   field layout. Built to survive real Tesseract noise:

   · Confusable-character repair (O↔0, I/L↔1, S↔5, B↔8, Z↔2, G↔6,
     Q↔0) applied per-field so a misread digit no longer kills the
     whole match.
   · Fuzzy labels — "DOB" also matches D0B/DO8/D08, "Name" also
     matches Narne/Nane/Namc etc.
   · Layout knowledge per document:
       Aadhaar   name = line ABOVE "DOB:", number = 12d (never VID)
       PAN       "Name" label (new) / line below number (old)
       Voter     "Elector's Name" label, EPIC = 3 letters + 7 digits
       Passport  MRZ first, then Surname / Given Name(s) labels
       DL        "Name:" label, DOB among Issue/Validity dates
   All processing is on-device.
   ──────────────────────────────────────────────────────────────── */

export const ID_TYPES = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  voter: 'Voter ID (EPIC)',
  passport: 'Passport',
  dl: 'Driving Licence',
  unknown: 'Government ID',
};

/* ── OCR confusable repair ───────────────────────────────────── */

// Letters commonly misread when the true glyph is a DIGIT.
const TO_DIGIT = {
  O: '0', Q: '0', D: '0', o: '0',
  I: '1', L: '1', l: '1', i: '1', '|': '1', '!': '1',
  Z: '2', z: '2',
  S: '5', s: '5',
  B: '8',
  G: '6',
  T: '7',
  A: '4',
};
// Digits commonly misread when the true glyph is a LETTER.
const TO_LETTER = {
  0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B',
};

const digitize = (s) => String(s || '').split('').map((c) => (/\d/.test(c) ? c : (TO_DIGIT[c] || c))).join('');
const letterize = (s) => String(s || '').toUpperCase().split('').map((c) => (/[A-Z]/.test(c) ? c : (TO_LETTER[c] || c))).join('');
const isDigits = (s) => /^\d+$/.test(s);
const isLetters = (s) => /^[A-Z]+$/.test(s);

const TITLE_CASE = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const P2 = (n) => String(n).padStart(2, '0');

/* ── Fuzzy label patterns (tolerate common OCR misreads) ─────── */

// DOB / D0B / DO8 / D08 / "Date of Birth" / जन्म / YOB
const DOB_LABEL = /\bD[O0Q][B83]\b|date\s*[o0]f\s*b[il1]rth|b[il1]rth|जन्म|\bY[O0]B\b|year\s*[o0]f\s*b[il1]rth/i;
// Name / Narne / Nane / Namc / Naame
const NAME_LABEL = /(?:^|[^A-Za-z])(?:n[a4][mrn][nec]?[ec]?|name)(?:[^A-Za-z]|$)/i;
const NOT_DOB = /issue|valid|expir|exp\b|first|renew|upto|till|doi\b|nt\s*val/i;

const NAME_STOPWORDS = /(government|govt|india|indian|bank|card|license|licence|permanent|account|income|tax|department|authority|republic|identity|national|driving|union|federal|state|birth|male|female|address|issue|expiry|valid|validity|signature|father|mother|husband|transport|blood|group|organ|donor|holder|number|element|minor|issued|date|first|election|commission|elector|surname|given|nationality|place|type|code|passport|aadhaar|unique|identification|enrol|download|help|www|gov|proof|citizenship|authent)/i;

const RELATIVE_LABEL = /father|mother|husband|guardian|spouse|son\s*\/|daughter|wife|s\s*\/\s*[dw]|[dw]\s*\/\s*o\b|s\/o|d\/o|w\/o/i;

function cleanName(s) {
  return String(s || '')
    .replace(/[^A-Za-z .']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlausibleName(s) {
  if (!s || s.length < 4 || s.length > 42) return false;
  if (NAME_STOPWORDS.test(s)) return false;
  const words = s.split(' ').filter((w) => w.replace(/[.']/g, '').length >= 2);
  return words.length >= 1 && words.length <= 5 && s.replace(/[^A-Za-z]/g, '').length >= 4;
}

function validDate(dd, mm, yyyy) {
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900) return false;
  const age = (Date.now() - new Date(yyyy, mm - 1, dd).getTime()) / (365.25 * 24 * 3600 * 1000);
  return age >= 0 && age <= 110;
}

/* ── ID-number extraction (confusable-tolerant) ──────────────── */

/**
 * Aadhaar: 12 digits (first 2-9), usually "XXXX XXXX XXXX".
 * Never matches the 16-digit VID or 10-digit phone numbers.
 */
function findAadhaarNumber(text) {
  // Grab digit-ish runs (digits + confusable letters), grouped or not.
  const re = /(?:[0-9OQDILZSBGT|]{4}[ \-]?){2,4}[0-9OQDILZSBGT|]{4}|[0-9OQDILZSBGT|]{12,16}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/vid/i.test(before)) continue;
    const raw = m[0].replace(/[ \-]/g, '');
    // Require at least 8 REAL digits so we don't digitize an actual word.
    if ((raw.match(/\d/g) || []).length < 8) continue;
    const digits = digitize(raw);
    if (!isDigits(digits)) continue;
    if (digits.length === 12 && /^[2-9]/.test(digits)) {
      return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
    }
  }
  return '';
}

/** PAN: 5 letters + 4 digits + 1 letter (ABCDE1234F), confusable-repaired. */
function findPan(text) {
  const re = /\b[A-Z0-9]{10}\b/g;
  const up = text.toUpperCase();
  let m;
  while ((m = re.exec(up)) !== null) {
    const tok = m[0];
    const a = letterize(tok.slice(0, 5));
    const b = digitize(tok.slice(5, 9));
    const c = letterize(tok.slice(9));
    if (isLetters(a) && isDigits(b) && isLetters(c)) {
      // 4th char encodes holder type — P (person) on individual cards.
      // Require ≥6 real (unrepaired) chars so random words don't qualify.
      let real = 0;
      for (let i = 0; i < 10; i += 1) {
        const want = i < 5 || i === 9 ? /[A-Z]/ : /\d/;
        if (want.test(tok[i])) real += 1;
      }
      if (real >= 6) return a + b + c;
    }
  }
  return '';
}

/** Voter EPIC: 3 letters + 7 digits (ABC1234567). */
function findEpic(text) {
  const up = text.toUpperCase().replace(/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/g, ' ');
  const re = /\b[A-Z0-9]{10}\b/g;
  let m;
  while ((m = re.exec(up)) !== null) {
    const tok = m[0];
    const a = letterize(tok.slice(0, 3));
    const b = digitize(tok.slice(3));
    if (isLetters(a) && isDigits(b)) {
      let real = 0;
      for (let i = 0; i < 10; i += 1) {
        const want = i < 3 ? /[A-Z]/ : /\d/;
        if (want.test(tok[i])) real += 1;
      }
      if (real >= 7) return a + b;
    }
  }
  return '';
}

/** Passport: 1 letter + 7 digits (A1234567). */
function findPassportNo(text) {
  const up = text.toUpperCase().replace(/\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/g, ' ');
  const re = /\b[A-Z][A-Z0-9]{7}\b/g;
  let m;
  while ((m = re.exec(up)) !== null) {
    const tok = m[0];
    const b = digitize(tok.slice(1));
    if (isDigits(b) && (tok.slice(1).match(/\d/g) || []).length >= 5) {
      return tok[0] + b;
    }
  }
  return '';
}

/** Driving licence: SS RR YYYYNNNNNNN (e.g. WB31 20250008761). */
function findDlNumber(text) {
  const up = text.toUpperCase()
    .replace(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/g, ' ');
  const re = /\b([A-Z]{2})[-\s]?(\d{1,2})[-\s]?(\d{4})[-\s]?(\d{6,8})\b|\b([A-Z]{2})[-\s]?(\d{2})[-\s]?(\d{10,13})\b/g;
  let m;
  while ((m = re.exec(up)) !== null) {
    if (m[1]) return `${m[1]}${P2(m[2])} ${m[3]}${m[4]}`;
    return `${m[5]}${m[6]} ${m[7]}`;
  }
  return '';
}

/* ── Document type detection (keyword + number-pattern scoring) ─ */

export function detectIdType(rawText) {
  const text = String(rawText || '');
  const scores = { aadhaar: 0, pan: 0, voter: 0, passport: 0, dl: 0 };

  // Keyword evidence — headers unique to each document
  if (/income\s*tax|permanent\s*acc/i.test(text)) scores.pan += 6;
  if (/election\s*commission|elector/i.test(text)) scores.voter += 6;
  if (/republic\s*of\s*india|passport|P<IND|P[<K]IND/i.test(text)) scores.passport += 6;
  if (/driving\s*lic|transport|motor\s*vehicle|validity\s*\(|organ\s*donor|\bDL\s*no/i.test(text)) scores.dl += 6;
  if (/aadhaar|आधार|unique\s*identification|uidai|enrol(l)?ment|मेरा\s*आधार|आम\s*आदमी/i.test(text)) scores.aadhaar += 6;
  if (/government\s*of\s*india/i.test(text) && DOB_LABEL.test(text)) scores.aadhaar += 2;
  if (/surname|given\s*name/i.test(text)) scores.passport += 3;
  if (/blood\s*group|son\s*\/\s*daughter|hter\/wife/i.test(text)) scores.dl += 2;

  // Number-pattern evidence (confusable-tolerant)
  if (findPan(text)) scores.pan += 4;
  if (findDlNumber(text)) scores.dl += 4;
  if (findAadhaarNumber(text)) scores.aadhaar += 3;
  if (findEpic(text)) scores.voter += 3;
  if (/P[<K]IND/.test(text.toUpperCase())) scores.passport += 8; // MRZ is conclusive

  let best = 'unknown';
  let bestScore = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) { bestScore = v; best = k; }
  }
  return bestScore >= 3 ? best : 'unknown';
}

/* ── Date extraction ─────────────────────────────────────────── */

/** Parse one date match with confusable repair; '' if invalid. */
function toDob(ddS, mmS, yyS) {
  const dd = +digitize(ddS);
  const mm = +digitize(mmS);
  let yyyy = +digitize(yyS);
  if (String(yyyy).length === 2) {
    yyyy += yyyy > (new Date().getFullYear() % 100) ? 1900 : 2000;
  }
  return validDate(dd, mm, yyyy) ? `${P2(dd)}/${P2(mm)}/${yyyy}` : '';
}

// Dates: 01/01/1990 · 1-1-1990 · 01.01.90 (also with confusable chars)
const DATE_RE = /([0-9OQDILZSB|]{1,2})[\s/\-.]{1,2}([0-9OQDILZSB|]{1,2})[\s/\-.]{1,2}([0-9OQDILZSB|]{4}|\d{2})/g;

/** Label-aware DOB scoring across the whole text. */
function extractDobGeneric(text) {
  const candidates = [];
  DATE_RE.lastIndex = 0;
  let m;
  while ((m = DATE_RE.exec(text)) !== null) {
    const dob = toDob(m[1], m[2], m[3]);
    if (!dob) continue;
    const [dd, mm, yyyy] = dob.split('/').map(Number);
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const age = (Date.now() - new Date(yyyy, mm - 1, dd).getTime()) / (365.25 * 24 * 3600 * 1000);
    let score = 0;
    if (DOB_LABEL.test(before)) score += 10;
    if (NOT_DOB.test(before)) score -= 8;
    if (age >= 15 && age <= 100) score += 5; else score -= 5;
    candidates.push({ dob, score });
  }
  if (!candidates.length) return '';
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].score > 0 ? candidates[0].dob : '';
}

/** DOB from the SAME line as a DOB label (most reliable). */
function dobFromLabelledLine(lines) {
  for (const line of lines) {
    if (!DOB_LABEL.test(line) || NOT_DOB.test(line)) continue;
    DATE_RE.lastIndex = 0;
    const m = DATE_RE.exec(line);
    if (m) {
      const dob = toDob(m[1], m[2], m[3]);
      if (dob) return dob;
    }
  }
  return '';
}

/* ── Name extraction helpers ─────────────────────────────────── */

/** Value on the same line after a label, e.g. "Name: ANSUMAN SAHOO". */
function labelSameLine(line, labelRe) {
  const m = line.match(labelRe);
  return m && m[1] ? cleanName(m[1]) : '';
}

/**
 * Find the value for a labelled field, either on the same line or on
 * the following 1-2 lines.
 */
function labelledValue(lines, labelRe, sameLineRe) {
  for (let i = 0; i < lines.length; i += 1) {
    if (!labelRe.test(lines[i]) || RELATIVE_LABEL.test(lines[i])) continue;
    if (sameLineRe) {
      const v = labelSameLine(lines[i], sameLineRe);
      if (isPlausibleName(v)) return v;
    }
    for (let j = i + 1; j <= i + 2 && j < lines.length; j += 1) {
      if (RELATIVE_LABEL.test(lines[j]) || labelRe.test(lines[j])) break;
      const v = cleanName(lines[j]);
      if (isPlausibleName(v)) return v;
    }
  }
  return '';
}

// Same-line "Name : VALUE" with fuzzy label spellings.
const NAME_SAMELINE = /(?:n[a4][mrn][nec]?[ec]?|name)\s*[:\-—.]?\s*(.+)$/i;

/** Fallback: best ALL-CAPS plausible-name line not under a relative label. */
function bestCapsNameLine(lines) {
  let best = '';
  let bestScore = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0 && RELATIVE_LABEL.test(lines[i - 1])) continue;
    const raw = lines[i];
    if (RELATIVE_LABEL.test(raw)) continue;
    if (/\d/.test(raw)) continue;
    const cleaned = cleanName(raw);
    if (!isPlausibleName(cleaned) || cleaned.split(' ').length < 2) continue;
    const letters = cleaned.replace(/[^A-Za-z]/g, '');
    const upperRatio = letters.length ? (cleaned.match(/[A-Z]/g) || []).length / letters.length : 0;
    const score = upperRatio * 10 + (raw === raw.toUpperCase() ? 3 : 0);
    if (score > bestScore) { bestScore = score; best = cleaned; }
  }
  return best;
}

/* ── Per-document extractors ─────────────────────────────────── */

/** AADHAAR — name is the line directly ABOVE the "DOB:" line. */
function parseAadhaar(text, lines) {
  const idNumber = findAadhaarNumber(text);
  let dob = dobFromLabelledLine(lines);
  let fullName = '';

  // Locate the DOB/YOB line and take the closest plausible-name line above it.
  for (let i = 0; i < lines.length; i += 1) {
    if (!DOB_LABEL.test(lines[i])) continue;
    for (let j = i - 1; j >= Math.max(0, i - 3); j -= 1) {
      const v = cleanName(lines[j]);
      if (isPlausibleName(v)) { fullName = v; break; }
    }
    break;
  }
  // "Name:" label used on PVC Aadhaar reprints.
  if (!fullName) fullName = labelledValue(lines, NAME_LABEL, NAME_SAMELINE);
  if (!fullName && idNumber) {
    // e-Aadhaar printouts: name sits above the number block.
    const numIdx = lines.findIndex((l) => digitize(l.replace(/\s/g, '')).includes(idNumber.replace(/\s/g, '')));
    for (let j = numIdx - 1; j >= Math.max(0, numIdx - 4); j -= 1) {
      const v = cleanName(lines[j]);
      if (isPlausibleName(v)) { fullName = v; break; }
    }
  }
  if (!dob) dob = extractDobGeneric(text);
  if (!fullName) fullName = bestCapsNameLine(lines);
  return { fullName, dob, idNumber };
}

/** PAN — "Name" label (new layout) / first caps line below number (old). */
function parsePan(text, lines) {
  const idNumber = findPan(text);
  let fullName = labelledValue(lines, NAME_LABEL, NAME_SAMELINE);
  if (!fullName && idNumber) {
    // Old PAN layout: holder name is the first caps line after the number
    const numIdx = lines.findIndex((l) => findPan(l) === idNumber);
    for (let j = numIdx + 1; j >= 0 && j <= numIdx + 3 && j < lines.length; j += 1) {
      const v = cleanName(lines[j]);
      if (isPlausibleName(v)) { fullName = v; break; }
    }
  }
  if (!fullName) fullName = bestCapsNameLine(lines);
  const dob = dobFromLabelledLine(lines) || extractDobGeneric(text);
  return { fullName, dob, idNumber };
}

/** VOTER EPIC — "Elector's Name" label. */
function parseVoter(text, lines) {
  const idNumber = findEpic(text);
  let fullName = labelledValue(
    lines,
    /elector'?s?\s*name|^\s*(?:n[a4][mrn][nec]?[ec]?|name)\b/i,
    NAME_SAMELINE,
  );
  if (!fullName) fullName = labelledValue(lines, NAME_LABEL, NAME_SAMELINE);
  if (!fullName) fullName = bestCapsNameLine(lines);
  const dob = dobFromLabelledLine(lines) || extractDobGeneric(text);
  return { fullName, dob, idNumber };
}

/** PASSPORT — MRZ first (most reliable), then Surname/Given labels. */
function parsePassport(text, lines) {
  const up = text.toUpperCase();

  // MRZ line 1: P<INDSAHOO<<ANSUMAN<KUMAR<<<<...  (< may misread as K)
  const mrz1 = up.match(/P[<K]IND([A-Z<]{5,})/);
  // MRZ line 2: A1234567<8IND0502105M...  (number, then IND, then DOB YYMMDD)
  const mrz2 = up.match(/([A-Z][0-9]{7})[<0-9][0-9]?IND(\d{2})(\d{2})(\d{2})/);

  let fullName = '';
  if (mrz1) {
    const parts = mrz1[1].split('<<');
    const surname = (parts[0] || '').replace(/</g, ' ').trim();
    const given = (parts[1] || '').replace(/</g, ' ').trim();
    const combined = cleanName(`${given} ${surname}`);
    if (isPlausibleName(combined)) fullName = combined;
  }
  if (!fullName) {
    const given = labelledValue(lines, /given\s*name/i, /given\s*name\(?s?\)?\s*[:\-—]?\s*(.+)$/i);
    const surname = labelledValue(lines, /surname/i, /surname\s*[:\-—]?\s*(.+)$/i);
    const combined = cleanName(`${given} ${surname}`);
    if (isPlausibleName(combined)) fullName = combined;
  }
  if (!fullName) fullName = bestCapsNameLine(lines);

  let idNumber = '';
  let dob = '';
  if (mrz2) {
    idNumber = mrz2[1];
    const yy = +mrz2[2];
    const century = yy > (new Date().getFullYear() % 100) ? 1900 : 2000;
    const yyyy = century + yy;
    if (validDate(+mrz2[4], +mrz2[3], yyyy)) dob = `${mrz2[4]}/${mrz2[3]}/${yyyy}`;
  }
  if (!idNumber) idNumber = findPassportNo(text);
  if (!dob) dob = dobFromLabelledLine(lines) || extractDobGeneric(text);
  return { fullName, dob, idNumber };
}

/** DRIVING LICENCE — "Name:" label; DOB among Issue/Validity dates. */
function parseDl(text, lines) {
  const idNumber = findDlNumber(text);
  let fullName = labelledValue(lines, NAME_LABEL, NAME_SAMELINE);
  if (!fullName) fullName = bestCapsNameLine(lines);
  const dob = dobFromLabelledLine(lines) || extractDobGeneric(text);
  return { fullName, dob, idNumber };
}

/** Generic fallback for unrecognised documents. */
function parseGeneric(text, lines) {
  const dob = dobFromLabelledLine(lines) || extractDobGeneric(text);
  let idNumber = findPan(text) || findDlNumber(text) || findAadhaarNumber(text)
    || findEpic(text) || findPassportNo(text);
  if (!idNumber) {
    const scrub = text.toUpperCase()
      .replace(/(\d{1,2})[\s/\-.]{1,2}(\d{1,2})[\s/\-.]{1,2}(\d{2,4})/g, ' ');
    const m = scrub.match(/\b[A-Z0-9]{8,17}\b/);
    if (m && (m[0].match(/\d/g) || []).length >= 4) idNumber = m[0];
  }
  let fullName = labelledValue(lines, NAME_LABEL, NAME_SAMELINE);
  if (!fullName) fullName = bestCapsNameLine(lines);
  return { fullName, dob, idNumber };
}

const PARSERS = {
  aadhaar: parseAadhaar,
  pan: parsePan,
  voter: parseVoter,
  passport: parsePassport,
  dl: parseDl,
  unknown: parseGeneric,
};

/**
 * Main entry: detect the ID type, then run that document's
 * layout-aware extractor. Falls back to the generic extractor for
 * any field the specific parser missed.
 */
export function parseIndianId(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const idType = detectIdType(text);
  const specific = PARSERS[idType](text, lines);
  const generic = idType === 'unknown' ? specific : parseGeneric(text, lines);
  return {
    idType,
    idTypeLabel: ID_TYPES[idType],
    fullName: specific.fullName ? TITLE_CASE(specific.fullName) : (generic.fullName ? TITLE_CASE(generic.fullName) : ''),
    dob: specific.dob || generic.dob || '',
    idNumber: specific.idNumber || generic.idNumber || '',
  };
}

/** Merge two parse results — `primary` wins per field. */
export function mergeParsedId(primary, secondary) {
  const idType = primary.idType !== 'unknown' ? primary.idType : (secondary.idType || 'unknown');
  return {
    idType,
    idTypeLabel: ID_TYPES[idType],
    fullName: primary.fullName || secondary.fullName || '',
    dob: primary.dob || secondary.dob || '',
    idNumber: primary.idNumber || secondary.idNumber || '',
  };
}
