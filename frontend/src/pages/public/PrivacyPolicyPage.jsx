import React from 'react';
import PageTransition from '../../components/public/PageTransition';
import LegalLayout, { LP, LList } from '../../components/public/LegalLayout';

const BANNER =
  'Effective Date: January 1, 2025 | Last Updated: May 1, 2025\nThis Privacy Policy is provided pursuant to the Gramm-Leach-Bliley Act (GLBA), 15 U.S.C. § 6801 et seq.';

const SECTIONS = [
  {
    id: 'who-we-are',
    number: 1,
    title: 'Who We Are',
    body: (
      <LP>
        Alister Bank, N.A. ("Alister Bank," "we," "us," or "our") is a nationally chartered bank supervised by the
        Office of the Comptroller of the Currency (OCC), a bureau of the U.S. Department of the Treasury. Our principal
        place of business is 350 Park Avenue, 21st Floor, New York, NY 10022.
      </LP>
    ),
  },
  {
    id: 'scope',
    number: 2,
    title: 'Scope (GLBA Notice)',
    body: (
      <LP>
        This Privacy Policy constitutes our Annual Privacy Notice as required under the Gramm-Leach-Bliley Act (GLBA),
        15 U.S.C. § 6801–6809, and its implementing regulations (12 CFR Part 1016 — Regulation P). It describes how
        Alister Bank collects, uses, shares, and protects the nonpublic personal information (NPI) of our customers and
        former customers.
      </LP>
    ),
  },
  {
    id: 'info-we-collect',
    number: 3,
    title: 'Information We Collect',
    body: (
      <>
        <LP>We collect the following categories of nonpublic personal information:</LP>
        <LList
          items={[
            'Information you provide: Name, address, Social Security Number (SSN), date of birth, government-issued ID, income, and employment information collected during account opening (required under the USA PATRIOT Act, 31 U.S.C. § 5318(l), and FinCEN\'s Customer Identification Program rules).',
            'Transaction information: Account balances, payment history, wire transfers, and debit/credit activity.',
            'Technical information: IP address, browser type, device identifiers, and cookies collected when you use our website or mobile app.',
            'Third-party information: Credit reports obtained from consumer reporting agencies under the Fair Credit Reporting Act (FCRA), 15 U.S.C. § 1681.',
          ]}
        />
      </>
    ),
  },
  {
    id: 'how-we-use',
    number: 4,
    title: 'How We Use Your Information',
    body: (
      <>
        <LP>We use your nonpublic personal information to:</LP>
        <LList
          items={[
            'Open, maintain, and service your account',
            'Verify your identity as required under the Customer Identification Program (CIP) rules (31 CFR § 1020.220)',
            'Detect and prevent fraud and money laundering per the Bank Secrecy Act (BSA), 31 U.S.C. § 5311 et seq.',
            'Report to FinCEN as required (Suspicious Activity Reports / Currency Transaction Reports)',
            'Comply with applicable federal and state law',
            'Send you account-related communications',
          ]}
        />
      </>
    ),
  },
  {
    id: 'info-sharing',
    number: 5,
    title: 'Information Sharing (GLBA Opt-Out)',
    body: (
      <>
        <LP>
          Under the Gramm-Leach-Bliley Act, you have the right to limit certain sharing of your information. We DO NOT
          share your information with non-affiliated third parties for their marketing purposes.
        </LP>
        <LP>We DO share with:</LP>
        <LList
          items={[
            'Our service providers under written confidentiality agreements',
            'Federal regulators (OCC, Federal Reserve, FDIC, FinCEN) as required',
            'Law enforcement pursuant to valid legal process (subpoena, court order)',
            'Credit bureaus as permitted under the FCRA',
          ]}
        />
        <LP>To opt out of any permissible sharing, contact us at: privacy@alisterbank.com or 1-800-425-4783.</LP>
      </>
    ),
  },
  {
    id: 'california',
    number: 6,
    title: 'California Residents (CCPA)',
    body: (
      <>
        <LP>
          If you are a California resident, the California Consumer Privacy Act (CCPA), Cal. Civ. Code § 1798.100 et
          seq., grants you specific rights:
        </LP>
        <LList
          items={[
            'Right to Know: Request disclosure of the categories and specific pieces of personal information we collect about you.',
            'Right to Delete: Request deletion of your personal information, subject to legal retention obligations.',
            'Right to Non-Discrimination: We will not discriminate against you for exercising your CCPA rights.',
          ]}
        />
        <LP>
          Note: Much of the personal information we collect is exempt from CCPA under the GLBA financial information
          exemption (Cal. Civ. Code § 1798.145(e)).
        </LP>
        <LP>To submit a CCPA request: privacy@alisterbank.com</LP>
      </>
    ),
  },
  {
    id: 'data-security',
    number: 7,
    title: 'Data Security',
    body: (
      <>
        <LP>
          Alister Bank implements administrative, technical, and physical safeguards as required by the GLBA Safeguards
          Rule (16 CFR Part 314, as amended by the FTC in 2023) and OCC security guidelines (12 CFR Part 30, Appendix
          B). These include:
        </LP>
        <LList
          items={[
            '256-bit AES encryption for data at rest',
            'TLS 1.3 for data in transit',
            'Multi-factor authentication for all system access',
            'Annual third-party penetration testing',
            "Incident response plan as required under the OCC's Computer-Security Incident Notification rule (12 CFR Part 53)",
          ]}
        />
      </>
    ),
  },
  {
    id: 'data-retention',
    number: 8,
    title: 'Data Retention',
    body: (
      <>
        <LP>
          We retain your personal information for as long as your account is active and for the periods required by
          law, including:
        </LP>
        <LList
          items={[
            '5 years: BSA/AML records (31 CFR § 1020.410)',
            '5 years: Wire transfer records (31 CFR § 1020.410(a))',
            '2 years: Electronic fund transfer records (Regulation E, 12 CFR § 1005.13)',
            '25 months: FCRA adverse action records (12 CFR § 1022.25)',
          ]}
        />
      </>
    ),
  },
  {
    id: 'childrens-privacy',
    number: 9,
    title: "Children's Privacy",
    body: (
      <LP>
        Alister Bank does not knowingly collect personal information from persons under the age of 13. Our services are
        not directed to children as defined under the Children's Online Privacy Protection Act (COPPA), 15 U.S.C. §
        6501.
      </LP>
    ),
  },
  {
    id: 'contact-complaints',
    number: 10,
    title: 'Contact & Complaints',
    body: (
      <>
        <LP>
          {'Privacy Officer: Alister Bank, N.A.\n350 Park Avenue, 21st Floor, New York, NY 10022\nEmail: privacy@alisterbank.com\nPhone: 1-800-425-4783'}
        </LP>
        <LP>You may also file a complaint with:</LP>
        <LList
          items={[
            'Office of the Comptroller of the Currency (OCC): www.helpwithmybank.gov | 1-800-613-6743',
            'Consumer Financial Protection Bureau (CFPB): www.consumerfinance.gov/complaint | 1-855-411-2372',
          ]}
        />
      </>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <PageTransition
      title="Privacy Policy — Alister Bank"
      description="Alister Bank, N.A. Privacy Policy provided pursuant to the Gramm-Leach-Bliley Act (GLBA). Learn how we collect, use, share and protect your information."
    >
      <LegalLayout eyebrow="Legal" title="Privacy" highlight="Policy" banner={BANNER} sections={SECTIONS} />
    </PageTransition>
  );
}
