/**
 * Strict server-side validation for POST /api/account/open.
 *
 * The account-opening endpoint is PUBLIC (pre-login) and creates real User
 * rows, so it must never trust the frontend wizard's client-side checks —
 * anyone can POST directly to the API with curl/Postman. This middleware
 * enforces format, range, and whitelist rules BEFORE the controller touches
 * the database, returning a precise 400 naming the first offending field.
 *
 * Runs AFTER multer (kycUpload.fields) so req.body is populated from the
 * multipart form-data, and BEFORE the controller.
 */
const { badRequest } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// Whitelists — must stay in sync with the frontend selects (StepPersonal.jsx)
// and the values the admin dashboard / KYC workflow understand.
const ACCOUNT_TYPES = ['savings', 'current', 'business_elite'];
const GENDERS = ['male', 'female', 'other'];
const MARITAL_STATUSES = ['single', 'married', 'divorced', 'widowed'];

// Format rules
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9][0-9\s-]{6,17}$/;        // 7–18 digits, intl "+" ok
const NAME_RE = /^[A-Za-z][A-Za-z\s.'-]{0,59}$/;     // letters + common name chars
const PIN_RE = /^[A-Za-z0-9][A-Za-z0-9\s-]{2,11}$/;  // postal codes worldwide
const AADHAAR_RE = /^\d{12}$/;                        // 12 digits (after strip)
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;             // ABCDE1234F

const MAX_FIELD_LEN = 120; // hard ceiling for any free-text field

const validateOpenAccount = (req, res, next) => {
  try {
    const b = req.body || {};
    const val = (k) => (b[k] === undefined || b[k] === null ? '' : String(b[k]).trim());

    const fail = (msg, field) => {
      logger.warn(`openAccount validation rejected [${field}]: ${msg} (ip=${req.ip})`);
      return badRequest(res, msg);
    };

    // ── Global size guard: no submitted text field may exceed the ceiling ──
    for (const [k, v] of Object.entries(b)) {
      if (typeof v === 'string' && v.length > MAX_FIELD_LEN) {
        return fail(`The "${k}" field is too long (max ${MAX_FIELD_LEN} characters).`, k);
      }
    }

    // ── Names ──────────────────────────────────────────────────────────────
    if (!NAME_RE.test(val('firstName'))) {
      return fail('First name must contain only letters (1–60 characters).', 'firstName');
    }
    if (!NAME_RE.test(val('lastName'))) {
      return fail('Last name must contain only letters (1–60 characters).', 'lastName');
    }
    for (const k of ['fatherName', 'motherName']) {
      if (val(k) && !NAME_RE.test(val(k))) {
        return fail(`${k === 'fatherName' ? "Father's" : "Mother's"} name must contain only letters.`, k);
      }
    }

    // ── Email & phone ──────────────────────────────────────────────────────
    if (!EMAIL_RE.test(val('email'))) {
      return fail('Please provide a valid email address.', 'email');
    }
    if (!PHONE_RE.test(val('phone'))) {
      return fail('Please provide a valid phone number (7–15 digits).', 'phone');
    }

    // ── Date of birth: real date, not in the future, applicant must be 18+ ─
    const dobStr = val('dateOfBirth');
    const dob = new Date(dobStr);
    if (!dobStr || Number.isNaN(dob.getTime())) {
      return fail('Please provide a valid date of birth.', 'dateOfBirth');
    }
    const now = new Date();
    if (dob > now) return fail('Date of birth cannot be in the future.', 'dateOfBirth');
    const age = (now - dob) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 18) return fail('You must be at least 18 years old to open an account.', 'dateOfBirth');
    if (age > 120) return fail('Please provide a valid date of birth.', 'dateOfBirth');

    // ── Enumerated fields: whitelist, never trust free-form values ─────────
    if (!GENDERS.includes(val('gender').toLowerCase())) {
      return fail('Please select a valid gender.', 'gender');
    }
    if (val('maritalStatus') && !MARITAL_STATUSES.includes(val('maritalStatus').toLowerCase())) {
      return fail('Please select a valid marital status.', 'maritalStatus');
    }
    if (!ACCOUNT_TYPES.includes(val('accountType').toLowerCase())) {
      return fail('Please select a valid account type.', 'accountType');
    }

    // ── Address ────────────────────────────────────────────────────────────
    if (val('addressLine1').length < 3) {
      return fail('Address must be at least 3 characters.', 'addressLine1');
    }
    if (val('city').length < 2) return fail('Please provide a valid city.', 'city');
    if (val('state').length < 2) return fail('Please provide a valid state.', 'state');
    if (!PIN_RE.test(val('pincode'))) {
      return fail('Please provide a valid PIN / postal code.', 'pincode');
    }

    // ── Identity documents (optional per-country, but strict when present) ─
    const aadhaarClean = val('aadhaarNumber').replace(/\D/g, '');
    if (val('aadhaarNumber') && !AADHAAR_RE.test(aadhaarClean)) {
      return fail('Aadhaar number must be exactly 12 digits.', 'aadhaarNumber');
    }
    const panClean = val('panNumber').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (val('panNumber') && !PAN_RE.test(panClean)) {
      return fail('PAN must be in the format ABCDE1234F.', 'panNumber');
    }

    // ── Annual income: numeric and sane when provided ──────────────────────
    if (val('annualIncome') !== '') {
      const income = Number(val('annualIncome'));
      if (Number.isNaN(income) || income < 0 || income > 1e12) {
        return fail('Please provide a valid annual income.', 'annualIncome');
      }
    }

    return next();
  } catch (err) {
    logger.error(`validateOpenAccount error: ${err.message}`);
    return badRequest(res, 'Submitted application data could not be validated. Please review and try again.');
  }
};

module.exports = { validateOpenAccount };
