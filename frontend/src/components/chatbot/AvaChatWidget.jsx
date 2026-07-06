import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, X, Send, ShieldCheck, Lock, Bot } from 'lucide-react';
import { sendChatMessage, sendChatOtp, verifyChatOtp, verifyChatDob } from './avaApi';

// ─── Session security constants ───────────────────────────────────────────────
const IDLE_DESTROY_MS = 3 * 60 * 1000;   // 3 min inactivity → auto destroy
const HARD_DESTROY_MS = 15 * 60 * 1000;  // 15 min hard cap (matches token TTL)

const WELCOME = {
  from: 'ava',
  text: "Hi! I'm AVA, your Alister Bank virtual assistant. Ask me anything — for personal account details I'll quickly verify your identity right here in the chat.",
  suggestions: ['Check my balance', 'Last 5 transactions', 'My cards', 'Working hours'],
};

let msgId = 0;
const mkMsg = (msg) => ({ id: ++msgId, ...msg });

// ─── Small presentational pieces ──────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-brand-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
      <span className="sr-only">AVA is typing</span>
    </div>
  );
}

const MessageBubble = React.memo(function MessageBubble({ msg, onAction, onSuggestion }) {
  const isUser = msg.from === 'user';
  const isSystem = msg.from === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center px-3 py-1">
        <p className="text-xs text-dark-200 bg-dark-600 border border-white/5 rounded-full px-3 py-1.5 text-center text-pretty">
          {msg.text}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex px-3 py-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
            isUser
              ? 'bg-brand-500 text-white rounded-br-sm'
              : 'bg-dark-600 text-white/90 border border-white/5 rounded-bl-sm'
          }`}
        >
          {msg.text}
        </div>

        {msg.actions?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {msg.actions.map((a) => (
              <button
                key={a.href}
                type="button"
                onClick={() => onAction(a.href)}
                className="text-xs font-medium bg-brand-500/10 text-brand-300 border border-brand-500/30 rounded-full px-3 py-1.5 hover:bg-brand-500/20 transition-colors"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {msg.suggestions?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {msg.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onSuggestion(s)}
                className="text-xs bg-dark-600 text-white/70 border border-white/10 rounded-full px-3 py-1.5 hover:border-brand-500/50 hover:text-white transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function AvaChatWidget() {
  const location = useLocation();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([mkMsg(WELCOME)]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  // 'none' | 'email' | 'otp' | 'dob' — where we are in the in-chat verification flow
  const [authStage, setAuthStage] = useState('none');
  const [verified, setVerified] = useState(false);

  // ── Security-sensitive state kept ONLY in memory (refs) ────────────────────
  const chatTokenRef = useRef(null);       // never persisted to storage
  const pendingTokenRef = useRef(null);    // OTP-passed token awaiting DOB step
  const pendingEmailRef = useRef('');      // email awaiting OTP
  const pendingQuestionRef = useRef('');   // question asked before verification
  const idleTimerRef = useRef(null);
  const hardTimerRef = useRef(null);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Hidden on admin routes and all auth/onboarding pages (login, open account,
  // forgot/reset password, KYC, account setup, deposit activation).
  const HIDDEN_PREFIXES = [
    '/admin',
    '/dashboard',
    '/login',
    '/forgot-password',
    '/reset-password',
    '/open-account',
    '/video-kyc',
    '/cyber-kyc',
    '/account-setup',
    '/activate-deposit',
    // Mobile app surface has its own support entry — no floating widget.
    '/app',
  ];
  const isHiddenRoute = HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  // Auto-scroll on new messages.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing, open]);

  const pushMsg = useCallback((msg) => setMessages((prev) => [...prev, mkMsg(msg)]), []);

  // ── Secure session destroy (idle, hard, or manual) ─────────────────────────
  const destroySession = useCallback((reason) => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(hardTimerRef.current);
    chatTokenRef.current = null;      // discard the token
    pendingTokenRef.current = null;
    pendingEmailRef.current = '';
    pendingQuestionRef.current = '';
    setVerified(false);
    setAuthStage('none');
    // Secure wipe: the ENTIRE transcript is cleared so no balances, card
    // numbers or transactions remain visible on screen.
    setMessages([
      mkMsg(WELCOME),
      mkMsg({
        from: 'system',
        text: reason === 'idle'
          ? 'Your secure session ended after 3 minutes of inactivity and the conversation was cleared for your security. Ask me a personal question anytime to re-verify.'
          : reason === 'hard'
            ? 'Your secure session reached its 15-minute limit and the conversation was cleared for your security. Ask me a personal question anytime to re-verify.'
            : 'Your secure session was ended and the conversation was cleared for your security.',
      }),
    ]);
  }, []);

  const armIdleTimer = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => destroySession('idle'), IDLE_DESTROY_MS);
  }, [destroySession]);

  const startSecureSession = useCallback((token) => {
    chatTokenRef.current = token;
    setVerified(true);
    armIdleTimer();
    clearTimeout(hardTimerRef.current);
    hardTimerRef.current = setTimeout(() => destroySession('hard'), HARD_DESTROY_MS);
  }, [armIdleTimer, destroySession]);

  // Cleanup on unmount.
  useEffect(() => () => {
    clearTimeout(idleTimerRef.current);
    clearTimeout(hardTimerRef.current);
  }, []);

  // ── Deep-link actions ───────────────────────────────────────────────────────
  const handleAction = useCallback((href) => navigate(href), [navigate]);

  // ── Core send logic ─────────────────────────────────────────────────────────
  const askBackend = useCallback(async (text) => {
    setTyping(true);
    const data = await sendChatMessage(text, chatTokenRef.current);
    setTyping(false);

    if (verified) armIdleTimer(); // any activity resets the 3-min idle clock

    if (data.endSession) {
      destroySession('manual');
      return;
    }

    if (data.requiresAuth) {
      pendingQuestionRef.current = text;
      setAuthStage('email');
      pushMsg({ from: 'ava', text: data.reply });
      return;
    }

    pushMsg({ from: 'ava', text: data.reply, actions: data.actions, suggestions: data.suggestions });
  }, [verified, armIdleTimer, destroySession, pushMsg]);

  const handleEmailStep = useCallback(async (email) => {
    pushMsg({ from: 'user', text: email });
    setTyping(true);
    const res = await sendChatOtp(email);
    setTyping(false);
    if (res.ok) {
      pendingEmailRef.current = email.trim().toLowerCase();
      setAuthStage('otp');
    }
    pushMsg({ from: 'ava', text: res.reply });
  }, [pushMsg]);

  const handleOtpStep = useCallback(async (otp) => {
    // OTP masking: digits never appear in the transcript.
    pushMsg({ from: 'user', text: '••••••' });
    setTyping(true);
    const res = await verifyChatOtp(pendingEmailRef.current, otp);
    setTyping(false);

    if (!res.ok) {
      pushMsg({ from: 'ava', text: res.reply });
      return;
    }

    // OTP passed — final security step: confirm date of birth.
    pendingTokenRef.current = res.pendingToken;
    setAuthStage('dob');
    pushMsg({ from: 'ava', text: res.reply });
  }, [pushMsg]);

  const handleDobStep = useCallback(async (dob) => {
    // DOB masking: the date never appears in the transcript.
    pushMsg({ from: 'user', text: '••/••/••••' });
    setTyping(true);
    const res = await verifyChatDob(dob, pendingTokenRef.current);
    setTyping(false);

    if (!res.ok) {
      pushMsg({ from: 'ava', text: res.reply });
      if (res.restart) {
        // Locked or expired → back to the email step.
        pendingTokenRef.current = null;
        setAuthStage('email');
      }
      return;
    }

    setAuthStage('none');
    pendingTokenRef.current = null;
    startSecureSession(res.chatToken);
    pushMsg({ from: 'ava', text: res.reply });

    // Automatically answer the original question that triggered verification.
    const original = pendingQuestionRef.current;
    pendingQuestionRef.current = '';
    if (original) {
      setTyping(true);
      const data = await sendChatMessage(original, res.chatToken);
      setTyping(false);
      pushMsg({ from: 'ava', text: data.reply, actions: data.actions, suggestions: data.suggestions });
    }
  }, [pushMsg, startSecureSession]);

  const submit = useCallback(async (raw) => {
    const text = String(raw ?? input).trim();
    if (!text || typing) return;
    setInput('');

    if (authStage === 'email') {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
        await handleEmailStep(text);
      } else if (/\b(cancel|stop|never\s*mind|back)\b/i.test(text)) {
        setAuthStage('none');
        pendingQuestionRef.current = '';
        pushMsg({ from: 'user', text });
        pushMsg({ from: 'ava', text: 'No problem — verification cancelled. I can still help with general questions.' });
      } else {
        pushMsg({ from: 'user', text });
        pushMsg({ from: 'ava', text: "That doesn't look like a valid email address. Please enter your registered email, or type \"cancel\" to skip verification." });
      }
      return;
    }

    if (authStage === 'otp') {
      if (/^\d{6}$/.test(text.replace(/\s/g, ''))) {
        await handleOtpStep(text.replace(/\s/g, ''));
      } else if (/\b(resend|new\s*code|again)\b/i.test(text)) {
        await handleEmailStep(pendingEmailRef.current);
      } else if (/\b(cancel|stop|never\s*mind|back)\b/i.test(text)) {
        setAuthStage('none');
        pendingQuestionRef.current = '';
        pushMsg({ from: 'user', text });
        pushMsg({ from: 'ava', text: 'Verification cancelled. I can still help with general questions.' });
      } else {
        pushMsg({ from: 'user', text: '••••••' });
        pushMsg({ from: 'ava', text: 'Please enter the 6-digit code from your email, type "resend" for a new code, or "cancel" to skip.' });
      }
      return;
    }

    if (authStage === 'dob') {
      if (/^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$/.test(text)) {
        await handleDobStep(text);
      } else if (/\b(cancel|stop|never\s*mind|back)\b/i.test(text)) {
        setAuthStage('none');
        pendingTokenRef.current = null;
        pendingQuestionRef.current = '';
        pushMsg({ from: 'user', text });
        pushMsg({ from: 'ava', text: 'Verification cancelled. I can still help with general questions.' });
      } else {
        pushMsg({ from: 'user', text: '••/••/••••' });
        pushMsg({ from: 'ava', text: 'Please enter your date of birth as DD/MM/YYYY (for example 25/08/1990), or type "cancel" to skip.' });
      }
      return;
    }

    pushMsg({ from: 'user', text });
    await askBackend(text);
  }, [input, typing, authStage, handleEmailStep, handleOtpStep, handleDobStep, askBackend, pushMsg]);

  const onKeyDown = (e) => {
    // CJK IME safety: don't submit while composing (229 = Safari quirk).
    if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent.isComposing || e.keyCode === 229)) {
      e.preventDefault();
      submit();
    }
  };

  if (isHiddenRoute) return null;

  return (
    <>
      {/* ── Floating launcher button ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Chat with AVA, your virtual assistant"
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
        className={`fixed bottom-5 right-5 z-[9990] flex items-center gap-2 rounded-full bg-brand-500 text-white pl-4 pr-5 py-3 shadow-glow hover:bg-brand-600 font-sans touch-manipulation transition-all duration-200 will-change-transform ${
          open ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'
        }`}
      >
        <MessageCircle size={20} aria-hidden="true" />
        <span className="text-sm font-semibold">Ask AVA</span>
      </button>

      {/* ── Chat panel — always mounted, GPU-animated open/close so it appears
             instantly and smoothly on every device (especially mobile). ── */}
      <div
        role="dialog"
        aria-label="AVA virtual assistant chat"
        aria-hidden={!open}
        className={`fixed z-[9991] font-sans bottom-0 right-0 w-full h-[100dvh] sm:bottom-5 sm:right-5 sm:w-[380px] sm:h-[600px] sm:max-h-[calc(100dvh-40px)] flex flex-col bg-dark-700 sm:rounded-2xl border border-white/10 shadow-glass overflow-hidden transition-all duration-200 ease-out will-change-transform ${
          open
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-6 pointer-events-none invisible'
        }`}
      >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-dark-600 border-b border-white/10 shrink-0">
            <div className="relative">
              <div className="h-10 w-10 rounded-full bg-brand-500 flex items-center justify-center">
                <Bot size={22} className="text-white" aria-hidden="true" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-dark-600" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">AVA</p>
              <p className="text-dark-200 text-xs truncate">
                {verified ? 'Secure session active' : 'Alister Bank Virtual Assistant'}
              </p>
            </div>
            {verified && (
              <button
                type="button"
                onClick={() => destroySession('manual')}
                className="flex items-center gap-1 text-xs text-brand-300 bg-brand-500/10 border border-brand-500/30 rounded-full px-2.5 py-1 hover:bg-brand-500/20 transition-colors"
              >
                <Lock size={12} aria-hidden="true" />
                End session
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="text-dark-200 hover:text-white transition-colors p-1"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          {/* Verified banner */}
          {verified && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-green-500/10 border-b border-green-500/20 shrink-0">
              <ShieldCheck size={14} className="text-green-400" aria-hidden="true" />
              <p className="text-xs text-green-400">
                Identity verified — read-only session, auto-ends after inactivity
              </p>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 flex flex-col gap-1">
            {messages.map((m) => (
              <MessageBubble key={m.id} msg={m} onAction={handleAction} onSuggestion={(s) => submit(s)} />
            ))}
            {typing && <TypingIndicator />}
          </div>

          {/* Input */}
          <div className="p-3 bg-dark-600 border-t border-white/10 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type={authStage === 'otp' || authStage === 'dob' ? 'password' : 'text'}
                inputMode={authStage === 'otp' ? 'numeric' : 'text'}
                autoComplete="off"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={
                  authStage === 'email'
                    ? 'Enter your registered email…'
                    : authStage === 'otp'
                      ? 'Enter the 6-digit code…'
                      : authStage === 'dob'
                        ? 'Date of birth (DD/MM/YYYY)…'
                        : 'Type your message…'
                }
                aria-label="Message AVA"
                className="flex-1 min-w-0 bg-dark-700 text-white text-sm rounded-xl border border-white/10 px-4 py-2.5 placeholder:text-dark-300 focus:outline-none focus:border-brand-500/60"
              />
              <button
                type="button"
                onClick={() => submit()}
                disabled={!input.trim() || typing}
                aria-label="Send message"
                className="h-10 w-10 shrink-0 rounded-xl bg-brand-500 text-white flex items-center justify-center hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors touch-manipulation"
              >
                <Send size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="text-[10px] text-dark-300 mt-2 text-center">
              AVA never asks for your password, PIN or full card number.
            </p>
          </div>
      </div>
    </>
  );
}
