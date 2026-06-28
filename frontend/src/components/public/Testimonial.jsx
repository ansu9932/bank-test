import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, ChevronLeft, ChevronRight, Quote } from 'lucide-react';

const REVIEWS = [
  {
    text: 'Opening my account took barely five minutes with the video KYC. Transfers are genuinely instant and I have never paid a hidden charge. Alister Bank simply works.',
    name: 'Ananya Sharma',
    city: 'Bengaluru',
    since: '2022',
  },
  {
    text: 'As a small business owner the current account limits and bulk payments saved me hours every week. Support actually picks up the phone, day or night.',
    name: 'Rohit Mehra',
    city: 'Pune',
    since: '2021',
  },
  {
    text: 'The app is beautiful and fast. I moved my fixed deposits here for the better rates and have never looked back. Best digital banking experience in India.',
    name: 'Fatima Khan',
    city: 'Hyderabad',
    since: '2023',
  },
  {
    text: 'I was nervous about a fully digital bank, but the security features and instant card lock gave me complete peace of mind. Highly recommended.',
    name: 'Vikram Nair',
    city: 'Kochi',
    since: '2020',
  },
];

export default function Testimonial() {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);

  const go = useCallback((next) => {
    setDir(next > index || (index === REVIEWS.length - 1 && next === 0) ? 1 : -1);
    setIndex((next + REVIEWS.length) % REVIEWS.length);
  }, [index]);

  useEffect(() => {
    const t = setInterval(() => {
      setDir(1);
      setIndex((i) => (i + 1) % REVIEWS.length);
    }, 5500);
    return () => clearInterval(t);
  }, []);

  const r = REVIEWS[index];

  return (
    <div className="relative max-w-3xl mx-auto">
      <div
        className="relative rounded-3xl p-8 sm:p-12 al-glass border border-white/[0.08] overflow-hidden min-h-[300px] flex flex-col justify-center"
      >
        <Quote size={80} className="absolute -top-2 left-4 opacity-10" style={{ color: '#CC0000' }} />
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={index}
            custom={dir}
            initial={{ opacity: 0, x: dir * 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -50 }}
            transition={{ duration: 0.4 }}
            className="relative"
          >
            <div className="flex gap-1 mb-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={18} fill="#CC0000" style={{ color: '#CC0000' }} />
              ))}
            </div>
            <p className="text-lg sm:text-xl text-white/85 leading-relaxed mb-6">"{r.text}"</p>
            <div>
              <p className="font-semibold text-white">{r.name}</p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {r.city} · Customer since {r.since}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 mt-7">
        <button
          onClick={() => go(index - 1)}
          aria-label="Previous testimonial"
          className="w-10 h-10 rounded-full flex items-center justify-center border border-white/15 text-white hover:bg-[#CC0000] hover:border-[#CC0000] transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-2">
          {REVIEWS.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Go to testimonial ${i + 1}`}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 24 : 8,
                height: 8,
                background: i === index ? '#CC0000' : 'rgba(255,255,255,0.25)',
              }}
            />
          ))}
        </div>
        <button
          onClick={() => go(index + 1)}
          aria-label="Next testimonial"
          className="w-10 h-10 rounded-full flex items-center justify-center border border-white/15 text-white hover:bg-[#CC0000] hover:border-[#CC0000] transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
