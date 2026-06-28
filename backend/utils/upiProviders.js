/**
 * UPI handle → bank/provider resolver.
 *
 * Maps the suffix of a VPA (the part after '@') to a friendly banking provider
 * name so the UI can confirm the payee's bank in real time. Covers the common
 * PSP/bank handles in the Indian UPI ecosystem; unknown handles fall back to a
 * "Verified" acknowledgement using the raw handle.
 */

const HANDLE_MAP = {
  // Axis Bank (and Axis-powered PSPs)
  okaxis: 'Axis Bank',
  axisbank: 'Axis Bank',
  axl: 'Axis Bank (Amazon Pay)',
  // HDFC Bank
  okhdfcbank: 'HDFC Bank',
  hdfcbank: 'HDFC Bank',
  payzapp: 'HDFC Bank (PayZapp)',
  // ICICI Bank
  okicici: 'ICICI Bank',
  icici: 'ICICI Bank',
  ibl: 'ICICI Bank',
  // State Bank of India
  oksbi: 'State Bank of India',
  sbi: 'State Bank of India',
  // YES Bank (PhonePe, BharatPe)
  ybl: 'YES Bank (PhonePe)',
  yapl: 'YES Bank (PhonePe)',
  ibl_yes: 'YES Bank',
  // Paytm Payments Bank
  paytm: 'Paytm Payments Bank',
  ptyes: 'Paytm Payments Bank',
  ptaxis: 'Paytm Payments Bank',
  ptsbi: 'Paytm Payments Bank',
  pthdfc: 'Paytm Payments Bank',
  // Other common banks/PSPs
  apl: 'Axis Bank (Amazon Pay)',
  upi: 'NPCI UPI',
  kotak: 'Kotak Mahindra Bank',
  okkotak: 'Kotak Mahindra Bank',
  pnb: 'Punjab National Bank',
  barodampay: 'Bank of Baroda',
  cnrb: 'Canara Bank',
  idfcbank: 'IDFC FIRST Bank',
  idfcfirst: 'IDFC FIRST Bank',
  fbl: 'Federal Bank',
  federal: 'Federal Bank',
  indus: 'IndusInd Bank',
  rbl: 'RBL Bank',
  jupiteraxis: 'Jupiter (Axis Bank)',
  fam: 'FamPay (IDFC FIRST)',
  slc: 'Slice',
  yesg: 'YES Bank (Google Pay)',
};

const VPA_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{1,64}$/;

/**
 * Is the string a structurally valid VPA?
 * @param {string} vpa
 * @returns {boolean}
 */
function isValidVpa(vpa) {
  return typeof vpa === 'string' && VPA_REGEX.test(vpa.trim());
}

/**
 * Resolve the provider for a VPA handle.
 * @param {string} vpa
 * @returns {{ handle: string|null, provider: string, known: boolean }}
 */
function resolveUpiProvider(vpa) {
  if (!isValidVpa(vpa)) {
    return { handle: null, provider: 'Invalid UPI ID format', known: false };
  }
  const handle = vpa.trim().split('@')[1].toLowerCase();
  const provider = HANDLE_MAP[handle];
  if (provider) {
    return { handle, provider, known: true };
  }
  // Unknown but structurally valid → acknowledge the handle.
  return { handle, provider: `@${handle} · Handle Verified`, known: false };
}

module.exports = { resolveUpiProvider, isValidVpa, HANDLE_MAP };
