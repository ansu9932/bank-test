import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Wifi } from 'lucide-react';

// Signature hero visual: a realistic bank card rendered in CSS 3D perspective
// that tracks the mouse for live rotateX / rotateY, floats gently, and casts a
// glowing red shadow.
export default function HeroCard3D() {
  const cardRef = useRef(null);

  const handleMouseMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateX = (y - 0.5) * 20;
    const rotateY = (x - 0.5) * -20;
    el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
  };

  const handleMouseLeave = () => {
    const el = cardRef.current;
    if (el) el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
      style={{ perspective: 1000 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Slow rotating conic halo behind the card */}
      <div
        className="al-halo pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[460px] h-[460px] rounded-full blur-[70px] opacity-70"
        aria-hidden="true"
      />

      {/* Glow shadow beneath the card */}
      <div
        className="absolute left-1/2 -translate-x-1/2 bottom-[-30px] w-[80%] h-10 rounded-full blur-2xl"
        style={{ background: 'rgba(204,0,0,0.45)' }}
      />

      <div className="al-float">
        <div
          ref={cardRef}
          className="al-keep-dark relative w-[330px] sm:w-[380px] h-[215px] sm:h-[240px] rounded-3xl p-6 flex flex-col justify-between overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, #1A1A1A 0%, #0A0A0A 55%, #2D0000 100%)',
            boxShadow: '0 30px 80px rgba(204,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.08)',
            transition: 'transform 0.5s ease',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Red shimmer sweep */}
          <div className="absolute inset-0 al-shimmer pointer-events-none" />
          <div
            className="absolute -top-20 -right-20 w-56 h-56 rounded-full blur-3xl"
            style={{ background: 'rgba(204,0,0,0.25)' }}
          />

          {/* Top row */}
          <div className="relative flex items-center justify-between">
            <span className="font-bold tracking-widest text-white text-sm">ALISTER BANK</span>
            <Wifi size={22} className="text-white/70 rotate-90" />
          </div>

          {/* Chip + number */}
          <div className="relative">
            <div
              className="w-12 h-9 rounded-md mb-4"
              style={{ background: 'linear-gradient(135deg, #f5d488, #c9a24b)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4)' }}
            />
            <p className="font-mono tracking-[0.18em] text-white text-lg sm:text-xl">
              •••• •••• •••• 4521
            </p>
          </div>

          {/* Bottom row */}
          <div className="relative flex items-end justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-white/40">Card Holder</p>
              <p className="text-sm text-white/90 font-medium tracking-wide">A. PREMIUM</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest text-white/40">Expires</p>
              <p className="text-sm text-white/90 font-medium">08/30</p>
            </div>
            <div
              className="font-serif-display font-extrabold text-2xl"
              style={{ color: '#FF3333' }}
            >
              AB
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
