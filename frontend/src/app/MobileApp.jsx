/**
 * Mobile app shell — everything under /app/*.
 *
 * Flow control:
 *   no device registration          → onboarding (Customer ID → OTP → password → MPIN)
 *   device registered, no session   → MPIN lock screen
 *   session active                  → main app (Home / Pay / History / Menu)
 *
 * Theme is scoped with .mobile-app + data-app-theme so the website is
 * completely unaffected.
 */
import { useEffect, useState, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import appStorage from '../services/appStorage';
import {
  hasDeviceRegistration, isAppAuthenticated, isInactivityLocked,
  touchAppActivity, lockApp,
} from './services/appAuth';
import './app.css';

import OnboardingFlow from './onboarding/OnboardingFlow';
import LockScreen from './onboarding/LockScreen';
import HomeScreen from './screens/HomeScreen';
import PayScreen from './screens/PayScreen';
import HistoryScreen from './screens/HistoryScreen';
import MenuScreen from './screens/MenuScreen';
import { BottomNav } from './components/AppUI';

// ─── Theme context (light/dark, persisted, scoped to /app) ───────────────────
const ThemeCtx = createContext({ theme: 'dark', toggle: () => {} });
export const useAppTheme = () => useContext(ThemeCtx);

// ─── Entry decision ──────────────────────────────────────────────────────────
function AppEntry() {
  // Cold-start inactivity check: even with a valid token, >10 min since the
  // app was last in the foreground forces the MPIN lock screen.
  if (isAppAuthenticated() && isInactivityLocked()) {
    lockApp();
    return <Navigate to="/app/lock" replace />;
  }
  if (isAppAuthenticated()) return <Navigate to="/app/home" replace />;
  if (hasDeviceRegistration()) return <Navigate to="/app/lock" replace />;
  return <Navigate to="/app/onboarding" replace />;
}

// ─── Auth gate for main screens ──────────────────────────────────────────────
function RequireAppAuth({ children }) {
  if (isAppAuthenticated() && isInactivityLocked()) {
    lockApp();
    return <Navigate to="/app/lock" replace />;
  }
  if (!isAppAuthenticated()) {
    return <Navigate to={hasDeviceRegistration() ? '/app/lock' : '/app/onboarding'} replace />;
  }
  return children;
}

function MainLayout({ children }) {
  return (
    <>
      <div className="flex-1 flex flex-col overflow-y-auto">{children}</div>
      <BottomNav />
    </>
  );
}

// ─── Auto-lock: 10 minutes of inactivity requires the MPIN again ─────────────
// Activity is stamped to secure storage while the app is visible, so the
// check works across backgrounding AND full app kills (swipe-from-recents).
function useAutoLock() {
  const navigate = useNavigate();
  useEffect(() => {
    const INACTIVITY_MS = 10 * 60 * 1000;

    // Stamp activity now, on any interaction, and every 30s while visible.
    touchAppActivity();
    const stamp = () => {
      if (document.visibilityState === 'visible') touchAppActivity();
    };
    const interval = setInterval(stamp, 30 * 1000);
    document.addEventListener('pointerdown', stamp);
    document.addEventListener('keydown', stamp);

    let hiddenAt = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        touchAppActivity(); // last-seen moment, read again on cold start
      } else if (hiddenAt && Date.now() - hiddenAt > INACTIVITY_MS && isAppAuthenticated()) {
        appStorage.removeItem('token');
        appStorage.removeItem('refreshToken');
        navigate('/app/lock', { replace: true });
      } else {
        touchAppActivity();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('pointerdown', stamp);
      document.removeEventListener('keydown', stamp);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [navigate]);
}

export default function MobileApp() {
  const [theme, setTheme] = useState(() => appStorage.getItem('appTheme') || 'dark');
  useAutoLock();

  const toggle = () => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      appStorage.setItem('appTheme', next);
      return next;
    });
  };

  // Keep the page background matched while inside /app (restored on unmount).
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = theme === 'dark' ? '#0a0a0a' : '#f6f6f4';
    return () => { document.body.style.background = prev; };
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      <div className="mobile-app" data-app-theme={theme}>
        <div className="mobile-app-frame">
          <Routes>
            <Route index element={<AppEntry />} />
            <Route path="onboarding/*" element={<OnboardingFlow />} />
            <Route path="lock" element={<LockScreen />} />
            <Route path="home" element={<RequireAppAuth><MainLayout><HomeScreen /></MainLayout></RequireAppAuth>} />
            <Route path="pay" element={<RequireAppAuth><MainLayout><PayScreen /></MainLayout></RequireAppAuth>} />
            <Route path="history" element={<RequireAppAuth><MainLayout><HistoryScreen /></MainLayout></RequireAppAuth>} />
            <Route path="menu/*" element={<RequireAppAuth><MainLayout><MenuScreen /></MainLayout></RequireAppAuth>} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}
