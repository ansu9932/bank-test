import { useEffect, useRef, useCallback } from 'react';

/* ──────────────────────────────────────────────────────────────────────────
   useEntryPageGuard — navigation cleanup guard for entry pipeline pages
   (Login & Open Account).

   On react-router v6 with <BrowserRouter>, the data-router-only `useBlocker`
   hook is unavailable, so this guard achieves the same intent with two
   reliable signals:

     1. Component UNMOUNT — fires when the user navigates away in-app (clicking
        a link, header nav, or the browser Back button all unmount the route
        element). The cleanup runs here.
     2. `beforeunload` — fires on hard refresh / tab close / external nav, so
        any half-filled state in storage is wiped on the way out too.

   The cleanup:
     • runs a caller-supplied resetState() to clear in-memory form/signup vars,
     • wipes sessionStorage + caller-named temp localStorage keys + entry cookies,
     • optionally redirects to the public homepage (in-app nav only).

   A successful submit (login → dashboard, onboarding complete) should call
   `allowNavigation()` first so the guard treats that exit as intentional and
   skips the redirect-home (state is still cleared — that's always safe).
   ────────────────────────────────────────────────────────────────────────── */

const DEFAULT_COOKIES = ['signup_session', 'onboarding_token', 'entry_token'];
// Destinations that are legitimate exits from an entry page — navigating to any
// of these only triggers state cleanup, NOT a redirect-home (so cross-links like
// Login→Open Account and the post-submit success route keep working).
const DEFAULT_ALLOWED_PATHS = [
  '/login', '/open-account', '/forgot-password', '/reset-password',
  '/account-setup', '/video-kyc', '/cyber-kyc', '/dashboard',
];

export default function useEntryPageGuard({
  resetState,
  storageKeys = [],
  cookieKeys = DEFAULT_COOKIES,
  allowedPaths = DEFAULT_ALLOWED_PATHS,
  redirectHome = true,
} = {}) {
  // Stable refs so the unmount effect never re-runs mid-session.
  const allowNavRef = useRef(false);
  const resetRef = useRef(resetState);
  resetRef.current = resetState;
  const storageKeysRef = useRef(storageKeys);
  storageKeysRef.current = storageKeys;
  const cookieKeysRef = useRef(cookieKeys);
  cookieKeysRef.current = cookieKeys;
  const allowedPathsRef = useRef(allowedPaths);
  allowedPathsRef.current = allowedPaths;

  // Wipe browser-side temp state allocated to the entry pipeline.
  const wipeStorage = useCallback(() => {
    try {
      // Clear the whole sessionStorage (entry pipeline only ever lives here).
      window.sessionStorage.clear();
    } catch { /* storage unavailable — ignore */ }

    try {
      (storageKeysRef.current || []).forEach((k) => window.localStorage.removeItem(k));
    } catch { /* ignore */ }

    // Expire any half-set entry cookies.
    try {
      (cookieKeysRef.current || []).forEach((name) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      });
    } catch { /* ignore */ }
  }, []);

  // Mark the next exit as an intentional, successful navigation.
  const allowNavigation = useCallback(() => { allowNavRef.current = true; }, []);

  // Run the full cleanup (state + storage). Safe to call repeatedly.
  const runCleanup = useCallback(() => {
    try { if (typeof resetRef.current === 'function') resetRef.current(); } catch { /* ignore */ }
    wipeStorage();
  }, [wipeStorage]);

  useEffect(() => {
    // Hard refresh / tab close / external navigation → wipe storage on the way out.
    const onBeforeUnload = () => { wipeStorage(); };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // In-app navigation away (link / nav / back button unmounts this route).
      runCleanup();
      // By the time this cleanup runs, react-router has already updated the URL
      // to the destination. Redirect to the public homepage ONLY when leaving to
      // a non-whitelisted destination and this wasn't a sanctioned success exit.
      if (redirectHome && !allowNavRef.current) {
        try {
          const dest = window.location.pathname;
          const isAllowed = dest === '/'
            || (allowedPathsRef.current || []).some((p) => dest === p || dest.startsWith(`${p}/`));
          if (!isAllowed) {
            window.location.replace('/');
          }
        } catch { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { allowNavigation, runCleanup, wipeStorage };
}
