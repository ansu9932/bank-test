import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, Clock, Building2, ArrowRight, Palette, Image, FileText, BarChart3 } from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import { Section, SectionTitle, PageHero } from '../../components/public/sections';
import { staggerContainer, fadeUp, inView } from '../../components/public/ui';

const RELEASES = [
  {
    tag: 'Corporate',
    title: 'Alister Bank Receives OCC Preliminary Conditional Approval for National Bank Charter',
    meta: 'May 15, 2025 | New York, NY',
    excerpt: 'Alister Financial Corporation today announced receipt of a Preliminary Conditional Approval from the Office of the Comptroller of the Currency (OCC) to operate Alister Bank, N.A. as a full-service nationally chartered bank.',
  },
  {
    tag: 'Partnership',
    title: 'Alister Bank Launches Exclusive India Corporate Banking Program Under CSA Framework',
    meta: 'March 10, 2025 | New York, NY',
    excerpt: 'Alister Bank, N.A. has entered into a Corporate Service Agreement (CSA) to provide dedicated banking services to pre-approved corporate participants in India, operating within applicable US federal banking regulations.',
  },
  {
    tag: 'Compliance',
    title: 'Alister Bank Achieves Full BSA/AML Program Certification from Independent Auditor',
    meta: 'January 22, 2025 | New York, NY',
    excerpt: "Alister Bank's Bank Secrecy Act and Anti-Money Laundering compliance program has received a satisfactory rating from an independent third-party audit, in line with FinCEN guidance and OCC examination standards.",
  },
];

const MEDIA_KIT = [
  { icon: Palette, title: 'Brand Guidelines', text: 'Official logos, color codes, typography rules, and usage policy for press use.', cta: 'Download Brand Kit' },
  { icon: Image, title: 'Executive Photos', text: 'Approved headshots of senior leadership for editorial use.', cta: 'Download Photos' },
  { icon: FileText, title: 'Fact Sheet', text: 'Key statistics, corporate structure, regulatory status, and corporate history.', cta: 'Download PDF' },
  { icon: BarChart3, title: 'Financial Highlights', text: 'Summary financials for press. Full FDIC Call Report available via FDIC BankFind Suite.', cta: 'View FDIC Data' },
];

const DISCLOSURES = [
  { h: 'Forward-Looking Statements', t: "This press room may contain forward-looking statements within the meaning of the Private Securities Litigation Reform Act of 1995. These statements are based on management's current expectations and are subject to risks and uncertainties. Actual results may differ materially." },
  { h: 'Fair Disclosure (Regulation FD)', t: 'Alister Bank complies with SEC Regulation FD (17 CFR Part 243). Material non-public information is not disclosed selectively to media. All material disclosures are made simultaneously to the public.' },
  { h: 'FDIC Insurance Disclosure', t: 'Alister Bank, N.A. is a member of the FDIC. Deposit accounts are insured up to $250,000 per depositor, per insured bank, for each account ownership category, as provided by the Federal Deposit Insurance Act (12 U.S.C. § 1821).' },
  { h: 'Media Use Policy', t: 'Press materials provided herein are for editorial use only. Commercial use of the Alister Bank name, logo, or trademarks requires prior written consent. Unauthorized use may violate the Lanham Act (15 U.S.C. § 1051 et seq.).' },
];

const CONTACTS = [
  { icon: Mail, title: 'Press', value: 'press@alisterbank.com', href: 'mailto:press@alisterbank.com' },
  { icon: Phone, title: 'Media Line', value: '1-800-425-4783 Ext. 2', href: 'tel:18004254783' },
  { icon: Building2, title: 'Office', value: '350 Park Avenue, 21st Floor, New York, NY 10022', href: '#office' },
  { icon: Clock, title: 'Hours', value: 'Monday–Friday, 9:00 AM – 6:00 PM ET', href: '#hours' },
];

export default function PressPage() {
  return (
    <PageTransition
      title="Press & Newsroom — Alister Bank"
      description="Official press releases, media resources, and corporate announcements from Alister Bank, N.A. Media inquiries: press@alisterbank.com."
    >
      <PageHero eyebrow="Newsroom" title="Alister Bank" highlight="Newsroom" subtitle="Official press releases, media resources, and corporate announcements from Alister Bank, N.A." />

      {/* Media contact + safe harbor */}
      <Section className="!pt-0">
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-3xl al-glass border border-white/[0.08] p-6 sm:p-8">
          <div className="grid sm:grid-cols-3 gap-5">
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}><Mail size={20} style={{ color: '#FF3333' }} /></span>
              <div><p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Media Inquiries</p><p className="text-white font-medium text-sm">press@alisterbank.com</p></div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}><Phone size={20} style={{ color: '#FF3333' }} /></span>
              <div><p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Press Line</p><p className="text-white font-medium text-sm">1-800-425-4783 Ext. 2</p></div>
            </div>
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}><Clock size={20} style={{ color: '#FF3333' }} /></span>
              <div><p className="text-xs uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Response Time</p><p className="text-white font-medium text-sm">Within 1 business day</p></div>
            </div>
          </div>
          <p className="mt-6 pt-5 border-t border-white/[0.08] text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
            All forward-looking statements made by Alister Bank are subject to the safe harbor provisions of the Private Securities Litigation Reform Act of 1995.
          </p>
        </motion.div>
      </Section>

      {/* Press releases */}
      <Section>
        <SectionTitle eyebrow="Press Releases" title="Latest Announcements" />
        <motion.div variants={staggerContainer(0.1)} initial="hidden" whileInView="show" viewport={inView} className="grid md:grid-cols-3 gap-6">
          {RELEASES.map((r) => (
            <motion.div key={r.title} variants={fadeUp} className="flex flex-col h-full rounded-2xl al-glass border border-white/[0.08] p-6 hover:border-[#CC0000] transition-colors">
              <span className="inline-block w-fit text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-4" style={{ background: 'rgba(204,0,0,0.15)', color: '#FF3333' }}>{r.tag}</span>
              <h3 className="text-white font-semibold text-lg leading-snug mb-2">{r.title}</h3>
              <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>{r.meta}</p>
              <p className="text-sm mb-5 flex-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{r.excerpt}</p>
              <a href="#release" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#FF3333' }}>Read Release <ArrowRight size={14} /></a>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Media kit */}
      <Section>
        <SectionTitle eyebrow="Resources" title="Brand & Media Assets" />
        <motion.div variants={staggerContainer(0.1)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-2 gap-6">
          {MEDIA_KIT.map((m) => (
            <motion.div key={m.title} variants={fadeUp} className="flex items-start gap-5 rounded-2xl al-glass border border-white/[0.08] p-7 hover:border-[#CC0000] transition-colors">
              <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
                <m.icon size={24} style={{ color: '#FF3333' }} />
              </span>
              <div>
                <h3 className="text-white font-semibold text-lg mb-1.5">{m.title}</h3>
                <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>{m.text}</p>
                <a href="#download" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white border border-white/20 hover:border-[#CC0000] hover:text-[#FF3333] transition-all">
                  {m.cta} <ArrowRight size={14} />
                </a>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Regulatory & legal disclosure */}
      <Section>
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="relative rounded-3xl al-glass border border-white/[0.08] p-7 sm:p-10 overflow-hidden">
          <span className="absolute left-0 top-0 h-full w-1.5" style={{ background: 'linear-gradient(180deg, #FF3333, #990000)' }} />
          <h2 className="font-serif-display font-bold text-white text-2xl sm:text-3xl mb-7">Important Disclosures for Media</h2>
          <div className="space-y-6">
            {DISCLOSURES.map((d) => (
              <div key={d.h}>
                <p className="text-sm font-semibold uppercase tracking-wide mb-1.5" style={{ color: '#FF3333' }}>{d.h}</p>
                <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{d.t}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </Section>

      {/* Contact comms team */}
      <Section>
        <SectionTitle eyebrow="Get in Touch" title="Contact the Communications Team" />
        <motion.div variants={staggerContainer(0.1)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CONTACTS.map((c) => (
            <motion.a key={c.title} href={c.href} variants={fadeUp} className="rounded-2xl al-glass border border-white/[0.08] p-6 text-center hover:border-[#CC0000] transition-colors block">
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
                <c.icon size={24} style={{ color: '#FF3333' }} />
              </div>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{c.title}</p>
              <p className="text-white font-medium mt-1 text-sm break-words">{c.value}</p>
            </motion.a>
          ))}
        </motion.div>
      </Section>
    </PageTransition>
  );
}
