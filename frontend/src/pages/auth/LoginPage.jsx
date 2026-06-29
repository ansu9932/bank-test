import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { RiEyeLine, RiEyeOffLine, RiBankLine, RiLockLine, RiUserLine, RiShieldCheckLine, RiRefreshLine } from 'react-icons/ri';
import { login, clearError } from '../../store/slices/authSlice';
import api from '../../services/api';
import toast from 'react-hot-toast';
import useEntryPageGuard from '../../hooks/useEntryPageGuard';
import BackToHome from '../../components/common/BackToHome';

// Absolute lifespan of the login screen, mirroring the backend login handshake
// TTL (exactly 10 minutes). If the page sits open/idle past this window, the
// handshake the user holds is already dead server-side, so we proactively wipe
// state and bounce to the public homepage.
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

// Shared input styling (Alister Bank design system). Logic/attributes on the
// inputs themselves are untouched — this only controls appearance + focus state.
const INPUT_CLASS =
  'w-full bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] rounded-[10px] ' +
  'text-white text-[15px] py-3 sm:py-[13px] transition-all duration-200 placeholder:text-white/30 ' +
  'focus:outline-none focus:border-[#CC0000] focus:border-l-[3px] focus:shadow-[0_0_0_3px_rgba(204,0,0,0.15)]';

const LABEL_CLASS = 'block text-[13px] font-medium text-white/50 mb-1.5';

const LINK_CLASS = 'text-[#CC0000] font-medium hover:text-[#FF3333] hover:underline transition-colors';

export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector(s => s.auth);
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPwd, setShowPwd] = useState(false);
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
      captchaToken: captcha.token,
      captchaAnswer,
    }));
    if (login.fulfilled.match(result)) {
      allowNavigation(); // sanctioned success exit → no redirect-home
      toast.success('Welcome back!');
      navigate('/dashboard');
    } else {
      // Handshake + captcha are single-use; on any failure refresh both for the retry.
      initHandshake();
      loadCaptcha();
    }
  };

  return (
    <div
      className="min-h-screen flex overflow-hidden relative"
      style={{ background: 'linear-gradient(135deg, #0A0A0A 0%, #1A1A1A 50%, #2D0000 100%)' }}
    >
      {/* Back to Home (fixed top-left) */}
      <BackToHome />

      {/* Left — branding panel */}
      <motion.div
        initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
        className="hidden lg:flex flex-col justify-between w-[480px] bg-[#1A1A1A]/70 border-r border-white/[0.05] p-12 relative overflow-hidden flex-shrink-0"
      >
        {/* Background decorations */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#CC0000]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-[#CC0000]/5 blur-3xl" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-16">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)', boxShadow: '0 0 22px rgba(204,0,0,0.45)' }}
            >
              <RiBankLine className="text-white text-2xl" />
            </div>
            <div>
              <p className="font-display font-700 text-white text-xl tracking-wide">ALISTER BANK</p>
              <p className="text-white/40 text-xs tracking-widest uppercase">Digital Banking</p>
            </div>
          </div>

          <h1 className="font-display text-4xl font-700 text-white leading-tight mb-4">
            Banking that<br />
            <span className="text-gradient-red">works for you.</span>
          </h1>
          <p className="text-white/50 text-base leading-relaxed">
            Secure, modern digital banking with real-time transactions, instant transfers, and powerful financial insights.
          </p>
        </div>

        {/* Features */}
        <div className="space-y-4 relative z-10">
          {[
            { icon: '🔒', label: 'Bank-grade 256-bit encryption' },
            { icon: '⚡', label: 'Instant IMPS/NEFT/RTGS transfers' },
            { icon: '📊', label: 'Smart spending analytics' },
            { icon: '🌍', label: 'International banking standards' },
          ].map((f, i) => (
            <motion.div
              key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="flex items-center gap-3"
            >
              <span className="text-lg">{f.icon}</span>
              <p className="text-white/50 text-sm">{f.label}</p>
            </motion.div>
          ))}
        </div>

        <p className="text-white/30 text-xs relative z-10">© 2024 Alister Bank. SWIFT: ALSTINBB</p>
      </motion.div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-6 relative">
        {/* Blurred red glow orb behind the card */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: 400, height: 400, background: 'rgba(204,0,0,0.12)', filter: 'blur(80px)', zIndex: 0 }}
        />

        <motion.div
          initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative z-10 w-full max-w-[440px]"
        >
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #CC0000, #FF3333)' }}
            >
              <RiBankLine className="text-white text-lg" />
            </div>
            <p className="font-display font-700 text-white text-lg">ALISTER BANK</p>
          </div>

          <motion.div
            whileHover={{ boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 30px rgba(204,0,0,0.08)' }}
            transition={{ duration: 0.3 }}
            className="w-full rounded-[20px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] sm:backdrop-blur-[20px] p-6 sm:p-10"
            style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(204,0,0,0.08)' }}
          >
            {/* Card header */}
            <div className="text-center mb-5">
              <div
                className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(204,0,0,0.12)', border: '1px solid rgba(204,0,0,0.3)' }}
              >
                <RiShieldCheckLine className="text-[26px]" style={{ color: '#FF3333' }} />
              </div>
              <h2 className="text-white font-bold text-[24px]" style={{ fontFamily: 'Inter, sans-serif' }}>Welcome back</h2>
              <p className="text-[14px] font-medium mt-1" style={{ color: '#CC0000' }}>Sign in to your account to continue</p>
            </div>
            <div className="border-b border-white/[0.07] mb-6" />

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={LABEL_CLASS}>Username or Email</label>
                <div className="relative">
                  <RiUserLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-base" />
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
                  <RiLockLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 text-base" />
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="Enter your password"
                    className={`${INPUT_CLASS} pl-10 pr-10`}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/90 transition-colors">
                    {showPwd ? <RiEyeOffLine /> : <RiEyeLine />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end">
                <Link to="/forgot-password" className={`${LINK_CLASS} text-sm`}>
                  Forgot password?
                </Link>
              </div>

              {/* Self-hosted captcha — image challenge + answer input */}
              <div>
                <label className={LABEL_CLASS}>Enter the characters shown</label>
                <div className="flex items-center gap-3">
                  <div
                    className="rounded-[10px] overflow-hidden border border-white/10 bg-[rgba(255,255,255,0.06)] flex items-center justify-center"
                    style={{ width: 170, height: 56, flexShrink: 0 }}
                    dangerouslySetInnerHTML={{ __html: captcha.svg }}
                  />
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    disabled={captchaLoading}
                    title="Get a new captcha"
                    className="p-3 rounded-[10px] bg-[rgba(255,255,255,0.06)] text-white/50 hover:text-white hover:bg-[rgba(255,255,255,0.12)] transition-colors disabled:opacity-50"
                  >
                    <RiRefreshLine className={captchaLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
                <input
                  type="text"
                  value={captchaAnswer}
                  onChange={e => setCaptchaAnswer(e.target.value)}
                  placeholder="Type the characters above"
                  autoComplete="off"
                  autoCapitalize="characters"
                  className={`${INPUT_CLASS} px-4 mt-2 tracking-widest uppercase`}
                />
              </div>

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ y: -2, boxShadow: '0 8px 25px rgba(204,0,0,0.35)' }}
                whileTap={{ scale: 0.97 }}
                className="w-full min-h-[50px] py-[14px] mt-2 rounded-[12px] text-white font-semibold text-[16px] cursor-pointer flex items-center justify-center gap-2 transition-colors duration-200 disabled:opacity-70 disabled:cursor-not-allowed bg-[linear-gradient(135deg,#CC0000,#FF3333)] hover:bg-[linear-gradient(135deg,#990000,#CC0000)]"
              >
                {loading ? <><div className="spinner w-4 h-4" /> Signing in...</> : 'Sign In'}
              </motion.button>

              {/* Cosmetic security note */}
              <p className="text-center mt-4" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>
                🔒 Secured with 256-bit encryption
              </p>
            </form>

            <div className="mt-5 text-center">
              <p className="text-white/50 text-sm">
                Don't have an account?{' '}
                <Link to="/open-account" className={LINK_CLASS}>
                  Open Account
                </Link>
              </p>
            </div>
          </motion.div>

          {/* Security note */}
          <div className="flex items-center justify-center gap-2 mt-6 text-white/30 text-xs">
            <RiShieldCheckLine className="text-[#CC0000] text-base" />
            <span>Your connection is encrypted with bank-grade TLS security</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
