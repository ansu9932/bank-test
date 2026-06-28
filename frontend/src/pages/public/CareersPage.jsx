import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MapPin, Briefcase, ArrowRight, FileCheck, ShieldCheck, ClipboardCheck } from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import { Section, SectionTitle, RedButton } from '../../components/public/sections';
import { staggerContainer, fadeUp, inView } from '../../components/public/ui';

const PERKS = [
  { emoji: '🏛️', title: 'Federal Benefits Package', text: 'Health, dental, and vision insurance. 401(k) with employer match. FSA/HSA accounts. Life insurance. All benefits comply with the Employee Retirement Income Security Act (ERISA).' },
  { emoji: '⚖️', title: 'Fair & Compliant Workplace', text: 'Alister Bank complies fully with the Fair Labor Standards Act (FLSA), the Americans with Disabilities Act (ADA), and Title VII of the Civil Rights Act. Zero tolerance for workplace discrimination.' },
  { emoji: '📈', title: 'Career Development', text: 'Annual performance reviews, tuition reimbursement, and internal mobility programs available to all full-time employees.' },
  { emoji: '🏠', title: 'Remote & Hybrid Options', text: 'Flexible work arrangements available for eligible roles, subject to applicable state labor laws.' },
  { emoji: '🛡️', title: 'Regulated & Stable', text: 'As a federally chartered National Bank supervised by the OCC, we offer the job security of a regulated financial institution.' },
  { emoji: '🌍', title: 'Global Corporate Exposure', text: 'Work on international financial programs including our India Corporate Partnership operations.' },
];

const POSITIONS = [
  { title: 'Senior Compliance Officer', dept: 'Risk & Compliance', location: 'New York, NY (Hybrid)', type: 'Full-Time', level: 'Senior', note: 'Must pass FINRA background check. Federal banking compliance experience required (BSA/AML, FinCEN reporting).' },
  { title: 'AML / BSA Analyst', dept: 'Financial Crimes', location: 'New York, NY (On-site)', type: 'Full-Time', level: 'Mid-Level', note: 'CAMS certification preferred. Experience with FinCEN SAR/CTR filing required.' },
  { title: 'India Operations Coordinator', dept: 'International Operations', location: 'Remote (US-Based)', type: 'Full-Time', level: 'Mid-Level', note: 'Must be authorized to work in the US. FEMA and international banking compliance knowledge preferred.' },
  { title: 'React Frontend Engineer', dept: 'Technology', location: 'Remote (US-Based)', type: 'Full-Time', level: 'Mid-Level', note: 'React 18, Tailwind CSS, Framer Motion. Banking app UI experience preferred.' },
  { title: 'KYC / CDD Specialist', dept: 'Onboarding', location: 'New York, NY (Hybrid)', type: 'Full-Time', level: 'Associate', note: "Experience with Customer Due Diligence (CDD) per FinCEN's 2016 CDD Rule. PATRIOT Act verification procedures required." },
  { title: 'Treasury & Funds Transfer Analyst', dept: 'Treasury', location: 'New York, NY (On-site)', type: 'Full-Time', level: 'Mid-Level', note: 'UCC Article 4A and Regulation J (Fedwire) familiarity required. SWIFT experience a plus.' },
];

const LEGAL = [
  'Alister Bank, N.A. is an Equal Opportunity / Affirmative Action Employer. We do not discriminate on the basis of race, color, religion, sex, national origin, age, disability, veteran status, sexual orientation, gender identity, or any other protected status under applicable federal, state, or local law, including Title VII of the Civil Rights Act of 1964, the Age Discrimination in Employment Act of 1967 (ADEA), and the Americans with Disabilities Act (ADA).',
  'Employment at Alister Bank is at-will unless otherwise specified in a written employment agreement. All employees must complete Form I-9 employment eligibility verification as required by the Immigration Reform and Control Act (IRCA) of 1986.',
  'Alister Bank participates in E-Verify. Federal law requires all employers to verify the identity and employment eligibility of all persons hired to work in the United States.',
  'If you require a reasonable accommodation to apply for a position, please contact hr@alisterbank.com. Alister Bank complies with all applicable state and local laws governing non-discrimination in employment.',
];

const STEPS = [
  { icon: FileCheck, title: 'Submit Application', text: 'Apply online. No paper required.' },
  { icon: ShieldCheck, title: 'Background & Compliance Check', text: 'All banking roles require federal background screening per OCC Guidance.' },
  { icon: ClipboardCheck, title: 'Offer & Onboarding', text: 'Receive your offer letter and complete Form I-9 and W-4 before your start date.' },
];

export default function CareersPage() {
  return (
    <PageTransition
      title="Careers — Alister Bank"
      description="Join Alister Bank, N.A., a US-chartered National Bank. Explore open positions in compliance, financial crimes, technology, treasury and operations."
    >
      {/* Hero */}
      <section className="relative overflow-hidden al-hero-bg">
        <div
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[160px] al-glow-pulse"
          style={{ background: 'radial-gradient(circle, rgba(204,0,0,0.22), transparent 70%)' }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-16 pb-12 lg:pt-24 lg:pb-16 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="font-serif-display font-bold text-white text-4xl sm:text-5xl lg:text-6xl leading-tight"
          >
            Build the Future of <span className="text-al-gradient">Banking</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-6 text-base sm:text-lg max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            Join Alister Bank — a US-chartered institution delivering next-generation financial services globally.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.25 }} className="mt-9">
            <a
              href="#open-positions"
              className="inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white px-7 py-4 text-base transition-all active:scale-95 hover:scale-[1.03]"
              style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 28px rgba(204,0,0,0.45)' }}
            >
              View Open Positions <ArrowRight size={18} />
            </a>
          </motion.div>
        </div>

        {/* IRCA notice bar */}
        <div className="relative border-y" style={{ background: 'rgba(153,0,0,0.25)', borderColor: 'rgba(204,0,0,0.4)' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-3">
            <p className="text-center text-xs sm:text-sm font-medium text-white">
              Alister Bank is an Equal Opportunity Employer. All positions are subject to federal employment eligibility verification under the Immigration Reform and Control Act (IRCA).
            </p>
          </div>
        </div>
      </section>

      {/* Why work here */}
      <Section>
        <SectionTitle eyebrow="Life at Alister" title="Why Work at Alister Bank" />
        <motion.div variants={staggerContainer(0.1)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PERKS.map((p) => (
            <motion.div key={p.title} variants={fadeUp} className="rounded-2xl al-glass border border-white/[0.08] p-7 hover:border-[#CC0000] transition-colors">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-5" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
                {p.emoji}
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">{p.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{p.text}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Open positions */}
      <Section id="open-positions" className="scroll-mt-24">
        <SectionTitle eyebrow="We're Hiring" title="Open Positions" />
        <motion.div variants={staggerContainer(0.08)} initial="hidden" whileInView="show" viewport={inView} className="space-y-4">
          {POSITIONS.map((job) => (
            <motion.div
              key={job.title}
              variants={fadeUp}
              className="relative rounded-2xl al-glass border border-white/[0.08] p-6 sm:p-7 overflow-hidden hover:border-[#CC0000] transition-colors flex flex-col lg:flex-row lg:items-center gap-5"
            >
              <span className="absolute left-0 top-0 h-full w-1" style={{ background: 'linear-gradient(180deg, #FF3333, #990000)' }} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h3 className="text-white font-bold text-lg sm:text-xl">{job.title}</h3>
                  <span className="text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full" style={{ background: 'rgba(204,0,0,0.15)', color: '#FF3333' }}>
                    {job.dept}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm mb-3" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <span className="inline-flex items-center gap-1.5"><MapPin size={14} style={{ color: '#FF3333' }} /> {job.location}</span>
                  <span className="inline-flex items-center gap-1.5"><Briefcase size={14} style={{ color: '#FF3333' }} /> {job.type}</span>
                  <span>Level: {job.level}</span>
                </div>
                <p className="text-sm leading-relaxed max-w-3xl" style={{ color: 'rgba(255,255,255,0.5)' }}>{job.note}</p>
              </div>
              <div className="shrink-0">
                <RedButton to="/contact">Apply Now</RedButton>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Legal compliance statements */}
      <section className="relative" style={{ background: '#0E0E0E', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-8 lg:px-12 py-14 lg:py-20 text-center">
          <SectionTitle eyebrow="Equal Opportunity" title="Legal Compliance Statements" />
          <div className="space-y-5">
            {LEGAL.map((para, i) => (
              <motion.p
                key={i}
                initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={inView} transition={{ duration: 0.5, delay: i * 0.05 }}
                className="text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}
              >
                {para}
              </motion.p>
            ))}
          </div>
        </div>
      </section>

      {/* Application process */}
      <Section>
        <SectionTitle eyebrow="How to Join" title="Application Process" />
        <div className="relative grid md:grid-cols-3 gap-10 md:gap-6">
          <div className="hidden md:block absolute top-10 left-[16%] right-[16%] h-px">
            <svg width="100%" height="2"><line x1="0" y1="1" x2="100%" y2="1" stroke="#CC0000" strokeWidth="2" className="al-dash-line" /></svg>
          </div>
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} transition={{ delay: i * 0.15 }}
              className="relative text-center flex flex-col items-center"
            >
              <div className="relative mb-5">
                <div className="absolute inset-0 rounded-full al-pulse-ring" />
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, #CC0000, #990000)' }}>
                  <s.icon size={30} />
                </div>
                <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2" style={{ background: '#0A0A0A', borderColor: '#FF3333', color: '#FF3333' }}>
                  {i + 1}
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-1.5">{s.title}</h3>
              <p className="text-sm max-w-[240px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{s.text}</p>
            </motion.div>
          ))}
        </div>
      </Section>
    </PageTransition>
  );
}
