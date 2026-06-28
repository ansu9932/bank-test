import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, Mail, MessageCircle, Building2, MapPin, CheckCircle2 } from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import FAQAccordion from '../../components/public/FAQAccordion';
import { Section, SectionTitle, PageHero } from '../../components/public/sections';
import { staggerContainer, fadeUp, inView } from '../../components/public/ui';

const CONTACTS = [
  { icon: Phone, title: 'Phone Banking', value: '1800-200-0001', note: 'Toll Free · 24/7', href: 'tel:18002000001' },
  { icon: Mail, title: 'Email Support', value: 'support@alisterbank.com', note: 'Replies within 24 hrs', href: 'mailto:support@alisterbank.com' },
  { icon: MessageCircle, title: 'Live Chat', value: 'Chat Now', note: 'Avg. wait < 1 min', href: '#chat', chat: true },
  { icon: Building2, title: 'Corporate Office', value: '350 Park Avenue, New York, NY 10022', note: 'Mon–Fri, 9am–6pm ET', href: '#office' },
];

const FAQS = [
  { q: 'How do I open an account?', a: 'Tap "Open Account", fill the KYC form, complete a 2-minute video verification and your account is active instantly — no branch visit needed.' },
  { q: 'How do I reset my PIN?', a: 'Log in to NetBanking or the mobile app, go to Cards → Manage PIN, verify with OTP and set a new PIN securely.' },
  { q: 'What are the transfer limits?', a: 'IMPS up to $500,000, UPI up to $100,000 per day, and RTGS/NEFT with no upper limit. Limits are configurable in the app.' },
  { q: 'How does Video KYC work?', a: 'A trained agent verifies your identity over a secure live video call while you show your PAN and Aadhaar. It takes about two minutes.' },
  { q: 'How do I block my card?', a: 'Instantly block your card from NetBanking, the mobile app, or by calling our 24/7 helpline at 1800-200-0001.' },
  { q: 'What is the minimum balance?', a: 'Savings Account: $5,298 | Current Account: $10,598. A minimum opening deposit of $100,000 is required for all accounts.' },
  { q: 'How do I download my statement?', a: 'Go to Statements in NetBanking or the app, pick a date range and download as PDF or Excel — or schedule monthly email statements.' },
  { q: 'How do I apply for a loan?', a: 'Visit the Loans page, use the EMI calculator and eligibility checker, then apply online with instant in-principle approval.' },
];

export default function ContactPage() {
  return (
    <PageTransition
      title="Contact — Alister Bank"
      description="Reach Alister Bank 24/7 by phone, email or live chat. Browse our FAQs or send us a message — we're a fully digital bank, always online."
    >
      <PageHero
        eyebrow="We're Here to Help"
        title="Get in"
        highlight="Touch"
        subtitle="A real human, any time of day. Reach us however works best for you."
      />

      {/* Contact cards */}
      <Section>
        <motion.div variants={staggerContainer(0.1)} initial="hidden" whileInView="show" viewport={inView} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CONTACTS.map((c) => (
            <motion.a
              key={c.title}
              href={c.href}
              variants={fadeUp}
              className="rounded-2xl al-glass border border-white/[0.08] p-6 text-center hover:border-[#CC0000] transition-colors block"
            >
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-4" style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}>
                <c.icon size={24} style={{ color: '#FF3333' }} />
              </div>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{c.title}</p>
              <p className={`font-semibold mt-1 ${c.chat ? '' : 'text-white'}`} style={c.chat ? { color: '#FF3333' } : {}}>{c.value}</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.note}</p>
            </motion.a>
          ))}
        </motion.div>
      </Section>

      {/* Form + FAQ */}
      <Section className="grid lg:grid-cols-2 gap-12 items-start">
        <div>
          <SectionTitle eyebrow="Send a Message" title="How Can We Help?" align="left" />
          <SupportForm />
        </div>
        <div>
          <SectionTitle eyebrow="Quick Answers" title="Frequently Asked" align="left" />
          <FAQAccordion items={FAQS} />
        </div>
      </Section>

      {/* Branch locator placeholder */}
      <Section>
        <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="rounded-3xl border border-white/[0.08] overflow-hidden">
          <div className="relative h-64 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #1A1A1A, #0A0A0A)' }}>
            <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(204,0,0,0.6) 1px, transparent 1px),linear-gradient(90deg, rgba(204,0,0,0.6) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div className="relative text-center px-6">
              <MapPin size={40} className="mx-auto mb-4" style={{ color: '#FF3333' }} />
              <p className="text-white font-semibold text-lg">A fully digital bank</p>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>Use NetBanking or call us anytime — there's no branch queue here.</p>
            </div>
          </div>
        </motion.div>
      </Section>
    </PageTransition>
  );
}

function SupportForm() {
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl al-glass border p-10 text-center" style={{ borderColor: 'rgba(204,0,0,0.4)' }}>
        <CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: '#FF3333' }} />
        <h3 className="text-white font-semibold text-xl mb-2">Message Received!</h3>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>Thanks for reaching out. Our support team will get back to you within 24 hours.</p>
        <button onClick={() => setSubmitted(false)} className="mt-6 text-sm font-semibold" style={{ color: '#FF3333' }}>Send another message →</button>
      </motion.div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-3xl al-glass border border-white/[0.08] p-6 sm:p-8 space-y-5">
      <Field label="Full Name">
        <input type="text" required placeholder="Your name" className="al-cinput" />
      </Field>
      <Field label="Account Number (optional)">
        <input type="text" placeholder="e.g. 1000 2000 3000" className="al-cinput" />
      </Field>
      <Field label="Category">
        <select className="al-cinput" defaultValue="general">
          <option value="general">General Enquiry</option>
          <option value="account">Account & KYC</option>
          <option value="cards">Cards</option>
          <option value="loans">Loans</option>
          <option value="payments">Payments & Transfers</option>
          <option value="complaint">Complaint</option>
        </select>
      </Field>
      <Field label="Message">
        <textarea required rows={4} placeholder="How can we help you?" className="al-cinput resize-none" />
      </Field>
      <button type="submit" className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold text-white" style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 24px rgba(204,0,0,0.4)' }}>
        Submit Request
      </button>

      <style>{`
        .al-cinput {
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
        .al-cinput:focus { border-color: #CC0000; }
        .al-cinput::placeholder { color: rgba(255,255,255,0.35); }
        .al-cinput option { background: #1A1A1A; }
      `}</style>
    </form>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wide mb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{label}</span>
      {children}
    </label>
  );
}
