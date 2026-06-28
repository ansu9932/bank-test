import React from 'react';
import { motion } from 'framer-motion';
import { Check, X, AlertTriangle, Phone, CreditCard } from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import TiltCard from '../../components/public/TiltCard';
import { Section, SectionTitle, PageHero, RedButton } from '../../components/public/sections';
import { staggerContainer, fadeUp, inView } from '../../components/public/ui';

const CARDS = [
  {
    name: 'Classic Black',
    network: 'VISA · RuPay',
    fee: 'FREE with savings account',
    gradient: 'linear-gradient(145deg, #1A1A1A, #0A0A0A)',
    features: ['5 free ATM withdrawals / month', 'Contactless tap & pay', 'Daily limit $50,000', 'Zero liability on fraud'],
  },
  {
    name: 'Premium Platinum',
    network: 'VISA Signature',
    fee: '$999 annual fee',
    gradient: 'linear-gradient(145deg, #2D2D2D, #1A0000, #2D0000)',
    premium: true,
    features: ['Airport lounge access', '$200,000 daily limit', 'Complimentary travel insurance', '24/7 concierge service'],
  },
];

const COMPARE = [
  ['Annual Fee', 'Free', '$999'],
  ['Daily ATM Limit', '$50,000', '$200,000'],
  ['Lounge Access', false, true],
  ['Travel Insurance', false, true],
  ['Contactless', true, true],
  ['Reward Points', '1x', '4x'],
  ['Concierge', false, true],
];

const STEPS = ['Select your card', 'Fill a short form', 'Get instant virtual card', 'Physical delivery in 5 days'];

function CardFace({ card }) {
  return (
    <div
      className="relative w-full max-w-[360px] mx-auto h-[220px] rounded-3xl p-6 flex flex-col justify-between overflow-hidden"
      style={{ background: card.gradient, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 24px 60px rgba(204,0,0,0.3)' }}
    >
      {card.premium && <div className="absolute inset-0 al-shimmer pointer-events-none" />}
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl" style={{ background: 'rgba(204,0,0,0.25)' }} />
      <div className="relative flex items-center justify-between">
        <span className="font-bold tracking-widest text-white text-sm">ALISTER BANK</span>
        <CreditCard size={20} className="text-white/70" />
      </div>
      <div className="relative">
        <div className="w-11 h-8 rounded-md mb-3" style={{ background: 'linear-gradient(135deg, #f5d488, #c9a24b)' }} />
        <p className="font-mono tracking-[0.18em] text-white text-base">•••• •••• •••• {card.premium ? '8800' : '4521'}</p>
      </div>
      <div className="relative flex items-center justify-between text-white/80 text-xs">
        <span className="uppercase tracking-widest">{card.name}</span>
        <span className="font-semibold">{card.network}</span>
      </div>
    </div>
  );
}

export default function CardsPage() {
  return (
    <PageTransition
      title="Cards — Alister Bank"
      description="Explore Alister Bank debit cards — Classic Black free with your savings account, or Premium Platinum with lounge access and travel insurance."
    >
      <PageHero eyebrow="Debit Cards" title="Cards That" highlight="Carry Weight">
        {/* 3D rotating showcase */}
        <div className="flex justify-center items-center gap-4 mt-4 [perspective:1200px]">
          <motion.div animate={{ rotateY: [-10, 10, -10] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} className="hidden sm:block w-40 opacity-60 scale-90 -rotate-6">
            <CardFace card={CARDS[0]} />
          </motion.div>
          <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} className="w-72 z-10">
            <CardFace card={CARDS[1]} />
          </motion.div>
          <motion.div animate={{ rotateY: [10, -10, 10] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} className="hidden sm:block w-40 opacity-60 scale-90 rotate-6">
            <CardFace card={CARDS[0]} />
          </motion.div>
        </div>
      </PageHero>

      {/* Card details */}
      <Section>
        <SectionTitle eyebrow="The Lineup" title="Pick Your Perfect Card" />
        <motion.div variants={staggerContainer(0.12)} initial="hidden" whileInView="show" viewport={inView} className="grid lg:grid-cols-2 gap-8">
          {CARDS.map((c) => (
            <motion.div key={c.name} variants={fadeUp}>
              <TiltCard max={6} className="rounded-3xl al-glass border border-white/[0.08] p-7 hover:border-[#CC0000] transition-colors h-full">
                <div className="mb-6"><CardFace card={c} /></div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-serif-display font-bold text-white text-2xl">{c.name}</h3>
                  <span className="text-sm font-semibold px-3 py-1 rounded-full" style={{ background: 'rgba(204,0,0,0.15)', color: '#FF3333' }}>{c.fee}</span>
                </div>
                <ul className="space-y-2.5 mb-6">
                  {c.features.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-white/80">
                      <Check size={16} style={{ color: '#FF3333' }} /> {f}
                    </li>
                  ))}
                </ul>
                <RedButton to="/open-account" className="w-full">Get This Card</RedButton>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Comparison */}
      <Section>
        <SectionTitle eyebrow="Compare" title="Classic vs Platinum" />
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-2xl overflow-hidden border border-white/[0.08] overflow-x-auto">
          <table className="w-full text-left min-w-[480px]">
            <thead>
              <tr style={{ background: 'linear-gradient(135deg, #CC0000, #990000)' }}>
                <th className="px-5 py-4 text-white text-sm font-semibold">Feature</th>
                <th className="px-5 py-4 text-white text-sm font-semibold">Classic Black</th>
                <th className="px-5 py-4 text-white text-sm font-semibold">Premium Platinum</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map((row, i) => (
                <tr key={row[0]} style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td className="px-5 py-4 text-white text-sm font-medium">{row[0]}</td>
                  {row.slice(1).map((cell, j) => (
                    <td key={j} className="px-5 py-4 text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                      {cell === true ? <Check size={18} style={{ color: '#FF3333' }} /> : cell === false ? <X size={18} className="text-white/25" /> : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </Section>

      {/* How to apply */}
      <Section>
        <SectionTitle eyebrow="Simple Process" title="How to Apply" />
        <motion.div variants={staggerContainer(0.1)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((s, i) => (
            <motion.div key={s} variants={fadeUp} className="rounded-2xl al-glass border border-white/[0.08] p-6 text-center">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center font-bold text-white" style={{ background: 'linear-gradient(135deg, #CC0000, #990000)' }}>{i + 1}</div>
              <p className="text-sm text-white/80">{s}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Lost card alert */}
      <Section>
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-3xl p-7 sm:p-9 flex flex-col sm:flex-row items-center gap-6" style={{ background: 'rgba(204,0,0,0.1)', border: '1px solid rgba(204,0,0,0.4)' }}>
          <div className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(204,0,0,0.2)' }}>
            <AlertTriangle size={30} style={{ color: '#FF3333' }} />
          </div>
          <div className="text-center sm:text-left flex-1">
            <h3 className="font-serif-display font-bold text-white text-2xl mb-1.5">Lost your card?</h3>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Block it instantly via NetBanking, the mobile app, or call our 24/7 helpline. Your money stays protected with zero-liability cover.
            </p>
          </div>
          <a href="tel:18002000001" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white whitespace-nowrap" style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)' }}>
            <Phone size={17} /> 1800-200-0001
          </a>
        </motion.div>
      </Section>
    </PageTransition>
  );
}
