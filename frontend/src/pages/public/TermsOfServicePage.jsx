import React from 'react';
import PageTransition from '../../components/public/PageTransition';
import LegalLayout, { LP, LList } from '../../components/public/LegalLayout';

const BANNER =
  'Effective Date: January 1, 2025 | Last Updated: May 1, 2025\nPLEASE READ THESE TERMS CAREFULLY. BY OPENING OR USING AN ALISTER BANK ACCOUNT, YOU AGREE TO BE BOUND BY THESE TERMS.';

const SECTIONS = [
  {
    id: 'agreement',
    number: 1,
    title: 'Agreement & Governing Law',
    body: (
      <>
        <LP>
          These Terms of Service ("Terms") constitute a legally binding agreement between you and Alister Bank, N.A.
          ("Alister Bank"), a nationally chartered bank organized under the National Bank Act, 12 U.S.C. § 1 et seq.
        </LP>
        <LP>
          These Terms are governed by and construed in accordance with applicable federal banking law and, to the
          extent not preempted, the laws of the State of New York. Any legal action arising under these Terms shall be
          brought exclusively in the federal or state courts located in New York County, New York.
        </LP>
      </>
    ),
  },
  {
    id: 'eligibility',
    number: 2,
    title: 'Account Eligibility',
    body: (
      <>
        <LP>To open and maintain an account with Alister Bank, you must:</LP>
        <LList
          items={[
            'Be at least 18 years of age',
            'Be a pre-approved participant of the Alister Bank Corporate Partnership Program (India accounts are restricted to invited participants only)',
            'Provide all information required under the Customer Identification Program (CIP) rules, 31 CFR § 1020.220',
            'Not be named on any OFAC Specially Designated Nationals (SDN) list or subject to sanctions under 31 CFR Chapter V',
            'Not be subject to any order prohibiting you from banking services',
          ]}
        />
        <LP>
          {'Minimum opening deposit: $100,000 or equivalent.\nSavings Account minimum balance: $5,298 or equivalent.\nCurrent Account minimum balance: $10,598 or equivalent.'}
        </LP>
      </>
    ),
  },
  {
    id: 'truth-in-savings',
    number: 3,
    title: 'Truth in Savings (Regulation DD)',
    body: (
      <LP>
        Interest rates, fees, and account terms are disclosed in your Account Agreement and Disclosure document provided
        at account opening, as required by the Truth in Savings Act (TISA), 12 U.S.C. § 4301 et seq., and its
        implementing regulation, Regulation DD (12 CFR Part 1030). Annual Percentage Yields (APY) are calculated as
        required by 12 CFR § 1030.4.
      </LP>
    ),
  },
  {
    id: 'eft',
    number: 4,
    title: 'Electronic Fund Transfers (Regulation E)',
    body: (
      <>
        <LP>
          Electronic fund transfer services, including debit card transactions, online transfers, and ACH payments, are
          governed by the Electronic Fund Transfer Act (EFTA), 15 U.S.C. § 1693 et seq., and Regulation E (12 CFR Part
          1005). Your rights include:
        </LP>
        <LList
          items={[
            'Error resolution within 10 business days of your notice',
            'Liability limits for unauthorized transfers: $50 (reported within 2 business days), $500 (reported within 60 days)',
            'Right to receive periodic account statements',
          ]}
        />
      </>
    ),
  },
  {
    id: 'wire-transfers',
    number: 5,
    title: 'Wire Transfers (Regulation J / UCC Article 4A)',
    body: (
      <LP>
        Wire transfer services are governed by Regulation J (12 CFR Part 210), the Fedwire Funds Service operating
        procedures, and UCC Article 4A as adopted in New York (N.Y. U.C.C. § 4-A-101 et seq.). Alister Bank's Cut-off
        Time for same-day wire processing is 4:00 PM ET on business days. International wire transfers are also subject
        to SWIFT guidelines and applicable OFAC screening.
      </LP>
    ),
  },
  {
    id: 'bsa-aml',
    number: 6,
    title: 'BSA / AML Compliance & Reporting',
    body: (
      <>
        <LP>You agree that Alister Bank is required under the Bank Secrecy Act (BSA), 31 U.S.C. § 5311 et seq., to:</LP>
        <LList
          items={[
            'File Currency Transaction Reports (CTRs) for cash transactions exceeding $10,000 (31 CFR § 1020.311)',
            'File Suspicious Activity Reports (SARs) where required (31 CFR § 1020.320)',
            'Verify your identity under CIP rules and the FinCEN Customer Due Diligence (CDD) Rule (31 CFR § 1010.230)',
          ]}
        />
        <LP>
          Structuring transactions to evade these requirements is a federal crime under 31 U.S.C. § 5324.
        </LP>
      </>
    ),
  },
  {
    id: 'fdic',
    number: 7,
    title: 'FDIC Deposit Insurance',
    body: (
      <LP>
        Deposits at Alister Bank are insured by the Federal Deposit Insurance Corporation (FDIC) up to $250,000 per
        depositor, per ownership category, per insured institution, as provided by the Federal Deposit Insurance Act, 12
        U.S.C. § 1821. For accounts maintained in Indian Rupees, insurance coverage is calculated based on the USD
        equivalent at the prevailing exchange rate. FDIC insurance does not cover investments, mutual funds, or
        non-deposit products.
      </LP>
    ),
  },
  {
    id: 'esign',
    number: 8,
    title: 'Electronic Consent (E-SIGN Act)',
    body: (
      <LP>
        By opening an account electronically, you consent to receive disclosures, agreements, notices, and
        communications electronically, as authorized by the Electronic Signatures in Global and National Commerce Act
        (E-SIGN Act), 15 U.S.C. § 7001 et seq. You may withdraw this consent at any time by contacting us in writing;
        however, withdrawal may result in account closure.
      </LP>
    ),
  },
  {
    id: 'arbitration',
    number: 9,
    title: 'Arbitration Agreement',
    body: (
      <>
        <LP>PLEASE READ THIS SECTION CAREFULLY — IT AFFECTS YOUR LEGAL RIGHTS.</LP>
        <LP>
          Any dispute arising from these Terms or your account shall be resolved by binding individual arbitration
          administered by the American Arbitration Association (AAA) under its Consumer Arbitration Rules. This agreement
          is governed by the Federal Arbitration Act (FAA), 9 U.S.C. § 1 et seq.
        </LP>
        <LP>
          CLASS ACTION WAIVER: You agree that any arbitration shall be conducted on an individual basis only. You waive
          any right to bring a class action or participate in a class action lawsuit.
        </LP>
        <LP>
          Exception: Either party may bring claims in small claims court for disputes within that court's jurisdiction.
        </LP>
      </>
    ),
  },
  {
    id: 'liability',
    number: 10,
    title: 'Limitation of Liability',
    body: (
      <LP>
        To the maximum extent permitted by applicable federal law, Alister Bank's liability to you shall not exceed the
        total amount of fees paid by you to Alister Bank in the twelve (12) months prior to the claim. Alister Bank
        shall not be liable for any indirect, incidental, or consequential damages. Notwithstanding the foregoing,
        nothing in these Terms limits Alister Bank's liability as required by Regulation E, TISA, or the FCRA.
      </LP>
    ),
  },
  {
    id: 'termination',
    number: 11,
    title: 'Account Termination',
    body: (
      <>
        <LP>
          Alister Bank reserves the right to close your account at any time with 30 days written notice, or immediately
          in cases of:
        </LP>
        <LList
          items={[
            'Fraud, money laundering, or violation of BSA/AML obligations',
            'OFAC match or sanction list placement',
            'Breach of these Terms',
            'Government order or regulatory requirement',
          ]}
        />
        <LP>
          Upon closure, funds will be returned minus any outstanding fees, charges, or legally mandated holds.
        </LP>
      </>
    ),
  },
  {
    id: 'contact',
    number: 12,
    title: 'Contact',
    body: (
      <>
        <LP>
          {'Alister Bank, N.A. — Legal Department\n350 Park Avenue, 21st Floor\nNew York, NY 10022\nlegal@alisterbank.com\n1-800-425-4783'}
        </LP>
        <LP>To file a complaint with a federal regulator:</LP>
        <LList
          items={[
            'OCC Customer Assistance: 1-800-613-6743',
            'CFPB: 1-855-411-2372 | consumerfinance.gov/complaint',
            'FDIC Consumer Response Center: 1-877-275-3342',
          ]}
        />
      </>
    ),
  },
];

export default function TermsOfServicePage() {
  return (
    <PageTransition
      title="Terms of Service — Alister Bank"
      description="The Terms of Service governing Alister Bank, N.A. accounts, including governing law, eligibility, electronic transfers, FDIC insurance, arbitration and more."
    >
      <LegalLayout eyebrow="Legal" title="Terms of" highlight="Service" banner={BANNER} sections={SECTIONS} />
    </PageTransition>
  );
}
