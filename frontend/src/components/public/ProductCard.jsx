import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { fadeUp } from './ui';
import TiltCard from './TiltCard';

// Reusable dark glass product card with red icon, hover lift + glow and a
// "Learn More" link. Used in the homepage products grid and elsewhere.
export default function ProductCard({ emoji, title, subtitle, to = '/open-account', cta = 'Learn More' }) {
  return (
    <motion.div variants={fadeUp}>
      <TiltCard
        max={7}
        className="group relative h-full rounded-2xl p-7 overflow-hidden border border-white/[0.08] al-glass transition-colors duration-300 hover:border-[#CC0000]"
      >
        {/* Red left accent bar appears on hover */}
        <span className="absolute left-0 top-0 h-full w-1 scale-y-0 group-hover:scale-y-100 origin-top transition-transform duration-300"
          style={{ background: 'linear-gradient(180deg, #FF3333, #990000)' }} />

        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl mb-5"
          style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}
        >
          {emoji}
        </div>
        <h3 className="text-white font-semibold text-xl mb-2">{title}</h3>
        <p className="text-sm mb-6" style={{ color: 'rgba(255,255,255,0.6)' }}>{subtitle}</p>
        <Link
          to={to}
          className="inline-flex items-center gap-1.5 text-sm font-semibold transition-gap"
          style={{ color: '#FF3333' }}
        >
          {cta}
          <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
        </Link>
      </TiltCard>
    </motion.div>
  );
}
