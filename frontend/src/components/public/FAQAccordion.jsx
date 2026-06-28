import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

// Animated FAQ / accordion list. Accepts items: [{ q, a }].
export default function FAQAccordion({ items, allowMultiple = false }) {
  const [open, setOpen] = useState(allowMultiple ? [] : null);

  const isOpen = (i) => (allowMultiple ? open.includes(i) : open === i);

  const toggle = (i) => {
    if (allowMultiple) {
      setOpen((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
    } else {
      setOpen((prev) => (prev === i ? null : i));
    }
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="rounded-2xl border overflow-hidden transition-colors"
          style={{
            background: 'rgba(255,255,255,0.03)',
            borderColor: isOpen(i) ? 'rgba(204,0,0,0.4)' : 'rgba(255,255,255,0.08)',
          }}
        >
          <button
            onClick={() => toggle(i)}
            aria-expanded={isOpen(i)}
            className="w-full flex items-center justify-between gap-4 px-5 sm:px-6 py-5 text-left"
          >
            <span className="text-white font-medium text-base sm:text-lg">{item.q}</span>
            <span
              className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: isOpen(i) ? '#CC0000' : 'rgba(255,255,255,0.06)' }}
            >
              {isOpen(i) ? <Minus size={16} className="text-white" /> : <Plus size={16} style={{ color: '#FF3333' }} />}
            </span>
          </button>
          <AnimatePresence initial={false}>
            {isOpen(i) && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <p className="px-5 sm:px-6 pb-5 text-sm sm:text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {item.a}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
