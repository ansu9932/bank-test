import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

// Fixed top-left "Back to Home" pill button shared by the auth / onboarding
// pages (Login, Open Account, Forgot Password). Purely navigational — routes
// the user to the public homepage. No page logic depends on it.
// variant: 'dark' (default, for dark pages) | 'light' (for light pages).
export default function BackToHome({ variant = 'dark' }) {
  const navigate = useNavigate();
  const styles = variant === 'light'
    ? 'text-[#44474e] border border-[#c4c6cf]/60 bg-[#e9e8e7] hover:bg-[#e3e2e2] hover:text-[#1b1c1c]'
    : 'text-white/70 border border-white/10 bg-white/[0.05] backdrop-blur-[10px] hover:bg-[rgba(204,0,0,0.1)] hover:border-[rgba(204,0,0,0.3)] hover:text-white';
  return (
    <motion.button
      type="button"
      onClick={() => navigate('/')}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      whileHover={{ x: -3 }}
      whileTap={{ scale: 0.96 }}
      className={`fixed top-4 left-4 sm:top-6 sm:left-6 z-50 flex items-center gap-2 rounded-full px-3.5 py-1.5 sm:px-[18px] sm:py-2 text-[13px] font-medium transition-colors duration-200 ${styles}`}
    >
      <span style={{ color: variant === 'light' ? '#ba1a1a' : '#CC0000', fontSize: 14 }}>←</span>
      Back to Home
    </motion.button>
  );
}
