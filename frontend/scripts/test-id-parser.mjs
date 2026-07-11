/* Verification harness for the Indian ID parser.
   Feeds REAL-WORLD-NOISY OCR text (typical Tesseract misreads) for all
   5 supported documents and asserts name / DOB / ID number extraction.
   Run: node scripts/test-id-parser.mjs                                  */

import { parseIndianId } from '../src/pages/video-kyc/idParser.js';

const CASES = [
  {
    label: 'Aadhaar — clean scan',
    text: `भारत सरकार
Government of India
Ramesh Kumar Sharma
DOB: 15/08/1992
MALE
9876 5432 1098
मेरा आधार, मेरी पहचान`,
    expect: { idType: 'aadhaar', fullName: 'Ramesh Kumar Sharma', dob: '15/08/1992', idNumber: '9876 5432 1098' },
  },
  {
    label: 'Aadhaar — noisy OCR (D0B, digits misread S/O, VID present)',
    text: `Government of lndia
Priya Venkatesh
D0B : 23/O4/1988
FEMALE
78S6 43Z1 90O2
VID : 9134 5678 9012 3456
Aadhaar - Aam Aadmi ka Adhikar`,
    expect: { idType: 'aadhaar', fullName: 'Priya Venkatesh', dob: '23/04/1988', idNumber: '7856 4321 9002' },
  },
  {
    label: 'Aadhaar — old card, Year of Birth only',
    text: `GOVERNMENT OF INDIA
Sunil Dutta
Year of Birth : 1975
Male
5678 1234 9876`,
    expect: { idType: 'aadhaar', fullName: 'Sunil Dutta', idNumber: '5678 1234 9876' },
  },
  {
    label: 'PAN — new layout with labels',
    text: `INCOME TAX DEPARTMENT      GOVT. OF INDIA
Permanent Account Number Card
FMPPK3456L
Name
ANITA KRISHNAN
Father's Name
RAGHAVAN KRISHNAN
Date of Birth
07/11/1990`,
    expect: { idType: 'pan', fullName: 'Anita Krishnan', dob: '07/11/1990', idNumber: 'FMPPK3456L' },
  },
  {
    label: 'PAN — noisy (Narne label, 0↔O in number)',
    text: `INC0ME TAX DEPARTMENT
Permanent Account Number
BXTPS72O4K
Narne
VIKRAM SINGH RATHORE
Father's Narne
MOHAN SINGH RATHORE
Date of Birth 12/03/1985`,
    expect: { idType: 'pan', fullName: 'Vikram Singh Rathore', dob: '12/03/1985', idNumber: 'BXTPS7204K' },
  },
  {
    label: 'Voter EPIC — Elector name label',
    text: `ELECTION COMMISSION OF INDIA
IDENTITY CARD
XYZ4567890
Elector's Name : MEENA KUMARI
Father's Name : RAJESH PRASAD
Date of Birth : 02/09/1996
Sex : F`,
    expect: { idType: 'voter', fullName: 'Meena Kumari', dob: '02/09/1996', idNumber: 'XYZ4567890' },
  },
  {
    label: 'Passport — MRZ readable',
    text: `REPUBLIC OF INDIA
PASSPORT
Type P
Surname  MEHTA
Given Name(s)  ARJUN DEV
Date of Birth 05/02/1991
P<INDMEHTA<<ARJUN<DEV<<<<<<<<<<<<<<<<<<<<<<<
M8267543<4IND9102055M2503116<<<<<<<<<<<<<<02`,
    expect: { idType: 'passport', fullName: 'Arjun Dev Mehta', dob: '05/02/1991', idNumber: 'M8267543' },
  },
  {
    label: 'Passport — MRZ unreadable, labels only',
    text: `REPUBLIC OF INDIA
PASSPORT
Passport No. K5162809
Surname
BANERJEE
Given Name(s)
SHREYA
Date of Birth
18/12/1993
Place of Birth KOLKATA`,
    expect: { idType: 'passport', fullName: 'Shreya Banerjee', dob: '18/12/1993', idNumber: 'K5162809' },
  },
  {
    label: 'Driving Licence — issue/validity dates present',
    text: `UNION OF INDIA
MAHARASHTRA STATE MOTOR DRIVING LICENCE
DL No : MH12 20110012345
DOI : 21/06/2011
Valid Till : 20/06/2031
Name : SANDEEP PATIL
DOB : 30/01/1989
Blood Group : B+
S/W/D of : GANESH PATIL`,
    expect: { idType: 'dl', fullName: 'Sandeep Patil', dob: '30/01/1989', idNumber: 'MH12 20110012345' },
  },
  {
    label: 'DL — noisy (D08 label, spaces in number)',
    text: `INDIAN UNION DRIVING LICENCE
DL No: KA-05 2019 0004321
Narne: DEEPA NAIR
D08: 25/07/1994
DOI: 14/02/2019
Validity(NT): 13/02/2039`,
    expect: { idType: 'dl', fullName: 'Deepa Nair', dob: '25/07/1994', idNumber: 'KA05 20190004321' },
  },
];

let pass = 0;
let fail = 0;
for (const c of CASES) {
  const r = parseIndianId(c.text);
  const errors = [];
  for (const [k, want] of Object.entries(c.expect)) {
    if (r[k] !== want) errors.push(`  ${k}: got "${r[k]}" want "${want}"`);
  }
  if (errors.length) {
    fail += 1;
    console.log(`FAIL  ${c.label}`);
    console.log(errors.join('\n'));
    console.log('  full result:', JSON.stringify(r));
  } else {
    pass += 1;
    console.log(`PASS  ${c.label}`);
  }
}
console.log(`\n${pass}/${pass + fail} cases passed`);
process.exit(fail ? 1 : 0);
