import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';

/**
 * useSessionTimeout — customer-only session-security engine.
 *
 * CRITICAL GUARDRAIL: these rules apply ONLY to standard customer dashboards
 * (`/dashboard/*`). They are completely inert for admins or admin routes
 * (`/admin/*`). The hook short-circuits before attaching any listeners/timers
 * when the active context is not a customer dashboard.
 *
 * Enforced policies:
 *   1. 5-minute INACTIVITY auto-logout (mousemove/keydown/click/scroll/touchstart).
 *   2. 1-hour ABSOLUTE session lifespan (hard cap, even while active).
 *   3. CONCURRENT-login / single-device enforcement via /auth/session-status poll.
 *
 * Returns: { concurrentKicked, resolveKick }
 *   concurrentKicked — true when the server reports this session was superseded
 *                      on another device (the layout should render the dialog).
 *   resolveKick      — wipe local state and bounce to /login (dialog button).
 */
const INACTIVITY_MS = 5 * 60 * 1000;   // 300000 — 5 minutes
const ABSOLUTE_MS   = 60 * 60 * 1000;  // 3600000 — 1 hour
const POLL_MS       = 20 * 1000;       // concurrent-login heartbeat cadence
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];

// Wipe every client-side auth artifact (token + cached user + session markers).
function wipeSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('adminToken');
  localStorage.removeItem('user');
  localStorage.removeItem('loginTime');
}

export default function useSessionTimeout() {
  const location = useLocation();
  const lastActivityRef = useRef(Date.now());
  const kickedRef = useRef(false);
  const [concurrentKicked, setConcurrentKicked] = useState(false);

  // Is the engine allowed to run in the current context?
  // Only on customer `/dashboard/*` routes, never for admins/admin routes.
  const onCustomerRoute = location.pathname.startsWith('/dashboard');
  const onAdminRoute = location.pathname.startsWith('/admin');
  const isAdmin = !!localStorage.getItem('adminToken');
  let userRole = '';
  try { userRole = (JSON.parse(localStorage.getItem('user') || '{}').role || '').toLowerCase(); }
  catch { userRole = ''; }
  const active = onCustomerRoute && !onAdminRoute && !isAdmin && userRole !== 'admin';

  // Hard logout → wipe + redirect (used for inactivity & absolute caps).
  const hardLogout = useCallback((message) => {
    wipeSession();
    if (message) {
      // eslint-disable-next-line no-alert
      window.alert(message);
    }
    window.location.replace('/login');
  }, []);

  // Dialog button handler for the concurrent-login case.
  const resolveKick = useCallback(() => {
    wipeSession();
    window.location.replace('/login');
  }, []);

  useEffect(() => {
    if (!active) return undefined;

    // ── Activity tracking (resets the inactivity clock) ────────────────────
    lastActivityRef.current = Date.now();
    const markActivity = () => { lastActivityRef.current = Date.now(); };
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, markActivity, { passive: true }));

    // Ensure an absolute-session marker exists even on a hard refresh.
    if (!localStorage.getItem('loginTime')) {
      localStorage.setItem('loginTime', String(Date.now()));
    }

    // ── 1s tick: inactivity (5 min) + absolute lifespan (1 hr) ─────────────
    const tick = setInterval(() => {
      if (kickedRef.current) return;
      const now = Date.now();

      if (now - lastActivityRef.current >= INACTIVITY_MS) {
        kickedRef.current = true;
        clearInterval(tick);
        hardLogout('Logged out due to inactivity.');
        return;
      }

      const loginTime = parseInt(localStorage.getItem('loginTime') || '0', 10);
      if (loginTime && now - loginTime >= ABSOLUTE_MS) {
        kickedRef.current = true;
        clearInterval(tick);
        hardLogout('Your secure session has reached its 1-hour limit. Please sign in again.');
      }
    }, 1000);

    // ── Concurrent-login heartbeat ─────────────────────────────────────────
    const poll = setInterval(async () => {
      if (kickedRef.current) return;
      try {
        const { data } = await api.get('/auth/session-status');
        if (data?.data?.active === false) {
          kickedRef.current = true;
          clearInterval(poll);
          clearInterval(tick);
          // Token is already dead server-side — wipe it now so no further
          // authenticated calls can succeed, but keep the dialog on screen.
          localStorage.removeItem('token');
          setConcurrentKicked(true);
        }
      } catch {
        // Network/transient error → ignore; never nuisance-logout on a blip.
      }
    }, POLL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActivity));
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [active, hardLogout]);

  return { concurrentKicked, resolveKick };
}
