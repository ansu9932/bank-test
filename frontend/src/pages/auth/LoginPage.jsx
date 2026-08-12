import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { RiEyeLine, RiEyeOffLine, RiBankLine, RiLockLine, RiUserLine, RiShieldCheckLine, RiRefreshLine, RiFingerprintLine, RiErrorWarningLine, RiQrCodeLine } from 'react-icons/ri';
import { login, clearError } from '../../store/slices/authSlice';
import api from '../../services/api';
import toast from 'react-hot-toast';
import useEntryPageGuard from '../../hooks/useEntryPageGuard';
import BackToHome from '../../components/common/BackToHome';
import QrLoginPanel from '../../components/auth/QrLoginPanel';
import {
  isNativeApp,
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometricLogin,
  biometricLogin,
  isDeviceRooted,
  isEmulatorDevice,
  getDeviceId,
  secureFieldProps,
} from '../../services/biometric';

// Absolute lifespan of the login screen, mirroring the backend login handshake
// TTL (exactly 10 minutes). If the page sits open/idle past this window, the
// handshake the user holds is already dead server-side, so we proactively wipe
// state and bounce to the public homepage.
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

// ── Alister Bank light design system (Material-3 inspired template) ──────────
// Palette: light surfaces + red (error-tone) brand accent. Logic/attributes on
// the inputs themselves are untouched — this only controls appearance.
const RED = '#ba1a1a';          // brand accent (template "error")
const INK = '#1b1c1c';          // on-surface
const MUTED = '#44474e';        // on-surface-variant
const OUTLINE = '#74777f';      // outline
const BORDER = '#c4c6cf';       // outline-variant

const INPUT_CLASS =
  'w-full bg-[#fbf9f9] border border-[#c4c6cf] rounded-lg ' +
  'text-[#1b1c1c] text-[15px] py-3 transition-all duration-200 placeholder:text-[#a9abb4] ' +
  'focus:outline-none focus:border-[#ba1a1a] focus:ring-2 focus:ring-[#ba1a1a]/20';

const LABEL_CLASS = 'block text-[12px] font-semibold tracking-[0.05em] uppercase text-[#44474e] mb-1.5';

const LINK_CLASS = 'text-[#ba1a1a] font-medium hover:underline transition-colors';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector(s => s.auth);
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
  // Login method tab: 'password' (default) or 'qr' — QR mounts QrLoginPanel,
  // which manages its own session lifecycle and unmount cleanup.
  const [mode, setMode] = useState('password');
  // Self-hosted captcha (image + opaque token from the backend).
  const [captcha, setCaptcha] = useState({ svg: '', token: '' });
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  // HDFC-style ephemeral handshake token. Fetched on mount, mirrored into the
  // URL as ?h=, and echoed back on submit so the backend can block replays.
  const [handshakeToken, setHandshakeToken] = useState('');
  const fetchedRef = useRef(false);
  // Wall-clock moment the handshake initialized; drives the idle-expiry timer.
  const handshakeStartRef = useRef(0);

  // ── Native app security state (Android APK only — all inert on web) ───────
  // rooted:     device failed the RootBeer integrity check → login is BLOCKED.
  // canBiometric: sensor available + user previously enabled biometric login →
  //               show the fingerprint quick-login button.
  const [rooted, setRooted] = useState(false);
  const [canBiometric, setCanBiometric] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    (async () => {
      // Rooted devices AND emulators get the same hard block: neither offers
      // the Keystore/FLAG_SECURE guarantees a banking session depends on.
      const [isRooted, isEmu] = await Promise.all([isDeviceRooted(), isEmulatorDevice()]);
      if (isRooted || isEmu) {
        setRooted(true);
        return; // compromised environment → do not even offer biometric login
      }
      if (isBiometricEnabled() && (await isBiometricAvailable())) {
        setCanBiometric(true);
      }
    })();
  }, []);

  // Fingerprint quick login: OS biometric prompt → stored credentials →
  // the exact same Redux login flow as a manual password submit.
  const handleBiometricLogin = async () => {
    setBioBusy(true);
    try {
      const creds = await biometricLogin();
      if (!creds) { toast.error('Biometric authentication failed'); return; }
      const tokenFromUrl = new URLSearchParams(window.location.search).get('h');
      let hToken = handshakeToken || tokenFromUrl || '';
      if (!hToken) hToken = await initHandshake();
      const result = await dispatch(login({ ...creds, handshakeToken: hToken, biometric: true, deviceId: getDeviceId() }));
      if (login.fulfilled.match(result)) {
        allowNavigation();
        toast.success('Welcome back!');
        navigate('/dashboard');
      } else {
        initHandshake();
        loadCaptcha();
      }
    } finally {
      setBioBusy(false);
    }
  };

  // Navigation guard: wipe credentials/temp state if the user leaves the login
  // page, and redirect to the homepage on a non-whitelisted exit.
  const { allowNavigation, runCleanup } = useEntryPageGuard({
    resetState: () => { setForm({ username: '', password: '' }); setShowPwd(false); },
  });

  // ── Secure handshake bootstrap ───────────────────────────────────────────
  // Mint a short-lived state token, then reflect it in the address bar so the
  // login gateway behaves like an enterprise SSO redirect handshake.
  const initHandshake = async () => {
    try {
      const { data } = await api.get('/auth/login-handshake');
      const token = data?.data?.handshakeToken;
      if (token) {
        setHandshakeToken(token);
        handshakeStartRef.current = Date.now();
        const url = new URL(window.location.href);
        url.searchParams.set('h', token);
        window.history.replaceState({}, '', url);
        return token;
      }
    } catch {
      // Non-fatal: login proceeds without it (backend treats it as soft).
      setHandshakeToken('');
    }
    return '';
  };

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    initHandshake();
    loadCaptcha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch a fresh captcha image + token from the backend.
  const loadCaptcha = async () => {
    setCaptchaLoading(true);
    setCaptchaAnswer('');
    try {
      const { data } = await api.get('/auth/captcha');
      setCaptcha({ svg: data.data.svg, token: data.data.token });
    } catch {
      setCaptcha({ svg: '', token: '' });
    } finally {
      setCaptchaLoading(false);
    }
  };

  // ── Idle / expiry watchdog ─────────────────────────────────────────────────
  // Poll elapsed time since the handshake initialized. Once the 10-minute login
  // window is exceeded, forcefully break the active state: clear the in-memory
  // form + transient storage/tokens, then redirect to the public homepage.
  useEffect(() => {
    const id = setInterval(() => {
      const startedAt = handshakeStartRef.current;
      if (startedAt && Date.now() - startedAt > LOGIN_WINDOW_MS) {
        clearInterval(id);
        runCleanup();            // reset form + wipe session/local storage + cookies
        setHandshakeToken('');
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('h');
          window.history.replaceState({}, '', url);
        } catch { /* ignore */ }
        toast.error('Your secure login session expired. Redirecting to home…');
        window.location.replace('/');
      }
    }, 15 * 1000); // check every 15s — cheap, and well within the 10-min window
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) { toast.error(error); dispatch(clearError()); }
  }, [error]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) { toast.error('Please fill all fields'); return; }
    if (!captchaAnswer.trim()) { toast.error('Please enter the captcha'); return; }
    // Prefer in-state token; fall back to the URL param if state was reset.
    const tokenFromUrl = new URLSearchParams(window.location.search).get('h');
    let hToken = handshakeToken || tokenFromUrl || '';
    // Best-effort: mint a handshake inline if we don't have one — but NEVER
    // block login on it. The backend treats the handshake as a soft anti-replay
    // signal, so a transient handshake hiccup must not stop a valid login.
    if (!hToken) hToken = await initHandshake();
    const result = await dispatch(login({
      ...form,
      handshakeToken: hToken,
      deviceId: getDeviceId(),
      captchaToken: captcha.token,
      captchaAnswer,
    }));
    if (login.fulfilled.match(result)) {
      allowNavigation(); // sanctioned success exit → no redirect-home
      toast.success('Welcome back!');
      // Native app: after the first successful PASSWORD login, offer to turn
      // on biometric unlock (also toggleable later in Settings → Security).
      if (isNativeApp() && !isBiometricEnabled() && (await isBiometricAvailable())) {
        // eslint-disable-next-line no-alert
        if (window.confirm('Enable fingerprint / face unlock for faster secure logins?')) {
          const enabled = await enableBiometricLogin({ username: form.username, password: form.password });
          if (enabled) toast.success('Biometric login enabled');
        }
      }
      navigate('/dashboard');
    } else {
      // Handshake + captcha are single-use; on any failure refresh both for the retry.
      initHandshake();
      loadCaptcha();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fbf9f9] text-[#1b1c1c] relative">
      {/* Back to Home (fixed top-left) */}
      <BackToHome variant="light" />

      {/* Main split content */}
      <main className="flex-1 flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto relative">
        {/* Left pane — messaging */}
        <motion.section
          initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
          className="hidden lg:flex w-full lg:w-5/12 bg-[#f5f3f3] px-16 py-20 flex-col justify-center relative z-10"
        >
          <div className="max-w-md mx-auto w-full">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-14">
              <div className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm" style={{ background: RED }}>
                <RiBankLine className="text-white text-2xl" />
              </div>
              <div>
                <p className="font-bold text-[20px] tracking-tight" style={{ color: INK }}>ALISTER BANK</p>
                <p className="text-[11px] font-semibold tracking-[0.2em] uppercase" style={{ color: MUTED }}>Digital Banking</p>
              </div>
            </div>

            <h1 className="text-[44px] leading-[52px] font-bold tracking-[-0.02em] mb-4 text-balance" style={{ color: INK }}>
              Banking that<br />
              <span style={{ color: RED }}>works for you.</span>
            </h1>
            <p className="text-[17px] leading-relaxed mb-12" style={{ color: MUTED }}>
              Secure, modern digital banking with real-time transactions, instant transfers, and powerful financial insights.
            </p>

            {/* Features */}
            <ul className="space-y-5">
              {[
                { Icon: RiLockLine, color: OUTLINE, label: 'Bank-grade 256-bit encryption' },
                { Icon: RiRefreshLine, color: RED, label: 'Instant IMPS/NEFT/RTGS transfers' },
                { Icon: RiShieldCheckLine, color: '#115cb9', label: 'Smart spending analytics' },
                { Icon: RiBankLine, color: '#465f88', label: 'International banking standards' },
              ].map(({ Icon, color, label }, i) => (
                <motion.li
                  key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex items-center gap-4"
                >
                  <Icon className="text-[20px] flex-shrink-0" style={{ color }} />
                  <span className="text-[15px]" style={{ color: MUTED }}>{label}</span>
                </motion.li>
              ))}
            </ul>
          </div>

          <p className="absolute bottom-10 left-16 text-[11px] font-semibold tracking-[0.05em]" style={{ color: BORDER }}>
            © 2024 Alister Bank. SWIFT: ALSTINBB
          </p>
        </motion.section>

        {/* Right pane — login card */}
        <section className="w-full lg:w-7/12 relative flex flex-col items-center justify-center p-4 md:p-16">
          {/* Soft architectural background wash */}
          <div
            aria-hidden="true"
            className="absolute inset-0 z-0 opacity-60"
            style={{ background: 'radial-gradient(ellipse 80% 60% at 70% 30%, #efeded 0%, transparent 70%), radial-gradient(ellipse 60% 50% at 20% 80%, #e9e8e7 0%, transparent 70%)' }}
          />

          <motion.div
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
            className="relative z-10 w-full max-w-[440px]"
          >
            {/* Mobile logo */}
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: RED }}>
                <RiBankLine className="text-white text-lg" />
              </div>
              <div>
                <p className="font-bold text-[17px]" style={{ color: INK }}>ALISTER BANK</p>
                <p className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: MUTED }}>Digital Banking</p>
              </div>
            </div>

            <div className="w-full bg-white rounded-xl border border-[#c4c6cf]/40 p-6 md:p-10 shadow-[0_10px_40px_rgba(27,28,28,0.08)]">
              {/* Card header */}
              <div className="text-center mb-8">
                <div
                  className="w-12 h-12 mx-auto mb-3 rounded-xl flex items-center justify-center"
                  style={{ background: '#ffdad6', border: '1px solid rgba(186,26,26,0.2)' }}
                >
                  <RiShieldCheckLine className="text-[24px]" style={{ color: RED }} />
                </div>
                <h2 className="font-semibold text-[24px]" style={{ color: INK }}>Welcome back</h2>
                <p className="text-[14px] mt-1" style={{ color: RED }}>Sign in to your account to continue</p>
              </div>

              {/* Login method tabs: Password | Scan QR */}
              <div className="flex p-1 rounded-lg bg-[#e9e8e7] mb-8" role="tablist" aria-label="Login method">
                <button
                  type="button" role="tab" aria-selected={mode === 'password'}
                  onClick={() => setMode('password')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[14px] font-medium transition-colors ${
                    mode === 'password' ? 'text-white shadow-sm' : 'text-[#44474e] hover:bg-[#efeded]'
                  }`}
                  style={mode === 'password' ? { background: RED } : undefined}
                >
                  <RiLockLine className="text-base" /> Password
                </button>
                <button
                  type="button" role="tab" aria-selected={mode === 'qr'}
                  onClick={() => setMode('qr')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-[14px] font-medium transition-colors ${
                    mode === 'qr' ? 'text-white shadow-sm' : 'text-[#44474e] hover:bg-[#efeded]'
                  }`}
                  style={mode === 'qr' ? { background: RED } : undefined}
                >
                  <RiQrCodeLine className="text-base" /> Scan to Login
                </button>
              </div>

            {/* QR mode — approve on the phone; no password ever typed here */}
            {mode === 'qr' && <QrLoginPanel onSuccess={allowNavigation} />}

              <form onSubmit={handleSubmit} className={`space-y-5 ${mode === 'qr' ? 'hidden' : ''}`}>
                <div>
                  <label className={LABEL_CLASS}>Username or Email</label>
                  <div className="relative">
                    <RiUserLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#74777f] text-base" />
                    <input
                      type="text"
                      value={form.username}
                      onChange={e => setForm({ ...form, username: e.target.value })}
                      placeholder="Enter username or email"
                      className={`${INPUT_CLASS} pl-10 pr-4`}
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div>
                  <label className={LABEL_CLASS}>Password</label>
                  <div className="relative">
                    <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#74777f] text-base" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={form.password}
                      onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="Enter your password"
                      className={`${INPUT_CLASS} pl-10 pr-10`}
                      autoComplete="current-password"
                      {...secureFieldProps()}
                    />
                    <button type="button" onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#74777f] hover:text-[#1b1c1c] transition-colors">
                      {showPwd ? <RiEyeOffLine /> : <RiEyeLine />}
                    </button>
                  </div>
                  <div className="text-right mt-2">
                    <Link to="/forgot-password" className={`${LINK_CLASS} text-sm`}>
                      Forgot password?
                    </Link>
                  </div>
                </div>

                {/* Self-hosted captcha — image challenge + answer input */}
                <div className="pt-1">
                  <label className={LABEL_CLASS}>Enter the characters shown</label>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="flex-1 h-14 rounded-lg overflow-hidden border border-[#c4c6cf] bg-[#141414] flex items-center justify-center [&>svg]:h-full [&>svg]:w-full [&>svg]:object-cover"
                      dangerouslySetInnerHTML={{ __html: captcha.svg }}
                    />
                    <button
                      type="button"
                      onClick={loadCaptcha}
                      disabled={captchaLoading}
                      title="Get a new captcha"
                      className="w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-lg bg-[#fbf9f9] border border-[#c4c6cf] text-[#44474e] hover:bg-[#efeded] transition-colors disabled:opacity-50"
                    >
                      <RiRefreshLine className={captchaLoading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={captchaAnswer}
                    onChange={e => setCaptchaAnswer(e.target.value)}
                    placeholder="TYPE THE CHARACTERS ABOVE"
                    autoComplete="off"
                    autoCapitalize="characters"
                    className={`${INPUT_CLASS} px-4 text-center tracking-widest uppercase`}
                  />
                </div>

                {/* Rooted-device security block (native app only) */}
                {rooted && (
                  <div
                    role="alert"
                    className="flex items-start gap-3 rounded-lg border border-[#ba1a1a]/30 bg-[#ffdad6] p-3"
                  >
                    <RiErrorWarningLine className="text-[#93000a] text-xl flex-shrink-0 mt-0.5" />
                    <p className="text-[#93000a] text-[13px] leading-relaxed">
                      <span className="font-semibold">Security warning:</span> this
                      device appears to be rooted or running in an emulator. For your
                      protection, Alister Bank login is disabled in this environment.
                    </p>
                  </div>
                )}

                {/* Biometric quick login (native app, previously enabled) */}
                {!rooted && canBiometric && (
                  <button
                    type="button"
                    onClick={handleBiometricLogin}
                    disabled={bioBusy || loading}
                    className="w-full min-h-[50px] py-3 rounded-lg border border-[#ba1a1a]/40 bg-[#ffdad6]/60 font-semibold text-[15px] flex items-center justify-center gap-2 hover:bg-[#ffdad6] transition-colors disabled:opacity-60"
                    style={{ color: RED }}
                  >
                    <RiFingerprintLine className="text-[22px]" />
                    {bioBusy ? 'Verifying…' : 'Login with fingerprint'}
                  </button>
                )}

                <motion.button
                  type="submit"
                  disabled={loading || rooted}
                  whileTap={{ scale: 0.98 }}
                  className="w-full min-h-[50px] py-3 mt-1 rounded-lg text-white font-semibold text-[17px] cursor-pointer flex items-center justify-center gap-2 shadow-sm transition-colors duration-200 disabled:opacity-70 disabled:cursor-not-allowed hover:opacity-90"
                  style={{ background: RED }}
                >
                  {loading ? <><div className="spinner w-4 h-4" /> Signing in...</> : 'Sign In'}
                </motion.button>
              </form>

              <div className="mt-8 text-center space-y-3">
                <p className="flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-[0.05em]" style={{ color: OUTLINE }}>
                  <RiLockLine className="text-[13px]" />
                  Secured with 256-bit encryption
                </p>
                <p className="text-sm" style={{ color: MUTED }}>
                  Don&apos;t have an account?{' '}
                  <Link to="/open-account" className={LINK_CLASS}>
                    Open Account
                  </Link>
                </p>
              </div>
            </div>

            {/* Security note */}
            <div className="flex items-center justify-center gap-2 mt-6 text-[11px] font-semibold tracking-[0.05em]" style={{ color: OUTLINE }}>
              <RiShieldCheckLine className="text-base" style={{ color: RED }} />
              <span>Your connection is encrypted with bank-grade TLS security</span>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full bg-white border-t border-[#c4c6cf]/60 relative z-20">
        <div className="w-full px-4 md:px-16 py-8 max-w-[1200px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <span className="text-sm" style={{ color: '#115cb9' }}>
            © 2024 Alister Bank. Member FDIC. Equal Housing Lender.
          </span>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {['Security', 'Privacy Policy', 'Terms of Service', 'Contact Support'].map((label) => (
              <a key={label} href="#" className="text-sm py-2 inline-block transition-colors hover:text-[#ba1a1a]" style={{ color: MUTED }}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
