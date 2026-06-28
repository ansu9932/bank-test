import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, RefreshCw, Landmark, Smartphone, Receipt, Globe2 } from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import TiltCard from '../../components/public/TiltCard';
import { Section, SectionTitle, PageHero, RedButton } from '../../components/public/sections';
import { staggerContainer, fadeUp, inView } from '../../components/public/ui';

const METHODS = [
  { icon: Zap, name: 'IMPS', desc: 'Instant 24/7' },
  { icon: RefreshCw, name: 'NEFT', desc: 'Free, anytime' },
  { icon: Landmark, name: 'RTGS', desc: 'For large transfers' },
  { icon: Smartphone, name: 'UPI', desc: 'Zero charges' },
  { icon: Receipt, name: 'BBPS', desc: 'Bill payments' },
  { icon: Globe2, name: 'SWIFT', desc: 'International' },
];

const BILL_CATEGORIES = ['Electricity', 'Water', 'Gas', 'Mobile Recharge', 'DTH', 'Insurance', 'Credit Card', 'Broadband'];

const LIMITS = [
  ['IMPS', '$1', '$500,000', 'Free', 'Instant'],
  ['NEFT', '$1', 'No limit', 'Free', '30 min'],
  ['RTGS', '$200,000', 'No limit', '$25', '30 min'],
  ['UPI', '$1', '$100,000', 'Free', 'Instant'],
];

export default function PaymentsPage() {
  const [activeBill, setActiveBill] = useState('Electricity');

  return (
    <PageTransition
      title="Payments — Alister Bank"
      description="Move money your way with IMPS, NEFT, RTGS, UPI, BBPS bill payments and SWIFT international remittance — fast, secure and mostly free."
    >
      <PageHero
        eyebrow="Move Money"
        title="Payments, Done"
        highlight="Your Way"
        subtitle="Every rail you need — instant, secure and free on most transactions."
      />

      {/* Methods grid */}
      <Section>
        <SectionTitle eyebrow="Transfer Methods" title="Quick Payment Methods" />
        <motion.div variants={staggerContainer(0.08)} initial="hidden" whileInView="show" viewport={inView} className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          {METHODS.map((m) => (
            <motion.div key={m.name} variants={fadeUp}>
              <TiltCard max={9} className="rounded-2xl al-glass border border-white/[0.08] p-7 text-center hover:border-[#CC0000] transition-colors">
                <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
                  <m.icon size={26} style={{ color: '#FF3333' }} />
                </div>
                <h3 className="text-white font-semibold text-lg">{m.name}</h3>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{m.desc}</p>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Bill payments */}
      <Section>
        <SectionTitle eyebrow="BBPS" title="Pay Any Bill, Instantly" />
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="flex flex-wrap justify-center gap-3">
          {BILL_CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setActiveBill(c)}
              className="px-5 py-2.5 rounded-full text-sm font-medium transition-all"
              style={{
                background: activeBill === c ? 'linear-gradient(135deg, #CC0000, #FF3333)' : 'rgba(255,255,255,0.05)',
                color: '#fff',
                border: `1px solid ${activeBill === c ? 'transparent' : 'rgba(255,255,255,0.12)'}`,
              }}
            >
              {c}
            </button>
          ))}
        </motion.div>
        <p className="text-center mt-6 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Selected: <span className="font-semibold" style={{ color: '#FF3333' }}>{activeBill}</span> — pay in seconds with saved billers and auto-pay.
        </p>
      </Section>

      {/* Limits table */}
      <Section>
        <SectionTitle eyebrow="Know the Limits" title="Transfer Limits & Charges" />
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-2xl overflow-hidden border border-white/[0.08] overflow-x-auto">
          <table className="w-full text-left min-w-[560px]">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #CC0000, #990000)' }}>
                {['Method', 'Min', 'Max', 'Charges', 'Time'].map((h) => (
                  <th key={h} className="px-5 py-4 text-white text-sm font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LIMITS.map((row, i) => (
                <tr key={row[0]} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td className="px-5 py-4 text-white text-sm font-medium">{row[0]}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{row[1]}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{row[2]}</td>
                  <td className="px-5 py-4 text-sm font-semibold" style={{ color: '#FF3333' }}>{row[3]}</td>
                  <td className="px-5 py-4 text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{row[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </Section>

      {/* International remittance */}
      <Section>
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-3xl p-8 sm:p-12 grid lg:grid-cols-2 gap-8 items-center" style={{ background: 'linear-gradient(135deg, #1A0000, #0A0A0A 60%, #2D0000)', border: '1px solid rgba(204,0,0,0.25)' }}>
          <div>
            <h3 className="font-serif-display font-bold text-white text-2xl sm:text-3xl mb-3">Send Money Abroad with RemitNow</h3>
            <p className="text-base mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Live forex rates, instant currency conversion and transparent fees. Transfer to 100+ countries securely over SWIFT.
            </p>
            <RedButton to="/open-account" large>Start a Transfer</RedButton>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'rgba(204,0,0,0.15)', border: '1px solid rgba(204,0,0,0.4)' }}>
              <Globe2 size={40} style={{ color: '#FF3333' }} />
            </div>
          </div>
        </motion.div>
      </Section>
    </PageTransition>
  );
}
