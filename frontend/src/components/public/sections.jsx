import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { fadeUp, inView } from './ui';

// ── Reusable page primitives shared across all public pages ──────────────────

// Standard section wrapper with consistent responsive padding.
// `relative z-10` ensures content sections always paint above the hero's
// isolated layer on mobile (prevents cross-section paint bleed); it does not
// affect layout or desktop appearance.
export function Section({ children, className = '', id, style }) {
  return (
    <section id={id} className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-12 lg:py-24 ${className}`} style={style}>
      {children}
    </section>
  );
}

// Centered section heading with optional eyebrow + subtitle, scroll-reveal.
export function SectionTitle({ eyebrow, title, subtitle, align = 'center' }) {
  const alignCls = align === 'center' ? 'text-center mx-auto' : 'text-left';
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={inView}
      className={`max-w-2xl mb-12 lg:mb-16 ${alignCls}`}
    >
      {eyebrow && (
        <p className="text-[11px] font-semibold tracking-[0.3em] uppercase mb-3" style={{ color: '#FF3333' }}>
          {eyebrow}
        </p>
      )}
      <h2 className="font-serif-display font-bold text-white text-3xl sm:text-4xl lg:text-5xl leading-tight">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-base sm:text-lg" style={{ color: 'rgba(255,255,255,0.6)' }}>
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}

// Dark page hero banner with a red underline accent. Used by inner pages.
export function PageHero({ eyebrow, title, highlight, subtitle, children }) {
  return (
    <section className="relative overflow-hidden al-hero-bg">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[160px] al-glow-pulse"
        style={{ background: 'radial-gradient(circle, rgba(204,0,0,0.22), transparent 70%)' }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pt-16 pb-16 lg:pt-24 lg:pb-20 text-center">
        {eyebrow && (
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[11px] font-semibold tracking-[0.3em] uppercase mb-4"
            style={{ color: '#FF3333' }}
          >
            {eyebrow}
          </motion.p>
        )}
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="font-serif-display font-bold text-white text-4xl sm:text-5xl lg:text-6xl leading-tight"
        >
          {title} {highlight && <span className="text-al-gradient">{highlight}</span>}
        </motion.h1>
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="h-1 w-24 mx-auto mt-6 rounded-full origin-center"
          style={{ background: 'linear-gradient(90deg, #FF3333, #990000)' }}
        />
        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-base sm:text-lg max-w-2xl mx-auto"
            style={{ color: 'rgba(255,255,255,0.6)' }}
          >
            {subtitle}
          </motion.p>
        )}
        {children && <div className="mt-9">{children}</div>}
      </div>
    </section>
  );
}

// Solid red CTA button (link).
export function RedButton({ to = '/open-account', children, className = '', large = false }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition-all active:scale-95 hover:scale-[1.03] ${
        large ? 'px-7 py-4 text-base' : 'px-5 py-3 text-sm'
      } ${className}`}
      style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 28px rgba(204,0,0,0.45)' }}
    >
      {children} <ArrowRight size={large ? 18 : 15} />
    </Link>
  );
}

// Outlined / ghost button (link).
export function GhostButton({ to = '/', children, className = '', large = false }) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold text-white border border-white/20 hover:border-[#CC0000] hover:text-[#FF3333] transition-all ${
        large ? 'px-7 py-4 text-base' : 'px-5 py-3 text-sm'
      } ${className}`}
    >
      {children}
    </Link>
  );
}

// A bordered dark "glass" card container.
export function GlassCard({ children, className = '', hover = false }) {
  return (
    <div
      className={`rounded-2xl al-glass border border-white/[0.08] ${
        hover ? 'transition-all duration-300 hover:border-[#CC0000] hover:-translate-y-1' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
