import React from 'react';
import { motion } from 'framer-motion';
import { Landmark, Repeat, LineChart, PiggyBank, ShieldCheck, Coins } from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import SIPCalculator from '../../components/public/SIPCalculator';
import TiltCard from '../../components/public/TiltCard';
import { Section, SectionTitle, PageHero, RedButton } from '../../components/public/sections';
import { staggerContainer, fadeUp, inView } from '../../components/public/ui';

const PRODUCTS = [
  { icon: Landmark, name: 'Fixed Deposit', desc: 'Lock in assured returns up to 8.2% with flexible tenures from 7 days to 10 years.', tag: 'Up to 8.2%' },
  { icon: Repeat, name: 'Recurring Deposit', desc: 'Save a fixed amount every month and watch it grow at 6.5% – 7.5% p.a.', tag: '6.5% – 7.5%' },
  { icon: LineChart, name: 'Mutual Funds', desc: 'Start a SIP from just $500 across curated equity, debt and hybrid funds.', tag: 'From $500' },
  { icon: PiggyBank, name: 'National Pension System', desc: 'Build a retirement corpus with tax benefits and market-linked growth.', tag: 'Tax saving' },
  { icon: ShieldCheck, name: 'Public Provident Fund', desc: 'A 15-year, government-backed, tax-free savings instrument for the long term.', tag: '7.1% tax-free' },
  { icon: Coins, name: 'Sovereign Gold Bonds', desc: 'Own gold digitally with assured interest plus price appreciation.', tag: '2.5% + gold' },
];

export default function InvestmentsPage() {
  return (
    <PageTransition
      title="Investments — Alister Bank"
      description="Grow your wealth with fixed deposits, mutual fund SIPs, NPS, PPF and sovereign gold bonds — all in one place with smart calculators."
    >
      <PageHero
        eyebrow="Wealth"
        title="Grow Your Wealth with"
        highlight="Alister Investments"
        subtitle="From assured deposits to market-linked SIPs, build a portfolio that works as hard as you do."
      />

      {/* Product grid */}
      <Section>
        <SectionTitle eyebrow="Invest" title="Investment Products" />
        <motion.div variants={staggerContainer(0.1)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCTS.map((p) => (
            <motion.div key={p.name} variants={fadeUp}>
              <TiltCard max={7} className="h-full rounded-2xl al-glass border border-white/[0.08] p-7 hover:border-[#CC0000] transition-colors group">
                <div className="flex items-center justify-between mb-5">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
                    <p.icon size={26} style={{ color: '#FF3333' }} />
                  </div>
                  <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(204,0,0,0.15)', color: '#FF3333' }}>{p.tag}</span>
                </div>
                <h3 className="font-serif-display font-bold text-white text-xl mb-2">{p.name}</h3>
                <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>{p.desc}</p>
                <RedButton to="/open-account" className="w-full">Invest Now</RedButton>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* SIP calculator */}
      <Section>
        <SectionTitle eyebrow="Project Your Growth" title="SIP Growth Calculator" subtitle="See how a disciplined monthly investment can compound into long-term wealth." />
        <SIPCalculator />
      </Section>

      {/* Risk profile banner */}
      <Section>
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-3xl p-8 sm:p-12 text-center" style={{ background: 'linear-gradient(135deg, #1A0000, #0A0A0A 60%, #2D0000)', border: '1px solid rgba(204,0,0,0.25)' }}>
          <h3 className="font-serif-display font-bold text-white text-2xl sm:text-3xl mb-3">Not sure where to invest?</h3>
          <p className="text-base mb-7 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Take our 2-minute risk assessment and get a personalised portfolio recommendation tailored to your goals.
          </p>
          <RedButton to="/contact" large>Take Risk Assessment</RedButton>
        </motion.div>
      </Section>
    </PageTransition>
  );
}
