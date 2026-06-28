import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { PageHero } from './sections';

// ── Shared building blocks for long-form legal documents ─────────────────────

// Legal paragraph: Inter 400 / 15px / readable secondary white.
export function LP({ children, className = '' }) {
  return (
    <p
      className={`text-[15px] leading-relaxed mb-4 whitespace-pre-line ${className}`}
      style={{ color: 'rgba(255,255,255,0.75)' }}
    >
      {children}
    </p>
  );
}

// Bulleted list with red markers.
export function LList({ items }) {
  return (
    <ul className="space-y-2.5 mb-4">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
          <span className="mt-1 select-none" style={{ color: '#FF3333' }}>•</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Two-column legal document layout: sticky left sidebar with jump links
 * (red active indicator driven by a scroll-spy) and a scrollable content
 * column. Matches the site's dark theme + Framer Motion reveals.
 *
 * Props:
 *  - eyebrow, title, highlight  -> forwarded to the shared PageHero
 *  - banner                     -> string rendered in a red notice bar
 *  - sections: [{ id, number, title, body }]
 */
export default function LegalLayout({ eyebrow, title, highlight, banner, sections }) {
  const [active, setActive] = useState(sections[0]?.id);
  const observer = useRef(null);

  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.current.observe(el);
    });
    return () => observer.current && observer.current.disconnect();
  }, [sections]);

  const jumpTo = (id) => {
    const el = document.getElementById(id);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 96, behavior: 'smooth' });
  };

  return (
    <>
      <PageHero eyebrow={eyebrow} title={title} highlight={highlight} />

      <div className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 pb-16 lg:pb-24">
        {/* Red effective-date banner */}
        {banner && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl px-6 py-5 mb-12"
            style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.4)' }}
          >
            <p className="text-sm leading-relaxed text-white whitespace-pre-line">{banner}</p>
          </motion.div>
        )}

        <div className="grid lg:grid-cols-[260px_1fr] gap-10 lg:gap-14">
          {/* Sticky sidebar jump links */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1" aria-label="Document sections">
              {sections.map((s) => {
                const isActive = active === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => jumpTo(s.id)}
                    className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                    style={{
                      background: isActive ? 'rgba(204,0,0,0.12)' : 'transparent',
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                    }}
                  >
                    <span
                      className="w-1 h-5 rounded-full shrink-0 transition-all"
                      style={{ background: isActive ? '#CC0000' : 'transparent' }}
                    />
                    <span className="font-mono text-xs" style={{ color: isActive ? '#FF3333' : 'rgba(255,255,255,0.4)' }}>
                      {String(s.number).padStart(2, '0')}
                    </span>
                    <span className="truncate">{s.title}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Document content */}
          <div className="space-y-12 min-w-0">
            {sections.map((s) => (
              <motion.section
                key={s.id}
                id={s.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.15 }}
                transition={{ duration: 0.5 }}
                className="scroll-mt-28"
              >
                <div className="flex items-center gap-3 mb-5">
                  <span
                    className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-mono text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #CC0000, #990000)' }}
                  >
                    {String(s.number).padStart(2, '0')}
                  </span>
                  <h2 className="text-white font-semibold text-xl sm:text-2xl">{s.title}</h2>
                </div>
                <div className="pl-0 sm:pl-12">{s.body}</div>
              </motion.section>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
