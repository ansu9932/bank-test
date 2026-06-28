import React, { useRef } from 'react';

// Lightweight pure-CSS 3D tilt wrapper. Tracks the mouse over the element
// and applies a subtle perspective rotation (max ~8deg) for a premium depth feel.
export default function TiltCard({ children, className = '', max = 8, style = {}, ...rest }) {
  const ref = useRef(null);

  const handleMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rotateX = (y - 0.5) * -2 * max;
    const rotateY = (x - 0.5) * 2 * max;
    el.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-6px)`;
  };

  const handleLeave = () => {
    const el = ref.current;
    if (el) el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={`al-tilt ${className}`}
      style={style}
      {...rest}
    >
      {children}
    </div>
  );
}
