import React from 'react';
import { motion } from 'framer-motion';
import { Award, Target, Eye, HeartHandshake, ShieldCheck } from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import StatCounter from '../../components/public/StatCounter';
import { Section, SectionTitle, PageHero } from '../../components/public/sections';
import { staggerContainer, fadeUp, fadeLeft, inView } from '../../components/public/ui';

const TIMELINE = [
  { year: '2018', text: 'Alister Bank founded with a vision to make banking fair, fast and fully digital.' },
  { year: '2020', text: 'Launched mobile-first app and instant account opening with video KYC.' },
  { year: '2022', text: 'Crossed 1 million accounts and expanded into loans and investments.' },
  { year: '2024', text: 'Recognised as one of the fastest-growing digital banks serving India under US federal oversight.' },
  { year: '2025', text: 'Surpassed 2.5 million customers and $50,000+ Cr in processed transactions.' },
];

const LEADERS = [
  { name: 'Aditya Verma', role: 'Chief Executive Officer', initials: 'AV' },
  { name: 'Sanya Kapoor', role: 'Chief Financial Officer', initials: 'SK' },
  { name: 'Rahul Iyer', role: 'Chief Technology Officer', initials: 'RI' },
];

const AWARDS = ['FDIC Insured', 'Federal Reserve Member', 'ISO 27001', 'PCI DSS Certified', 'FinCEN Registered', 'BSA/AML Compliant'];

const COMPLIANCE = [
  'Governed by US Federal Banking Law (12 U.S.C.)',
  'Supervised by the Board of Governors of the Federal Reserve System',
  'Deposits insured by the FDIC up to applicable limits',
  'Compliant with the Bank Secrecy Act (BSA) and Anti-Money Laundering (AML) regulations',
  'Registered with the Financial Crimes Enforcement Network (FinCEN)',
  'Adheres to the Gramm-Leach-Bliley Act (GLBA) for customer data privacy',
  'Compliant with the USA PATRIOT Act for identity verification',
  'India operations conducted exclusively under a Corporate Service Agreement — not a direct retail banking license in India',
];

const STATS = [
  { value: 2.5, decimals: 1, suffix: 'M+', label: 'Customers' },
  { value: 50000, prefix: '$', suffix: '+ Cr', label: 'Processed' },
  { value: 99.9, decimals: 1, suffix: '%', label: 'Uptime' },
  { value: 7, suffix: '+ yrs', label: 'Of Trust' },
];

export default function AboutPage() {
  return (
    <PageTransition
      title="About — Alister Bank"
      description="Alister Bank is on a mission to make banking fair, fast and fully digital for every Indian. Learn our story, leadership and certifications."
    >
      <PageHero
        eyebrow="Our Story"
        title="Banking Beyond"
        highlight="Boundaries"
        subtitle="Since 2018 we've been rebuilding banking from the ground up — transparent, digital and built for Bharat."
      />

      {/* Mission / Vision */}
      <Section className="grid md:grid-cols-2 gap-6">
        {[
          { icon: Target, title: 'Our Mission', text: 'To deliver fair, transparent and effortless banking to every Indian — with zero hidden charges and total digital convenience.' },
          { icon: Eye, title: 'Our Vision', text: 'To be the most trusted US-chartered digital bank serving India, empowering financial freedom for 100 million people by 2030.' },
        ].map((c) => (
          <motion.div key={c.title} variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-3xl al-glass border border-white/[0.08] p-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
              <c.icon size={26} style={{ color: '#FF3333' }} />
            </div>
            <h3 className="font-serif-display font-bold text-white text-2xl mb-3">{c.title}</h3>
            <p className="text-base" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.text}</p>
          </motion.div>
        ))}
      </Section>

      {/* Timeline */}
      <Section>
        <SectionTitle eyebrow="Milestones" title="Our Journey" />
        <div className="relative max-w-3xl mx-auto">
          {/* Vertical line: left on mobile, centered on desktop */}
          <div className="absolute left-2 sm:left-1/2 sm:-translate-x-1/2 top-0 bottom-0 w-px" style={{ background: 'rgba(204,0,0,0.3)' }} />
          <div className="space-y-8">
            {TIMELINE.map((t, i) => (
              <motion.div
                key={t.year}
                variants={fadeLeft}
                initial="hidden"
                whileInView="show"
                viewport={inView}
                className={`relative pl-10 sm:pl-0 sm:w-1/2 ${i % 2 ? 'sm:ml-auto sm:pl-10' : 'sm:pr-10 sm:text-right'}`}
              >
                {/* Dot sits on the line */}
                <span
                  className="absolute top-5 left-2 sm:left-auto w-3.5 h-3.5 rounded-full -translate-x-1/2 z-10"
                  style={{
                    background: '#FF3333',
                    boxShadow: '0 0 12px #CC0000',
                    ...(i % 2 ? { left: '0' } : { right: '0', transform: 'translateX(50%)' }),
                  }}
                />
                <div className="rounded-2xl al-glass border border-white/[0.08] p-5">
                  <p className="font-serif-display font-bold text-2xl text-al-gradient">{t.year}</p>
                  <p className="text-sm mt-1.5" style={{ color: 'rgba(255,255,255,0.65)' }}>{t.text}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* Leadership */}
      <Section>
        <SectionTitle eyebrow="Leadership" title="Meet the Team" />
        <motion.div variants={staggerContainer(0.12)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-3 gap-6">
          {LEADERS.map((l) => (
            <motion.div key={l.name} variants={fadeUp} className="rounded-2xl al-glass border border-white/[0.08] p-8 text-center hover:border-[#CC0000] transition-colors">
              <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center font-serif-display font-bold text-3xl text-white mb-5" style={{ background: 'linear-gradient(135deg, #CC0000, #990000)', boxShadow: '0 0 30px rgba(204,0,0,0.4)' }}>
                {l.initials}
              </div>
              <h3 className="text-white font-semibold text-lg">{l.name}</h3>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{l.role}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Awards */}
      <Section>
        <SectionTitle eyebrow="Trust & Compliance" title="Awards & Certifications" />
        <motion.div variants={staggerContainer(0.08)} initial="hidden" whileInView="show" viewport={inView} className="grid grid-cols-2 sm:grid-cols-3 gap-5">
          {AWARDS.map((a) => (
            <motion.div key={a} variants={fadeUp} className="rounded-2xl al-glass border border-white/[0.08] p-7 flex flex-col items-center gap-3 text-center">
              <Award size={32} style={{ color: '#FF3333' }} />
              <p className="text-white font-semibold text-sm">{a}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Regulatory Compliance & Governing Law */}
      <Section>
        <SectionTitle eyebrow="Governing Law" title="Regulatory Compliance & Governing Law" />
        <motion.div variants={staggerContainer(0.08)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-2 gap-4">
          {COMPLIANCE.map((item) => (
            <motion.div
              key={item}
              variants={fadeUp}
              className="rounded-2xl al-glass border border-white/[0.08] p-5 flex items-start gap-3.5"
            >
              <span className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
                <ShieldCheck size={18} style={{ color: '#FF3333' }} />
              </span>
              <p className="text-sm leading-relaxed text-white">{item}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* CSR */}
      <Section>
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-3xl p-8 sm:p-12 flex flex-col sm:flex-row items-center gap-6" style={{ background: 'linear-gradient(135deg, #1A0000, #0A0A0A 60%, #2D0000)', border: '1px solid rgba(204,0,0,0.25)' }}>
          <div className="w-16 h-16 shrink-0 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(204,0,0,0.15)' }}>
            <HeartHandshake size={30} style={{ color: '#FF3333' }} />
          </div>
          <div className="text-center sm:text-left">
            <h3 className="font-serif-display font-bold text-white text-2xl mb-2">Banking for Bharat</h3>
            <p className="text-base" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Through financial-inclusion initiatives we bring no-frills accounts, digital literacy and micro-credit to underserved communities across India.
            </p>
          </div>
        </motion.div>
      </Section>

      {/* Numbers */}
      <Section>
        <SectionTitle eyebrow="By the Numbers" title="Trusted at Scale" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center rounded-2xl al-glass border border-white/[0.08] py-8">
              <p className="font-serif-display font-bold text-3xl sm:text-4xl text-al-gradient">
                <StatCounter value={s.value} decimals={s.decimals || 0} prefix={s.prefix || ''} suffix={s.suffix || ''} />
              </p>
              <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </Section>
    </PageTransition>
  );
}
