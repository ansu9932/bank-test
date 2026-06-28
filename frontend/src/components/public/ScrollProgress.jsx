import React from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

// Thin red progress bar fixed at the very top of the viewport.
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  return (
    <motion.div
      aria-hidden="true"
      style={{
        scaleX,
        transformOrigin: '0%',
        background: 'linear-gradient(90deg, #990000, #CC0000, #FF3333)',
      }}
      className="fixed top-0 left-0 right-0 h-[3px] z-[9999]"
    />
  );
}
