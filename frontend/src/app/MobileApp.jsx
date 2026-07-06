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
import { hasDeviceRegistration, isAppAuthenticated } from './services/appAuth';
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
  if (isAppAuthenticated()) return <Navigate to="/app/home" replace />;
  if (hasDeviceRegistration()) return <Navigate to="/app/lock" replace />;
  return <Navigate to="/app/onboarding" replace />;
}

// ─── Auth gate for main screens ──────────────────────────────────────────────
function RequireAppAuth({ children }) {
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

// ─── Auto-lock: when the native app goes to background, require MPIN again ───
function useAutoLock() {
  const navigate = useNavigate();
  useEffect(() => {
    let hiddenAt = null;
    const GRACE_MS = 60 * 1000; // 1 min grace so quick app switches don't lock
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > GRACE_MS && isAppAuthenticated()) {
        appStorage.removeItem('token');
        appStorage.removeItem('refreshToken');
        navigate('/app/lock', { replace: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
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
            <Route path="menu" element={<RequireAppAuth><MainLayout><MenuScreen /></MainLayout></RequireAppAuth>} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}
