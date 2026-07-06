import React from 'react';
import { motion } from 'framer-motion';
import QRCode from 'react-qr-code';
import {
  Smartphone, ShieldCheck, Fingerprint, EyeOff, BellRing, Download,
  Settings, FolderDown, PackageCheck, LockKeyhole,
} from 'lucide-react';

import PageTransition from '../../components/public/PageTransition';
import { Section, SectionTitle, PageHero } from '../../components/public/sections';
import { staggerContainer, fadeUp, inView } from '../../components/public/ui';

const APK_URL = 'https://alisterbank.online/downloads/AlisterBank.apk';

const FEATURES = [
  { icon: Fingerprint, title: 'Biometric Login', desc: 'Sign in with your fingerprint or face — credentials live in your device\u2019s hardware-backed secure storage, never on our servers.' },
  { icon: EyeOff, title: 'Screenshot Protection', desc: 'Your balances and statements can never be screenshotted, screen-recorded, or exposed in the app switcher.' },
  { icon: ShieldCheck, title: 'Root Detection', desc: 'The app refuses to run banking sessions on rooted or tampered devices, keeping your money safe.' },
  { icon: LockKeyhole, title: 'Auto-Lock', desc: 'Step away for a minute and the app locks itself — unlock instantly with your fingerprint.' },
  { icon: BellRing, title: 'Update Alerts', desc: 'The app checks for new versions on every launch so you always have the latest security patches.' },
  { icon: Smartphone, title: 'Full NetBanking', desc: 'Transfers, statements, cards, deposits, support — everything from the web, native on your phone.' },
];

const STEPS = [
  { icon: Download, title: 'Download the APK', desc: 'Tap the download button (or scan the QR code from another device). Your browser will save AlisterBank.apk.' },
  { icon: Settings, title: 'Allow the install', desc: 'When prompted, allow your browser to install apps: Settings \u2192 Install unknown apps \u2192 enable for your browser. This is a one-time step.' },
  { icon: FolderDown, title: 'Open the file', desc: 'Open AlisterBank.apk from your notifications or the Files app and tap Install.' },
  { icon: PackageCheck, title: 'Sign in securely', desc: 'Launch Alister Bank, sign in with your NetBanking credentials, then enable fingerprint login when prompted.' },
];

export default function DownloadAppPage() {
  return (
    <PageTransition
      title="Download the App — Alister Bank"
      description="Get the official Alister Bank Android app. Biometric login, screenshot protection, auto-lock, and full NetBanking in a hardened native app."
    >
      <PageHero
        eyebrow="Official Android App"
        title="Banking in"
        highlight="Your Pocket"
        subtitle="The full Alister Bank experience as a hardened native Android app — with security the browser can't match."
      />

      {/* Download CTA + QR */}
      <Section>
        <motion.div
          variants={staggerContainer(0.12)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="grid lg:grid-cols-2 gap-8 items-center"
        >
          <motion.div variants={fadeUp} className="rounded-2xl al-glass border border-white/[0.08] p-8">
            <h3 className="text-white text-2xl font-bold mb-3 text-balance">Download for Android</h3>
            <p className="text-white/60 leading-relaxed mb-6">
              Version 1.0.0 &middot; Android 6.0+ &middot; ~6 MB. Distributed directly by
              Alister Bank — always download from this page, never from third-party stores.
            </p>
            <a
              href={APK_URL}
              className="inline-flex items-center gap-2.5 rounded-xl bg-[#CC0000] px-7 py-4 text-white font-semibold hover:bg-[#B00000] transition-colors"
            >
              <Download className="w-5 h-5" aria-hidden="true" />
              Download AlisterBank.apk
            </a>
            <p className="text-white/40 text-xs mt-4">
              SHA-256 signed release build. Your browser may warn about direct APK
              downloads — that&apos;s standard for apps outside the Play Store.
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="rounded-2xl al-glass border border-white/[0.08] p-8 flex flex-col items-center text-center">
            <div className="bg-white p-4 rounded-xl mb-5">
              <QRCode value={APK_URL} size={180} aria-label="QR code linking to the Alister Bank APK download" />
            </div>
            <p className="text-white font-semibold mb-1">Scan to download</p>
            <p className="text-white/50 text-sm">Point your phone&apos;s camera at the code to grab the APK directly on your device.</p>
          </motion.div>
        </motion.div>
      </Section>

      {/* Security features */}
      <Section>
        <SectionTitle
          eyebrow="Bank-Grade by Default"
          title="Security that lives"
          highlight="on the device"
          subtitle="The native app adds hardware-level protections that no mobile browser can offer."
        />
        <motion.div
          variants={staggerContainer(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {FEATURES.map((f) => (
            <motion.div key={f.title} variants={fadeUp} className="rounded-2xl al-glass border border-white/[0.08] p-6">
              <f.icon className="w-8 h-8 text-[#FF3333] mb-4" aria-hidden="true" />
              <h4 className="text-white font-semibold mb-2">{f.title}</h4>
              <p className="text-white/55 text-sm leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* Install steps */}
      <Section>
        <SectionTitle
          eyebrow="Two-Minute Setup"
          title="How to"
          highlight="install"
          subtitle="Installing a direct APK takes four quick steps."
        />
        <motion.ol
          variants={staggerContainer(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 list-none p-0"
        >
          {STEPS.map((s, i) => (
            <motion.li key={s.title} variants={fadeUp} className="rounded-2xl al-glass border border-white/[0.08] p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#CC0000] text-white text-sm font-bold" aria-hidden="true">
                  {i + 1}
                </span>
                <s.icon className="w-6 h-6 text-white/70" aria-hidden="true" />
              </div>
              <h4 className="text-white font-semibold mb-2">{s.title}</h4>
              <p className="text-white/55 text-sm leading-relaxed">{s.desc}</p>
            </motion.li>
          ))}
        </motion.ol>
      </Section>
    </PageTransition>
  );
}
