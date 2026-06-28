import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, User, Home, Car, Coins, GraduationCap } from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import EMICalculator from '../../components/public/EMICalculator';
import TiltCard from '../../components/public/TiltCard';
import { Section, SectionTitle, PageHero, RedButton } from '../../components/public/sections';
import { staggerContainer, fadeUp, inView } from '../../components/public/ui';

const LOANS = [
  { icon: User, name: 'Personal Loan', amount: '$50,000 – $4,000,000', rate: 'From 10.99% p.a.', tenure: '12 – 60 months', note: 'Approval in 24 hours' },
  { icon: Home, name: 'Home Loan', amount: 'Up to $50,000,000', rate: 'From 8.5% p.a.', tenure: 'Up to 30 years', note: 'Tax benefits u/s 80C & 24B' },
  { icon: Car, name: 'Car Loan', amount: 'Up to $3,000,000', rate: 'From 8.75% p.a.', tenure: 'Up to 7 years', note: '100% on-road funding' },
  { icon: Coins, name: 'Gold Loan', amount: 'Per gram value', rate: 'From 9.5% p.a.', tenure: 'Flexible', note: 'Instant disbursement' },
  { icon: GraduationCap, name: 'Education Loan', amount: 'Up to $2,000,000', rate: 'From 9.0% p.a.', tenure: 'Up to 15 years', note: 'India + abroad, moratorium' },
];

export default function LoansPage() {
  return (
    <PageTransition
      title="Loans — Alister Bank"
      description="Personal, home, car, gold and education loans with competitive rates from 8.5% p.a., quick approvals and a transparent EMI calculator."
    >
      <PageHero
        eyebrow="Borrow Smarter"
        title="Get the Loan You"
        highlight="Deserve"
        subtitle="Competitive rates, transparent terms and approvals in as little as 24 hours."
      >
        <RedButton to="/open-account" large>Apply Now</RedButton>
      </PageHero>

      {/* Loan products */}
      <Section>
        <SectionTitle eyebrow="Our Loans" title="A Loan for Every Goal" />
        <motion.div variants={staggerContainer(0.1)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {LOANS.map((l) => (
            <motion.div key={l.name} variants={fadeUp}>
              <TiltCard max={7} className="h-full rounded-2xl al-glass border border-white/[0.08] p-7 hover:border-[#CC0000] transition-colors">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
                  <l.icon size={26} style={{ color: '#FF3333' }} />
                </div>
                <h3 className="font-serif-display font-bold text-white text-xl mb-4">{l.name}</h3>
                <dl className="space-y-2 text-sm">
                  <Row k="Amount" v={l.amount} />
                  <Row k="Rate" v={l.rate} accent />
                  <Row k="Tenure" v={l.tenure} />
                </dl>
                <p className="mt-4 text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(204,0,0,0.12)', color: '#FF3333' }}>
                  <CheckCircle2 size={13} /> {l.note}
                </p>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* EMI calculator */}
      <Section>
        <SectionTitle eyebrow="Plan Your Loan" title="EMI Calculator" subtitle="Drag the sliders to see your monthly EMI, total interest and total payment instantly." />
        <EMICalculator />
      </Section>

      {/* Eligibility */}
      <Section>
        <SectionTitle eyebrow="Check Instantly" title="Are You Eligible?" />
        <EligibilityChecker />
      </Section>
    </PageTransition>
  );
}

function Row({ k, v, accent }) {
  return (
    <div className="flex items-center justify-between">
      <dt style={{ color: 'rgba(255,255,255,0.5)' }}>{k}</dt>
      <dd className="font-semibold" style={{ color: accent ? '#FF3333' : '#fff' }}>{v}</dd>
    </div>
  );
}

function EligibilityChecker() {
  const [age, setAge] = useState('');
  const [income, setIncome] = useState('');
  const [employment, setEmployment] = useState('salaried');
  const [result, setResult] = useState(null);

  const check = (e) => {
    e.preventDefault();
    const a = Number(age);
    const inc = Number(income);
    const eligible = a >= 21 && a <= 60 && inc >= 25000;
    setResult({
      eligible,
      msg: eligible
        ? `Great news! Based on your profile you may be eligible for up to ${formatLimit(inc, employment)}.`
        : 'Based on the details provided you may not qualify right now. Try adjusting income or contact us for options.',
    });
  };

  return (
    <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-3xl al-glass border border-white/[0.08] p-6 sm:p-8 grid lg:grid-cols-2 gap-8 items-center">
      <form onSubmit={check} className="space-y-5">
        <Field label="Age">
          <input type="number" required min="18" max="75" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g. 30" className="al-input" />
        </Field>
        <Field label="Monthly Income ($)">
          <input type="number" required min="0" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="e.g. 60000" className="al-input" />
        </Field>
        <Field label="Employment Type">
          <select value={employment} onChange={(e) => setEmployment(e.target.value)} className="al-input">
            <option value="salaried">Salaried</option>
            <option value="self-employed">Self-employed</option>
            <option value="business">Business owner</option>
          </select>
        </Field>
        <button type="submit" className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold text-white" style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 24px rgba(204,0,0,0.4)' }}>
          Check Eligibility
        </button>
      </form>

      <div className="flex items-center justify-center min-h-[180px]">
        {result ? (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center rounded-2xl p-7 w-full" style={{ background: result.eligible ? 'rgba(204,0,0,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${result.eligible ? 'rgba(204,0,0,0.4)' : 'rgba(255,255,255,0.12)'}` }}>
            {result.eligible ? <CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: '#FF3333' }} /> : <XCircle size={48} className="mx-auto mb-4 text-white/40" />}
            <p className={`font-semibold text-lg mb-2 ${result.eligible ? '' : 'text-white/70'}`} style={result.eligible ? { color: '#FF3333' } : {}}>
              {result.eligible ? 'You may be eligible!' : 'Not eligible yet'}
            </p>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>{result.msg}</p>
            {result.eligible && <div className="mt-5"><RedButton to="/open-account">Apply Now</RedButton></div>}
          </motion.div>
        ) : (
          <p className="text-sm text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Fill in your details to see an instant indicative eligibility result.
          </p>
        )}
      </div>

      <style>{`
        .al-input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.75rem;
          padding: 0.75rem 1rem;
          color: #fff;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .al-input:focus { border-color: #CC0000; }
        .al-input::placeholder { color: rgba(255,255,255,0.35); }
        .al-input option { background: #1A1A1A; }
      `}</style>
    </motion.div>
  );
}

function formatLimit(income, employment) {
  const multiplier = employment === 'salaried' ? 24 : 18;
  const limit = income * multiplier;
  if (limit >= 1e6) return '$' + (limit / 1e6).toFixed(1) + 'M';
  if (limit >= 1e3) return '$' + (limit / 1e3).toFixed(0) + 'K';
  return '$' + Math.round(limit).toLocaleString('en-US');
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      {children}
    </label>
  );
}
