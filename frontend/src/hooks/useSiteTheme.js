import { useEffect, useState, useCallback } from 'react';

/**
 * Website theme manager — automatic day/night switching.
 *
 * Modes (persisted in localStorage `siteThemeMode`):
 *   'auto'  (default) — light during the day, dark from 7 PM to 7 AM local time
 *   'light' — always light
 *   'dark'  — always dark
 *
 * The resolved theme is applied as a `theme-light` class on <html> (dark is
 * the site's native styling, so dark needs no class). In auto mode the hook
 * re-evaluates every minute so the switch happens live at 7 PM / 7 AM without
 * a reload.
 *
 * IMPORTANT: the mobile app (/app/*) and the admin panel (/admin/*) have
 * their own theming and are excluded — the class is stripped there.
 */

const DARK_START_HOUR = 19; // 7 PM
const DARK_END_HOUR = 7;    // 7 AM

function resolveAutoTheme() {
  const h = new Date().getHours();
  return h >= DARK_START_HOUR || h < DARK_END_HOUR ? 'dark' : 'light';
}

function isThemedPath(pathname) {
  return !pathname.startsWith('/app') && !pathname.startsWith('/admin');
}

export function getSavedMode() {
  const saved = window.localStorage.getItem('siteThemeMode');
  return saved === 'light' || saved === 'dark' ? saved : 'auto';
}

export default function useSiteTheme(pathname) {
  const [mode, setMode] = useState(getSavedMode);
  const [resolved, setResolved] = useState(() =>
    mode === 'auto' ? resolveAutoTheme() : mode
  );

  // Apply / strip the class whenever mode, time, or route changes.
  useEffect(() => {
    const apply = () => {
      const theme = mode === 'auto' ? resolveAutoTheme() : mode;
      setResolved(theme);
      const root = document.documentElement;
      if (theme === 'light' && isThemedPath(pathname)) {
        root.classList.add('theme-light');
      } else {
        root.classList.remove('theme-light');
      }
    };
    apply();
    // Re-check every minute so auto mode flips live at 7 AM / 7 PM.
    const interval = setInterval(apply, 60 * 1000);
    return () => clearInterval(interval);
  }, [mode, pathname]);

  const cycleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === 'auto' ? 'light' : prev === 'light' ? 'dark' : 'auto';
      window.localStorage.setItem('siteThemeMode', next);
      return next;
    });
  }, []);

  return { mode, resolved, cycleMode };
}
