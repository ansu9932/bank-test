/* ────────────────────────────────────────────────────────────────
   Indian ID document parser — detects WHICH of the 5 supported IDs
   was scanned (Aadhaar, PAN, Voter EPIC, Passport, Driving Licence)
   and extracts name / DOB / ID number using that document's known
   layout. All processing is on-device.
   ──────────────────────────────────────────────────────────────── */

export const ID_TYPES = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  voter: 'Voter ID (EPIC)',
  passport: 'Passport',
  dl: 'Driving Licence',
  unknown: 'Government ID',
};

/* ── Number patterns per document ────────────────────────────── */
const NUM = {
  aadhaar: /\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b/,               // 12 digits, starts 2-9
  pan: /\b[A-Z]{5}\d{4}[A-Z]\b/,                            // ABCDE1234F
  voter: /\b[A-Z]{3}\d{7}\b/,                               // ABC1234567
  passport: /\b[A-Z][0-9]{7}\b/,                            // A1234567
  dl: /\b[A-Z]{2}[-\s]?\d{2}[-\s]?(?:\d{4}[-\s]?\d{7}|\d{10,13})\b/, // WB31 20250008761
};

const TITLE_CASE = (s) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
const P2 = (n) => String(n).padStart(2, '0');

const NAME_STOPWORDS = /(government|govt|india|indian|bank|card|license|licence|permanent|account|income|tax|department|authority|republic|identity|national|driving|union|federal|state|birth|male|female|address|issue|expiry|valid|validity|signature|father|mother|husband|transport|blood|group|organ|donor|holder|number|element|minor|issued|date|first|election|commission|elector|surname|given|nationality|place|type|code|passport|aadhaar|unique|identification|enrol|download|help|www|gov)/i;

const RELATIVE_LABEL = /father|mother|husband|guardian|spouse|son\s*\/|daughter|wife/i;

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

/* ── Document type detection (keyword + number-pattern scoring) ─ */
export function detectIdType(rawText) {
  const text = String(rawText || '');
  const scores = { aadhaar: 0, pan: 0, voter: 0, passport: 0, dl: 0 };

  // Keyword evidence — headers unique to each document
  if (/income\s*tax|permanent\s*account/i.test(text)) scores.pan += 6;
  if (/election\s*commission|elector/i.test(text)) scores.voter += 6;
  if (/republic\s*of\s*india|passport|P<IND/i.test(text)) scores.passport += 6;
  if (/driving\s*lic|transport|motor\s*vehicle|validity\s*\(|organ\s*donor/i.test(text)) scores.dl += 6;
  if (/aadhaar|आधार|unique\s*identification|uidai|enrol(l)?ment|मेरा\s*आधार/i.test(text)) scores.aadhaar += 6;
  if (/government\s*of\s*india/i.test(text) && /\bDOB\b|जन्म/i.test(text)) scores.aadhaar += 2;
  if (/surname|given\s*name/i.test(text)) scores.passport += 3;
  if (/blood\s*group|son\s*\/\s*daughter|hter\/wife/i.test(text)) scores.dl += 2;

  // Number-pattern evidence
  if (NUM.pan.test(text.toUpperCase())) scores.pan += 4;
  if (NUM.dl.test(text.toUpperCase())) scores.dl += 4;
  if (NUM.aadhaar.test(text)) scores.aadhaar += 3;
  if (NUM.voter.test(text.toUpperCase())) scores.voter += 3;
  if (/P<IND/.test(text.toUpperCase())) scores.passport += 8; // MRZ is conclusive

  let best = 'unknown';
  let bestScore = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) { bestScore = v; best = k; }
  }
  return bestScore >= 3 ? best : 'unknown';
}

/* ── Generic date extraction with label-aware scoring ────────── */
function extractDobGeneric(text) {
  const candidates = [];
  const re = /(\d{2})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{4})|(\d{4})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{2})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let dd; let mm; let yyyy;
    if (m[1]) { dd = +m[1]; mm = +m[2]; yyyy = +m[3]; } else { yyyy = +m[4]; mm = +m[5]; dd = +m[6]; }
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900) continue;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const age = (Date.now() - new Date(yyyy, mm - 1, dd).getTime()) / (365.25 * 24 * 3600 * 1000);
    let score = 0;
    if (/birth|dob|d\.o\.b|born|जन्म/i.test(before)) score += 10;
    if (/issue|valid|expir|exp\b|first|renew|upto|till/i.test(before)) score -= 8;
    if (age >= 15 && age <= 100) score += 5; else score -= 5;
    candidates.push({ dd, mm, yyyy, score });
  }
  if (!candidates.length) return '';
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best.score <= 0) return '';
  return `${P2(best.dd)}/${P2(best.mm)}/${best.yyyy}`;
}

/** Value on the same line after a label, e.g. "Name: ANSUMAN SAHOO". */
function labelSameLine(line, labelRe) {
  const m = line.match(labelRe);
  return m && m[1] ? cleanName(m[1]) : '';
}

/**
 * Find the value for a labelled field, either on the same line or on
 * the following 1-2 lines. Skips lines matching `skipRe`.
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
  const idNumber = (text.match(NUM.aadhaar) || [''])[0].replace(/\s+/g, ' ').trim()
    .replace(/^(\d{4})\s?(\d{4})\s?(\d{4})$/, '$1 $2 $3');
  let dob = '';
  let fullName = '';
  for (let i = 0; i < lines.length; i += 1) {
    if (/\bDOB\b|जन्म|date\s*of\s*birth|year\s*of\s*birth/i.test(lines[i])) {
      const dm = lines[i].match(/(\d{2})[/\-.](\d{2})[/\-.](\d{4})/);
      if (dm && validDate(+dm[1], +dm[2], +dm[3])) dob = `${dm[1]}/${dm[2]}/${dm[3]}`;
      // Name sits immediately above the DOB line on Aadhaar
      for (let j = i - 1; j >= Math.max(0, i - 3); j -= 1) {
        const v = cleanName(lines[j]);
        if (isPlausibleName(v)) { fullName = v; break; }
      }
      break;
    }
  }
  if (!dob) dob = extractDobGeneric(text);
  if (!fullName) fullName = bestCapsNameLine(lines);
  return { fullName, dob, idNumber };
}

/** PAN — "/Name" label with the name on the NEXT line. */
function parsePan(text, lines) {
  const idNumber = (text.toUpperCase().match(NUM.pan) || [''])[0];
  let fullName = labelledValue(lines, /name/i, /name\s*[:\-—]?\s*(.+)$/i);
  if (!fullName) {
    // Old PAN layout: holder name is the first caps line after the number
    const numIdx = lines.findIndex((l) => NUM.pan.test(l.toUpperCase()));
    for (let j = numIdx + 1; j >= 0 && j <= numIdx + 3 && j < lines.length; j += 1) {
      const v = cleanName(lines[j]);
      if (isPlausibleName(v)) { fullName = v; break; }
    }
  }
  if (!fullName) fullName = bestCapsNameLine(lines);
  const dob = extractDobGeneric(text);
  return { fullName, dob, idNumber };
}

/** VOTER EPIC — "Elector's Name" label. */
function parseVoter(text, lines) {
  const scrub = text.toUpperCase().replace(/\d{2}[/\-.]\d{2}[/\-.]\d{4}/g, ' ');
  const idNumber = (scrub.match(NUM.voter) || [''])[0];
  let fullName = labelledValue(lines, /elector'?s?\s*name|^name\b/i, /name\s*[:\-—]?\s*(.+)$/i);
  if (!fullName) fullName = bestCapsNameLine(lines);
  const dob = extractDobGeneric(text);
  return { fullName, dob, idNumber };
}

/** PASSPORT — MRZ first (most reliable), then Surname/Given labels. */
function parsePassport(text, lines) {
  const up = text.toUpperCase();

  // MRZ line 1: P<INDSAHOO<<ANSUMAN<KUMAR<<<<...
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
  if (!idNumber) {
    const scrub = up.replace(/\d{2}[/\-.]\d{2}[/\-.]\d{4}/g, ' ');
    idNumber = (scrub.match(NUM.passport) || [''])[0];
  }
  if (!dob) dob = extractDobGeneric(text);
  return { fullName, dob, idNumber };
}

/** DRIVING LICENCE — "Name:" label; DOB among Issue/Validity dates. */
function parseDl(text, lines) {
  const scrub = text.toUpperCase()
    .replace(/(\d{2})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{4})/g, ' ')
    .replace(/(\d{4})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{2})/g, ' ');
  const idNumber = ((scrub.match(NUM.dl) || [''])[0] || '')
    .replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
  let fullName = labelledValue(lines, /^name\b|[^'s]name\s*[:\-—]/i, /name\s*[:\-—]?\s*(.+)$/i);
  if (!fullName) fullName = bestCapsNameLine(lines);
  const dob = extractDobGeneric(text);
  return { fullName, dob, idNumber };
}

/** Generic fallback for unrecognised documents. */
function parseGeneric(text, lines) {
  const dob = extractDobGeneric(text);
  const scrub = text.toUpperCase()
    .replace(/(\d{2})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{4})/g, ' ')
    .replace(/(\d{4})[\s/\-.]{1,2}(\d{2})[\s/\-.]{1,2}(\d{2})/g, ' ');
  let idNumber = '';
  for (const p of [NUM.dl, NUM.pan, NUM.aadhaar, NUM.voter, NUM.passport, /\b\d{9,16}\b/]) {
    const m = scrub.match(p);
    if (m) { idNumber = m[0].replace(/-/g, ' ').replace(/\s+/g, ' ').trim(); break; }
  }
  let fullName = labelledValue(lines, /name/i, /name\s*[:\-—]?\s*(.+)$/i);
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
