import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, ShieldCheck, Zap, Smartphone, Send,
  FileText, Video, CheckCircle2,
} from 'lucide-react';

import RealQRCode from 'react-qr-code';
import PageTransition from '../../components/public/PageTransition';
import HeroCard3D from '../../components/public/HeroCard3D';
import StatCounter from '../../components/public/StatCounter';
import ProductCard from '../../components/public/ProductCard';
import Testimonial from '../../components/public/Testimonial';
import TiltCard from '../../components/public/TiltCard';
import { Section, SectionTitle, RedButton, GhostButton } from '../../components/public/sections';
import { staggerContainer, fadeUp, fadeLeft, fadeRight, inView } from '../../components/public/ui';

// Direct APK download served by the AWS backend. Must use the API domain —
// the main domain is the Cloudflare-hosted SPA, which has no /downloads file
// and its 404 catch-all would redirect the click to the app instead.
const APK_URL = 'https://api.alisterbank.online/downloads/AlisterBank.apk';

const STATS = [
  { value: 50000, prefix: '$', suffix: '+ Cr', label: 'Transactions Processed' },
  { value: 2.5, decimals: 1, suffix: 'M+', label: 'Happy Customers' },
  { value: 99.9, decimals: 1, suffix: '%', label: 'Uptime Guaranteed' },
  { value: 2, prefix: '< ', suffix: ' Sec', label: 'Average Transfer Time' },
];

const PRODUCTS = [
  { emoji: '💳', title: 'Savings Account', subtitle: 'Earn up to 7% interest p.a.', to: '/accounts' },
  { emoji: '🏠', title: 'Home Loan', subtitle: 'Starting at 8.5% p.a.', to: '/loans' },
  { emoji: '🚗', title: 'Car Loan', subtitle: 'Quick approval in 24 hrs', to: '/loans' },
  { emoji: '💰', title: 'Fixed Deposit', subtitle: 'Up to 8.2% assured returns', to: '/investments' },
  { emoji: '📊', title: 'Mutual Funds', subtitle: 'Start a SIP from just $500', to: '/investments' },
  { emoji: '🛡️', title: 'Insurance', subtitle: 'Comprehensive coverage plans', to: '/investments' },
];

const RATES = [
  ['Savings Account', '4% – 7% p.a.', 'Ongoing'],
  ['Fixed Deposit', '6.5% – 8.2% p.a.', '7 days – 10 yrs'],
  ['Recurring Deposit', '6.5% – 7.5% p.a.', '6 months – 10 yrs'],
  ['Home Loan', '8.5% p.a. onwards', '5 – 30 yrs'],
  ['Personal Loan', '10.99% p.a. onwards', '1 – 5 yrs'],
];

const NEWS = [
  { tag: 'Milestone', title: 'Alister Bank Crosses 1 Million Customers', excerpt: 'We are humbled to welcome our millionth customer to a fairer, faster way to bank.', date: 'June 2025' },
  { tag: 'Product', title: 'New Feature: Scheduled Transfers Now Live', excerpt: 'Automate rent, EMIs and savings with recurring scheduled transfers, free of charge.', date: 'May 2025' },
  { tag: 'Onboarding', title: 'Introducing Video KYC — Open Account from Home', excerpt: 'Complete your verification in minutes with secure live video KYC, no branch visit.', date: 'April 2025' },
];

const heroText = {
  hidden: {},
  show: { transition: { staggerChildren: 0.18 } },
};
const heroLine = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export default function HomePage() {
  return (
    <PageTransition
      title="Alister Bank — Banking Beyond Boundaries"
      description="Experience next-generation digital banking with instant transfers, zero hidden charges and 24/7 support. Open your account in 5 minutes."
    >
      <Hero />
      <StatsBar />
      <Products />
      <WhyChoose />
      <HowItWorks />
      <RatesTable />
      <Testimonials />
      <AppBanner />
      <News />
    </PageTransition>
  );
}

/* ── Section 1: Hero ─────────────────────────────────────────────────────── */
function Hero() {
  return (
    // `isolate` forces the hero into its own stacking/compositing context so
    // `overflow-hidden` reliably clips the animated (transform: scale) glow on
    // mobile and the hero's paint can't bleed into the sections below.
    <section className="relative isolate overflow-hidden al-hero-bg">
      {/* Animated red glow + grid */}
      <div
        className="pointer-events-none absolute -top-48 left-1/3 w-[760px] h-[760px] rounded-full blur-[170px] al-glow-pulse"
        style={{ background: 'radial-gradient(circle, rgba(204,0,0,0.22), transparent 70%)' }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(204,0,0,0.6) 1px, transparent 1px),linear-gradient(90deg, rgba(204,0,0,0.6) 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 35%, #000 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 35%, #000 30%, transparent 80%)',
        }}
      />

      {/* Invitation-only notice bar (Corporate Partner Project) */}
      <div className="relative z-10 border-b" style={{ background: 'rgba(153,0,0,0.3)', borderColor: 'rgba(204,0,0,0.4)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-2.5">
          <p className="text-center text-xs sm:text-sm font-medium text-white">
            ⚠️ Alister Bank India services are exclusively available to pre-approved participants of our Corporate Partner Project. Access is by invitation only.
          </p>
        </div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 min-h-[calc(100vh-72px)] grid lg:grid-cols-5 gap-12 items-center py-16 lg:py-0">
        {/* Left */}
        <motion.div variants={heroText} initial="hidden" animate="show" className="lg:col-span-3">
          <motion.div
            variants={heroLine}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.03] mb-7"
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#FF3333' }} />
            <span className="text-[11px] font-medium tracking-wider uppercase" style={{ color: 'rgba(255,255,255,0.6)' }}>
              🏦 US-Chartered Bank — Serving India
            </span>
          </motion.div>

          <h1 className="font-serif-display font-bold text-white leading-[1.05] text-4xl sm:text-6xl lg:text-7xl">
            <motion.span variants={heroLine} className="block">Bank Smarter,</motion.span>
            <motion.span variants={heroLine} className="block">
              Live <span className="text-al-gradient">Better</span>
            </motion.span>
          </h1>

          <motion.p
            variants={heroLine}
            className="mt-7 text-base sm:text-lg leading-relaxed max-w-xl"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            Experience next-generation banking with instant transfers, zero hidden charges,
            and 24/7 support. Open your account in just <span className="text-white font-semibold">5 minutes</span>.
          </motion.p>

          <motion.div variants={heroLine} className="mt-9 flex flex-col sm:flex-row gap-4">
            <RedButton to="/open-account" large>Request Account Access</RedButton>
            <GhostButton to="/accounts" large>Explore Products</GhostButton>
          </motion.div>

          <motion.div variants={heroLine} className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3">
            {[
              ['🔒', 'Bank-Grade Security'],
              ['⚡', 'Instant Transfers'],
              ['📱', 'Always Online'],
            ].map(([icon, text]) => (
              <div key={text} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
                <span>{icon}</span> {text}
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Right — 3D card */}
        <div className="lg:col-span-2 flex justify-center lg:justify-end">
          <HeroCard3D />
        </div>
      </div>
    </section>
  );
}

/* ── Section 2: Stats Bar ────────────────────────────────────────────────── */
function StatsBar() {
  return (
    <div className="relative z-10 border-y border-white/[0.08]" style={{ background: 'linear-gradient(90deg, #1A0000, #0A0A0A, #1A0000)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12 grid grid-cols-2 lg:grid-cols-4 gap-8">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-serif-display font-bold text-3xl sm:text-4xl text-al-gradient">
              <StatCounter value={s.value} decimals={s.decimals || 0} prefix={s.prefix || ''} suffix={s.suffix || ''} />
            </p>
            <p className="mt-2 text-xs sm:text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Section 3: Products Grid ────────────────────────────────────────────── */
function Products() {
  return (
    <Section>
      <SectionTitle
        eyebrow="Our Products"
        title="Everything You Need, In One Place"
        subtitle="A full suite of accounts, loans and investments — thoughtfully designed and transparently priced."
      />
      <motion.div
        variants={staggerContainer(0.1)}
        initial="hidden"
        whileInView="show"
        viewport={inView}
        className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {PRODUCTS.map((p) => (
          <ProductCard key={p.title} {...p} />
        ))}
      </motion.div>
    </Section>
  );
}

/* ── Section 4: Why Choose ───────────────────────────────────────────────── */
function WhyChoose() {
  const features = [
    {
      title: 'Instant NEFT / RTGS / IMPS Transfers',
      text: 'Transfer money 24/7 with zero delays. IMPS settlements under 2 seconds, guaranteed across all rails.',
      visual: <TransferVisual />,
    },
    {
      title: 'Military-Grade Security',
      text: 'JWT authentication, bcrypt encryption, real-time fraud detection and instant account lock keep you protected.',
      visual: <ShieldVisual />,
    },
    {
      title: 'Video KYC — Open Account in 5 Minutes',
      text: 'No branch visits. No paperwork. Complete your KYC from home with secure live video verification.',
      visual: <PhoneVisual />,
    },
  ];

  return (
    <Section>
      <SectionTitle eyebrow="Why Alister Bank" title="Built Different. Built for You." />
      <div className="space-y-16 lg:space-y-28">
        {features.map((f, i) => {
          const flip = i % 2 === 1;
          return (
            <div key={f.title} className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <motion.div
                variants={flip ? fadeRight : fadeLeft}
                initial="hidden"
                whileInView="show"
                viewport={inView}
                className={flip ? 'lg:order-2' : ''}
              >
                {f.visual}
              </motion.div>
              <motion.div
                variants={flip ? fadeLeft : fadeRight}
                initial="hidden"
                whileInView="show"
                viewport={inView}
                className={flip ? 'lg:order-1' : ''}
              >
                <h3 className="font-serif-display font-bold text-white text-2xl sm:text-3xl mb-4">{f.title}</h3>
                <p className="text-base sm:text-lg leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{f.text}</p>
                <Link to="/about" className="inline-flex items-center gap-1.5 mt-5 text-sm font-semibold" style={{ color: '#FF3333' }}>
                  Learn more <ArrowRight size={15} />
                </Link>
              </motion.div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

function TransferVisual() {
  return (
    <div className="rounded-3xl al-glass border border-white/[0.08] p-8 flex items-center justify-between gap-3">
      <Node label="Account A" />
      <div className="flex-1 relative h-px mx-1" style={{ background: 'rgba(255,255,255,0.12)' }}>
        <motion.div
          animate={{ left: ['0%', '100%'] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-1.5 w-3 h-3 rounded-full"
          style={{ background: '#FF3333', boxShadow: '0 0 12px #CC0000' }}
        />
        <Send size={16} className="absolute left-1/2 -translate-x-1/2 -top-7" style={{ color: '#CC0000' }} />
      </div>
      <Node label="Account B" />
    </div>
  );
}
function Node({ label }) {
  return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-2" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
        <Zap size={24} style={{ color: '#FF3333' }} />
      </div>
      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</p>
    </div>
  );
}
function ShieldVisual() {
  return (
    <div className="rounded-3xl al-glass border border-white/[0.08] p-12 flex items-center justify-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-full al-pulse-ring" />
        <div className="w-32 h-32 rounded-full flex items-center justify-center" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.4)' }}>
          <ShieldCheck size={56} style={{ color: '#FF3333' }} />
        </div>
      </div>
    </div>
  );
}
function PhoneVisual() {
  return (
    <div className="rounded-3xl al-glass border border-white/[0.08] p-8 flex items-center justify-center">
      <div className="w-44 h-80 rounded-[2rem] border-4 p-3 flex flex-col gap-3" style={{ borderColor: '#2D2D2D', background: '#0A0A0A' }}>
        <div className="h-1.5 w-12 mx-auto rounded-full bg-white/20" />
        <div className="flex-1 rounded-2xl p-3 flex flex-col gap-2.5" style={{ background: 'rgba(204,0,0,0.08)' }}>
          {['Personal Details', 'Upload Documents', 'Live Video KYC', 'Account Active'].map((s, i) => (
            <div key={s} className="flex items-center gap-2 rounded-lg px-2 py-2" style={{ background: 'rgba(255,255,255,0.04)' }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] text-white" style={{ background: i < 3 ? '#CC0000' : '#2D2D2D' }}>
                {i < 3 ? '✓' : i + 1}
              </span>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.7)' }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Section 5: How It Works ─────────────────────────────────────────────── */
function HowItWorks() {
  const steps = [
    { icon: FileText, title: 'Receive Invitation', text: 'Get approved by your corporate project coordinator' },
    { icon: Video, title: 'Complete KYC', text: 'Identity verification as per US federal requirements' },
    { icon: CheckCircle2, title: 'Account Activated', text: 'Begin banking under the corporate program' },
  ];
  return (
    <Section style={{ background: 'linear-gradient(180deg, transparent, rgba(204,0,0,0.04), transparent)' }}>
      <SectionTitle eyebrow="Getting Started" title="Open Your Account in 3 Simple Steps" />
      <div className="relative grid md:grid-cols-3 gap-10 md:gap-6">
        {/* Connector line (desktop) */}
        <div className="hidden md:block absolute top-10 left-[16%] right-[16%] h-px">
          <svg width="100%" height="2"><line x1="0" y1="1" x2="100%" y2="1" stroke="#CC0000" strokeWidth="2" className="al-dash-line" /></svg>
        </div>
        {steps.map((s, i) => (
          <motion.div
            key={s.title}
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={inView}
            transition={{ delay: i * 0.15 }}
            className="relative text-center flex flex-col items-center"
          >
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-full al-pulse-ring" />
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, #CC0000, #990000)' }}>
                <s.icon size={30} />
              </div>
              <span className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white border-2" style={{ background: '#0A0A0A', borderColor: '#FF3333', color: '#FF3333' }}>
                {i + 1}
              </span>
            </div>
            <h3 className="text-white font-semibold text-lg mb-1.5">{s.title}</h3>
            <p className="text-sm max-w-[220px]" style={{ color: 'rgba(255,255,255,0.6)' }}>{s.text}</p>
          </motion.div>
        ))}
      </div>
      <div className="text-center mt-12">
        <RedButton to="/open-account" large>Get Started Now</RedButton>
      </div>
    </Section>
  );
}

/* ── Section 6: Rates Table ──────────────────────────────────────────────── */
function RatesTable() {
  return (
    <Section>
      <SectionTitle eyebrow="Transparent Pricing" title="Best Rates In The Market" />
      <motion.div
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={inView}
        className="rounded-2xl overflow-hidden border border-white/[0.08]"
      >
        <table className="w-full text-left">
          <thead>
            <tr style={{ background: 'linear-gradient(135deg, #CC0000, #990000)' }}>
              <th className="px-5 sm:px-6 py-4 text-white text-sm font-semibold">Product</th>
              <th className="px-5 sm:px-6 py-4 text-white text-sm font-semibold">Rate</th>
              <th className="px-5 sm:px-6 py-4 text-white text-sm font-semibold">Tenure</th>
            </tr>
          </thead>
          <tbody>
            {RATES.map((r, i) => (
              <tr
                key={r[0]}
                className="transition-colors hover:bg-[rgba(204,0,0,0.08)]"
                style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent', borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <td className="px-5 sm:px-6 py-4 text-white text-sm font-medium">{r[0]}</td>
                <td className="px-5 sm:px-6 py-4 text-sm font-semibold" style={{ color: '#FF3333' }}>{r[1]}</td>
                <td className="px-5 sm:px-6 py-4 text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>{r[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </Section>
  );
}

/* ── Section 7: Testimonials ─────────────────────────────────────────────── */
function Testimonials() {
  return (
    <Section>
      <SectionTitle eyebrow="Testimonials" title="What Our Customers Say" />
      <Testimonial />
    </Section>
  );
}

/* ── Section 8: App Banner ───────────────────────────────────────────────── */
function AppBanner() {
  return (
    <Section>
      <div
        className="rounded-3xl overflow-hidden border border-white/[0.08] p-8 sm:p-12 grid lg:grid-cols-2 gap-10 items-center"
        style={{ background: 'linear-gradient(135deg, #1A0000, #0A0A0A 60%, #2D0000)' }}
      >
        <div>
          <h2 className="font-serif-display font-bold text-white text-3xl sm:text-4xl leading-tight">
            Bank on the Go — Download the <span className="text-al-gradient">Alister Bank</span> App
          </h2>
          <p className="mt-4 text-base" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Manage accounts, transfer instantly, pay bills and invest — all from your pocket.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-5">
            {/* Real QR — scanning it on a phone starts the APK download directly */}
            <div className="w-28 h-28 rounded-2xl grid place-items-center bg-white p-2.5">
              <RealQRCode value={APK_URL} size={92} style={{ width: '100%', height: '100%' }} aria-label="QR code to download the Alister Bank Android app" />
            </div>
            <div className="flex flex-col gap-3">
              <a
                href={APK_URL}
                className="flex items-center gap-3 px-5 py-2.5 rounded-xl bg-[#CC0000] hover:bg-[#B00000] transition-colors"
              >
                <Smartphone size={22} className="text-white" />
                <div className="leading-tight text-left">
                  <p className="text-[10px] text-white/70">Direct download</p>
                  <p className="text-sm font-semibold text-white">Android APK</p>
                </div>
              </a>
              <Link
                to="/download"
                className="flex items-center gap-3 px-5 py-2.5 rounded-xl border border-white/15 hover:border-[#CC0000] transition-colors"
              >
                <ShieldCheck size={22} className="text-white" />
                <div className="leading-tight text-left">
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>Install guide &amp; checksum</p>
                  <p className="text-sm font-semibold text-white">Download page</p>
                </div>
              </Link>
            </div>
          </div>
          <p className="mt-4 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Android 6.0+ &middot; Distributed directly by Alister Bank — scan the QR or tap to download.
          </p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <div className="w-52 h-96 rounded-[2.5rem] border-4 flex flex-col p-3" style={{ borderColor: '#2D2D2D', background: '#0A0A0A' }}>
            <div className="h-1.5 w-14 mx-auto rounded-full bg-white/20 mb-3" />
            <div className="flex-1 rounded-3xl p-4 flex flex-col gap-3" style={{ background: 'linear-gradient(160deg, rgba(204,0,0,0.18), rgba(10,10,10,0.6))' }}>
              <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.5)' }}>Total Balance</p>
              <p className="font-serif-display font-bold text-2xl text-white">$12,84,500</p>
              <div className="h-px bg-white/10 my-1" />
              {['Transfer', 'Pay Bills', 'Invest'].map((a) => (
                <div key={a} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <span className="text-xs text-white">{a}</span>
                  <ArrowRight size={13} style={{ color: '#FF3333' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}



/* ── Section 9: News ─────────────────────────────────────────────────────── */
function News() {
  return (
    <Section>
      <SectionTitle eyebrow="Newsroom" title="Latest from Alister Bank" />
      <motion.div
        variants={staggerContainer(0.1)}
        initial="hidden"
        whileInView="show"
        viewport={inView}
        className="grid md:grid-cols-3 gap-6"
      >
        {NEWS.map((n) => (
          <motion.div key={n.title} variants={fadeUp}>
            <TiltCard max={6} className="h-full rounded-2xl al-glass border border-white/[0.08] p-6 hover:border-[#CC0000] transition-colors">
              <span className="inline-block text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full mb-4" style={{ background: 'rgba(204,0,0,0.15)', color: '#FF3333' }}>
                {n.tag}
              </span>
              <h3 className="text-white font-semibold text-lg leading-snug mb-2">{n.title}</h3>
              <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.6)' }}>{n.excerpt}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{n.date}</span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: '#FF3333' }}>
                  Read More <ArrowRight size={14} />
                </span>
              </div>
            </TiltCard>
          </motion.div>
        ))}
      </motion.div>
    </Section>
  );
}
