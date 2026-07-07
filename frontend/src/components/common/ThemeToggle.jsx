import React from 'react';
import { useLocation } from 'react-router-dom';
import { RiSunLine, RiMoonLine, RiTimeLine } from 'react-icons/ri';
import useSiteTheme from '../../hooks/useSiteTheme';

/**
 * Floating website theme switcher — bottom-LEFT so it never collides with the
 * AVA chatbot (bottom-right). Cycles: Auto (day/night by clock) → Light → Dark.
 * Hidden on /app/* and /admin/* which have their own theming.
 */
export default function ThemeToggle() {
  const { pathname } = useLocation();
  const { mode, resolved, cycleMode } = useSiteTheme(pathname);

  if (pathname.startsWith('/app') || pathname.startsWith('/admin')) return null;

  const label =
    mode === 'auto'
      ? `Auto theme (currently ${resolved}) — tap for light`
      : mode === 'light'
        ? 'Light theme — tap for dark'
        : 'Dark theme — tap for auto';

  return (
    <button
      type="button"
      onClick={cycleMode}
      aria-label={label}
      title={label}
      className="theme-toggle-fab"
    >
      {mode === 'auto' ? (
        <RiTimeLine aria-hidden="true" />
      ) : mode === 'light' ? (
        <RiSunLine aria-hidden="true" />
      ) : (
        <RiMoonLine aria-hidden="true" />
      )}
      <span className="theme-toggle-label">
        {mode === 'auto' ? 'Auto' : mode === 'light' ? 'Light' : 'Dark'}
      </span>
    </button>
  );
}
