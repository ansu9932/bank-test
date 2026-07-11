/* End-to-end verification: real image → Tesseract OCR → idParser.
   Mirrors the browser pipeline (raw pass; preprocessing passes are
   browser-canvas based and only ADD accuracy on top of this).
   Run: node scripts/test-ocr-e2e.mjs                              */

import { createWorker } from 'tesseract.js';
import { parseIndianId } from '../src/pages/video-kyc/idParser.js';

const IMAGE = new URL('./test-assets/sample-aadhaar.png', import.meta.url).pathname;

const worker = await createWorker('eng');
await worker.setParameters({ preserve_interword_spaces: '1', user_defined_dpi: '300' });
const { data } = await worker.recognize(IMAGE);
await worker.terminate();

console.log('── raw OCR text ──────────────────────────');
console.log(data.text);
console.log('── parsed result ─────────────────────────');
const parsed = parseIndianId(data.text);
console.log(JSON.stringify(parsed, null, 2));

const ok = parsed.idType === 'aadhaar'
  && /ramesh kumar sharma/i.test(parsed.fullName)
  && parsed.dob === '15/08/1992'
  && parsed.idNumber === '9876 5432 1098';
console.log(ok ? '\nE2E PASS — name, DOB and ID number all extracted' : '\nE2E FAIL');
process.exit(ok ? 0 : 1);
