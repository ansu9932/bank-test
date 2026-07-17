import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Wallet, Building2, Crown, ShieldAlert } from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import FAQAccordion from '../../components/public/FAQAccordion';
import { Section, SectionTitle, PageHero, RedButton } from '../../components/public/sections';
import { staggerContainer, fadeUp, inView, formatINR } from '../../components/public/ui';

const ACCOUNTS = [
  {
    icon: Wallet,
    name: 'Savings Account',
    badge: 'Most Popular',
    desc: 'Grow your money with attractive interest and everyday banking essentials.',
    benefits: ['Up to 7% interest p.a.', 'Free RuPay/VISA debit card', 'Free NetBanking & mobile app', 'UPI & instant transfers'],
    minBalance: '$5,298',
    eligibility: 'India-based, invited under the Corporate Partnership Program',
    cta: 'Request Account Access',
  },
  {
    icon: Building2,
    name: 'Current Account',
    badge: 'For Business',
    desc: 'High-limit banking for businesses, with overdraft and bulk payments.',
    benefits: ['High transaction limits', 'Overdraft facility', 'Bulk & vendor payments', 'GST-ready statements'],
    minBalance: '$10,598',
    eligibility: 'India-based businesses, invited under the Corporate Partnership Program',
    cta: 'Request Account Access',
  },
  {
    icon: Crown,
    name: 'Business Elite Account',
    badge: 'Premium',
    desc: 'Premium-tier business banking with priority service and elevated limits.',
    benefits: ['Priority relationship manager', 'Highest transaction limits', 'Overdraft & bulk payments', 'Premium concierge support'],
    minBalance: '$20,744.90',
    eligibility: 'India-based businesses, invited under the Corporate Partnership Program',
    cta: 'Request Account Access',
  },
];

const COMPARE_ROWS = [
  ['Eligible Users', 'India (Invited Only)', 'India (Invited Only)', 'India (Invited Only)'],
  ['Minimum Balance', '$5,298', '$10,598', '$20,744.90'],
  ['Interest Rate', '4% – 7% p.a.', 'Non-interest bearing', 'Non-interest bearing'],
  ['Transaction Limits', 'Standard', 'High / Bulk supported', 'Highest / Priority'],
  ['Overdraft Facility', false, true, true],
];

const KYC_ITEMS = [
  { q: 'Proof of Identity', a: 'Aadhaar card, PAN card, Passport, Voter ID or Driving Licence — any one government-issued photo ID.' },
  { q: 'Proof of Address', a: 'Aadhaar, utility bill (within 3 months), rent agreement or passport showing your current address.' },
  { q: 'PAN Card', a: 'A valid PAN is mandatory for opening any account and for tax compliance under Indian regulations.' },
  { q: 'Photograph', a: 'A recent passport-size photograph, or a live selfie captured during the video KYC step.' },
];

export default function AccountsPage() {
  return (
    <PageTransition
      title="Accounts — Alister Bank"
      description="Savings and Current accounts offered to invited participants under the Alister Bank Corporate Partnership Program."
    >
      <PageHero
        eyebrow="Personal & Business"
        title="Choose Your"
        highlight="Account Type"
        subtitle="Savings or current — every Alister account is offered under our US-regulated Corporate Partnership Program."
      />

      {/* Restricted-access notice + minimum opening deposit */}
      <Section className="!py-10 lg:!py-12 space-y-5">
        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="rounded-2xl p-6 sm:p-7 flex items-start gap-4"
          style={{ background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.4)' }}
        >
          <span className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(204,0,0,0.2)' }}>
            <ShieldAlert size={22} style={{ color: '#FF3333' }} />
          </span>
          <p className="text-sm sm:text-base font-semibold text-white leading-relaxed">
            Account opening is restricted to selected users approved under the Alister Bank Corporate Partnership Program.
            Public applications are not accepted. Please contact your project coordinator for access.
          </p>
        </motion.div>
      </Section>

      {/* Account type cards */}
      <Section className="!pt-0">
        <motion.div variants={staggerContainer(0.12)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {ACCOUNTS.map((a) => (
            <motion.div
              key={a.name}
              variants={fadeUp}
              className="relative rounded-3xl al-glass border border-white/[0.08] p-7 flex flex-col hover:border-[#CC0000] transition-colors"
            >
              <span className="absolute top-5 right-5 text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full" style={{ background: 'rgba(204,0,0,0.15)', color: '#FF3333' }}>
                {a.badge}
              </span>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
                <a.icon size={26} style={{ color: '#FF3333' }} />
              </div>
              <h3 className="font-serif-display font-bold text-white text-2xl mb-2">{a.name}</h3>
              <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>{a.desc}</p>
              <ul className="space-y-2.5 mb-6 flex-1">
                {a.benefits.map((b) => (
                  <li key={b} className="flex items-center gap-2.5 text-sm text-white/80">
                    <Check size={16} style={{ color: '#FF3333' }} /> {b}
                  </li>
                ))}
              </ul>
              <div className="rounded-xl px-4 py-3 mb-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Minimum Balance Required</p>
                <p className="text-base font-bold mt-0.5" style={{ color: '#FF3333' }}>{a.minBalance}</p>
              </div>
              <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                <span className="text-white/70 font-medium">Eligibility:</span> {a.eligibility}
              </p>
              <RedButton to="/open-account" className="w-full">{a.cta}</RedButton>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Comparison table */}
      <Section>
        <SectionTitle eyebrow="Side by Side" title="Compare All Accounts" />
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-2xl overflow-hidden border border-white/[0.08] overflow-x-auto">
          <table className="w-full text-left min-w-[640px]">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #CC0000, #990000)' }}>
                <th className="px-5 py-4 text-white text-sm font-semibold">Feature</th>
                <th className="px-5 py-4 text-white text-sm font-semibold">Savings Account</th>
                <th className="px-5 py-4 text-white text-sm font-semibold">Current Account</th>
                <th className="px-5 py-4 text-white text-sm font-semibold">Business Elite Account</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, i) => (
                <tr key={row[0]} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td className="px-5 py-4 text-white text-sm font-medium">{row[0]}</td>
                  {row.slice(1).map((cell, j) => (
                    <td key={j} className="px-5 py-4 text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                      {cell === true ? <span className="inline-flex items-center gap-1.5"><Check size={18} style={{ color: '#FF3333' }} /> Yes</span> : cell === false ? <span className="inline-flex items-center gap-1.5 text-white/40"><X size={18} className="text-white/25" /> No</span> : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </Section>

      {/* KYC + Calculator */}
      <Section className="grid lg:grid-cols-2 gap-12 items-start">
        <div>
          <SectionTitle eyebrow="Documents" title="What You'll Need" align="left" />
          <FAQAccordion items={KYC_ITEMS} />
        </div>
        <div>
          <SectionTitle eyebrow="Plan Ahead" title="Deposit Calculator" align="left" />
          <DepositCalculator />
        </div>
      </Section>
    </PageTransition>
  );
}

function DepositCalculator() {
  const [amount, setAmount] = useState(100000);
  const [tenure, setTenure] = useState(5);
  const rate = 7.0;

  const { interest, maturity } = useMemo(() => {
    // Simple compound interest, compounded annually.
    const m = amount * Math.pow(1 + rate / 100, tenure);
    return { interest: m - amount, maturity: m };
  }, [amount, tenure]);

  return (
    <div className="rounded-3xl al-glass border border-white/[0.08] p-6 sm:p-8 space-y-7">
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>Deposit Amount</span>
          <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ color: '#FF3333', background: 'rgba(204,0,0,0.12)' }}>{formatINR(amount)}</span>
        </div>
        <input type="range" className="al-range" min={10000} max={2000000} step={10000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Deposit Amount" />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>Tenure</span>
          <span className="text-sm font-bold px-3 py-1 rounded-lg" style={{ color: '#FF3333', background: 'rgba(204,0,0,0.12)' }}>{tenure} {tenure === 1 ? 'year' : 'years'}</span>
        </div>
        <input type="range" className="al-range" min={1} max={10} step={1} value={tenure} onChange={(e) => setTenure(Number(e.target.value))} aria-label="Tenure" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl px-4 py-4 text-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Interest Earned</p>
          <p className="text-lg font-bold mt-1" style={{ color: '#FF3333' }}>{formatINR(interest)}</p>
        </div>
        <div className="rounded-xl px-4 py-4 text-center" style={{ background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.25)' }}>
          <p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Maturity Amount</p>
          <p className="text-lg font-bold text-white mt-1">{formatINR(maturity)}</p>
        </div>
      </div>
      <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>Illustrative at {rate}% p.a. compounded annually.</p>
    </div>
  );
}
