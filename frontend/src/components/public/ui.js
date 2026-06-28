// ──────────────────────────────────────────────────────────────────────────
// ALISTER BANK · Shared design tokens + Framer Motion variants for the public site
// Strict palette: red / black / white only.
// ──────────────────────────────────────────────────────────────────────────

export const COLORS = {
  red: '#CC0000',
  redDark: '#990000',
  redLight: '#FF3333',
  redGlow: 'rgba(204,0,0,0.15)',
  black: '#0A0A0A',
  blackSoft: '#1A1A1A',
  blackMedium: '#2D2D2D',
  blackLight: '#3D3D3D',
  white: '#FFFFFF',
  whiteSoft: '#F5F5F5',
  whiteMuted: '#E8E8E8',
};

export const GRADIENTS = {
  hero: 'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 50%, #2D0000 100%)',
  red: 'linear-gradient(135deg, #CC0000, #FF3333)',
  cardDark: 'linear-gradient(145deg, #1A1A1A, #0A0A0A)',
};

// Scroll-reveal container that staggers its children.
export const staggerContainer = (stagger = 0.1, delayChildren = 0) => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

// Generic fade-up item used for staggered grids/lists.
export const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6 } },
};

export const fadeLeft = {
  hidden: { opacity: 0, x: -60 },
  show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

export const fadeRight = {
  hidden: { opacity: 0, x: 60 },
  show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
};

// Shared whileInView config so reveals fire once when ~20% visible.
export const inView = { once: true, amount: 0.2 };

// Indian-rupee formatter helpers used by calculators.
export const formatINR = (value) =>
  '$' + Math.round(value).toLocaleString('en-US');

export const formatINRShort = (value) => {
  if (value >= 1e7) return '$' + (value / 1e7).toFixed(2) + ' Cr';
  if (value >= 1e5) return '$' + (value / 1e5).toFixed(2) + ' L';
  if (value >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(value);
};
