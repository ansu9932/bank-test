/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · COUNTRY-BASED KYC REQUIREMENTS
   Single source of truth for the "Open Account" flow. The selected country
   drives which KYC documents are shown — only that country's documents appear.

   Each document definition:
     key        → unique field key (MUST match backend KYCDocument enum + upload field)
     label      → UI label
     idKey      → form field that holds the document's ID number (null = file only)
     placeholder→ input placeholder for the ID number
     required   → is the upload (and ID number, if any) mandatory?
     autoVerify → India PAN only — triggers the Cashfree income-tax name lookup
     format     → 'aadhaar' for spaced display formatting (else undefined)
     transform  → input sanitizer: 'pan' | 'digits12' | 'digits' | undefined
     pattern    → regex string used to validate the ID number (optional)
     patternMsg → message shown when the pattern fails
     maxLength  → input maxLength
   ────────────────────────────────────────────────────────────────────────── */

export const COUNTRIES = [
  { code: 'IN', name: 'India',      flag: '🇮🇳' },
  { code: 'NP', name: 'Nepal',      flag: '🇳🇵' },
  { code: 'BT', name: 'Bhutan',     flag: '🇧🇹' },
  { code: 'BD', name: 'Bangladesh', flag: '🇧🇩' },
];

const PASSPORT = {
  key: 'passport', idKey: 'passportNumber', label: 'Passport',
  placeholder: 'A1234567', required: false, transform: 'upper', maxLength: 20,
};
const SELFIE    = { key: 'selfie',    idKey: null, label: 'Live Selfie', required: true };
const SIGNATURE = { key: 'signature', idKey: null, label: 'Signature',   required: true };

export const COUNTRY_DOCS = {
  // 🇮🇳 India — PAN (auto-verified) + Aadhaar are mandatory.
  IN: [
    {
      key: 'pan', idKey: 'panNumber', label: 'PAN Card', placeholder: 'ABCDE1234F',
      required: true, autoVerify: true, transform: 'pan', maxLength: 10,
      pattern: '^[A-Z]{5}[0-9]{4}[A-Z]$', patternMsg: 'Enter a valid PAN (e.g. ABCDE1234F).',
    },
    {
      key: 'aadhaar', idKey: 'aadhaarNumber', label: 'Aadhaar Card', placeholder: '1234 5678 9012',
      required: true, format: 'aadhaar', transform: 'digits12', maxLength: 14,
      pattern: '^\\d{12}$', patternMsg: 'Aadhaar must be exactly 12 digits.',
    },
    PASSPORT,
    SELFIE,
    SIGNATURE,
    { key: 'address_proof', idKey: null, label: 'Address Proof', required: false },
  ],

  // 🇳🇵 Nepal — Citizenship Certificate (Nagarikta) is the primary national ID.
  NP: [
    {
      key: 'citizenship_certificate', idKey: 'citizenshipNumber',
      label: 'Citizenship Certificate (Nagarikta)', placeholder: 'e.g. 12-34-56-78901',
      required: true, transform: 'idnum', maxLength: 30,
    },
    PASSPORT,
    SELFIE,
    SIGNATURE,
    { key: 'address_proof', idKey: null, label: 'Address Proof (Utility Bill)', required: true },
  ],

  // 🇧🇹 Bhutan — Citizenship Identity Card (CID) is the national ID.
  BT: [
    {
      key: 'cid', idKey: 'cidNumber', label: 'Citizenship Identity Card (CID)',
      placeholder: '11-digit CID number', required: true, transform: 'digits', maxLength: 11,
    },
    PASSPORT,
    SELFIE,
    SIGNATURE,
    { key: 'address_proof', idKey: null, label: 'Address Proof', required: true },
  ],

  // 🇧🇩 Bangladesh — National ID Card (NID) mandatory; TIN optional.
  BD: [
    {
      key: 'national_id', idKey: 'nationalIdNumber', label: 'National ID Card (NID)',
      placeholder: '10 or 17-digit NID', required: true, transform: 'digits', maxLength: 17,
    },
    {
      key: 'tin', idKey: 'tinNumber', label: 'TIN Certificate',
      placeholder: 'TIN (optional)', required: false, transform: 'idnum', maxLength: 20,
    },
    PASSPORT,
    SELFIE,
    SIGNATURE,
    { key: 'address_proof', idKey: null, label: 'Address Proof (Utility Bill)', required: true },
  ],
};

// Every ID-number form field used across all countries — used to reset the
// form when the country changes so stale values never leak between countries.
export const ALL_DOC_ID_KEYS = [
  'panNumber', 'aadhaarNumber', 'passportNumber',
  'citizenshipNumber', 'cidNumber', 'nationalIdNumber', 'tinNumber',
];

export const getDocsForCountry = (code) => COUNTRY_DOCS[code] || COUNTRY_DOCS.IN;
export const getCountryByCode = (code) => COUNTRIES.find((c) => c.code === code) || COUNTRIES[0];

// Apply a document's input sanitizer to a raw input value.
export const applyTransform = (transform, value) => {
  const v = value ?? '';
  switch (transform) {
    case 'pan':      return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    case 'digits12': return v.replace(/\D/g, '').slice(0, 12);
    case 'digits':   return v.replace(/\D/g, '');
    case 'upper':    return v.toUpperCase().replace(/[^A-Z0-9]/g, '');
    case 'idnum':    return v.replace(/[^A-Za-z0-9\-/]/g, ''); // alnum + - and /
    default:         return v;
  }
};

// "XXXX XXXX XXXX" display formatting for Aadhaar.
export const formatAadhaar = (raw) => String(raw || '').replace(/(.{4})/g, '$1 ').trim();
