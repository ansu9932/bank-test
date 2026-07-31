import React, { useEffect, useRef, useState } from 'react';
import { RiDownloadLine, RiFileTextLine, RiCalendarLine, RiMailSendLine, RiShieldCheckLine, RiTimeLine } from 'react-icons/ri';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../../services/api';

// Client-side cooldown between "email me my statement" requests. The backend
// enforces the REAL limits (per-IP rate limit + per-user cooldown & daily cap);
// this mirror simply gives honest UI feedback instead of a failed request.
const EMAIL_COOLDOWN_SEC = 120;

export default function StatementPage() {
  const { account } = useSelector(s => s.account);
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const [loading, setLoading] = useState(false);        // download in flight
  const [emailing, setEmailing] = useState(false);      // email send in flight
  const [showOptions, setShowOptions] = useState(false);// delivery options revealed
  const [cooldown, setCooldown] = useState(0);          // seconds until next email allowed
  const timerRef = useRef(null);

  // Tick the email cooldown down once per second.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    timerRef.current = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [cooldown]);

  const quickRanges = [
    { label: 'Last 7 Days', days: 7 },
    { label: 'Last 30 Days', days: 30 },
    { label: 'Last 90 Days', days: 90 },
    { label: 'Last 6 Months', days: 180 },
    { label: 'Last 1 Year', days: 365 },
  ];

  const setQuickRange = (days) => {
    const end = new Date();
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    setRange({
      startDate: start.toISOString().split('T')[0],
      endDate: end.toISOString().split('T')[0],
    });
    setShowOptions(false); // range changed → re-confirm before showing options
  };

  const updateRange = (patch) => {
    setRange(r => ({ ...r, ...patch }));
    setShowOptions(false);
  };

  const validateRange = () => {
    if (!range.startDate || !range.endDate) { toast.error('Please select a date range'); return false; }
    if (new Date(range.startDate) > new Date(range.endDate)) { toast.error('Start date must be before end date'); return false; }
    return true;
  };

  // Step 1: user confirms the range → reveal the two delivery options.
  const getStatement = () => {
    if (!validateRange()) return;
    setShowOptions(true);
  };

  // Option A: immediate PDF download (existing behaviour).
  const downloadPDF = async () => {
    if (!validateRange()) return;
    setLoading(true);
    try {
      const resp = await api.get('/transactions/download-statement', {
        params: range,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([resp.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `alister-bank-statement-${range.startDate}-${range.endDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Statement downloaded!');
    } catch {
      toast.error('Failed to download statement');
    } finally {
      setLoading(false);
    }
  };

  // Option B: email the PDF to the REGISTERED address. The server never accepts
  // a destination address from the client, and is protected by a per-IP rate
  // limit plus a per-user cooldown and daily cap (anti-bot / anti-spam).
  const emailStatement = async () => {
    if (!validateRange()) return;
    if (cooldown > 0) return;
    setEmailing(true);
    try {
      const resp = await api.post('/transactions/email-statement', range);
      toast.success(resp.data?.message || 'Statement sent to your registered email!');
      setCooldown(EMAIL_COOLDOWN_SEC);
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to email statement';
      toast.error(msg);
      // Honor a server-side cooldown message ("Please wait N seconds…").
      const waitMatch = /wait (\d+) seconds/.exec(msg);
      if (waitMatch) setCooldown(parseInt(waitMatch[1], 10));
    } finally {
      setEmailing(false);
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="page-title">Bank Statement</h1>
        <p className="text-dark-300 text-sm mt-0.5">Download official PDF statements or get them delivered to your email</p>
      </div>

      {/* Account summary */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/10 flex items-center justify-center">
            <RiFileTextLine className="text-brand-400 text-2xl" />
          </div>
          <div>
            <p className="text-white font-semibold">Account Statement</p>
            <p className="text-dark-300 text-sm">Account: {account?.account_number || '—'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Current Balance', value: `$${parseFloat(account?.balance || 0).toLocaleString('en-US')}` },
            { label: 'Available Balance', value: `$${parseFloat(account?.available_balance || 0).toLocaleString('en-US')}` },
            { label: 'SWIFT Code', value: account?.swift_code || 'ALSTINBB' },
            { label: 'Account Type', value: account?.account_type?.replace(/_/g, ' ').toUpperCase() || 'SAVINGS' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-dark-700/50 rounded-xl p-3">
              <p className="text-dark-400 text-xs">{label}</p>
              <p className="text-white font-semibold text-sm mt-1">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick ranges + date pickers */}
      <div className="glass-card p-5">
        <p className="text-white font-semibold mb-3">Quick Select</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {quickRanges.map(r => (
            <button key={r.label} onClick={() => setQuickRange(r.days)}
              className="px-3 py-1.5 rounded-lg border border-white/[0.08] text-dark-200 text-xs hover:border-brand-500/50 hover:text-brand-400 transition-colors">
              {r.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="form-label"><RiCalendarLine className="inline mr-1" />From Date</label>
            <input type="date" value={range.startDate} onChange={e => updateRange({ startDate: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="form-label"><RiCalendarLine className="inline mr-1" />To Date</label>
            <input type="date" value={range.endDate} onChange={e => updateRange({ endDate: e.target.value })} className="input-field" max={new Date().toISOString().split('T')[0]} />
          </div>
        </div>

        {range.startDate && range.endDate && (
          <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 mb-4 text-sm text-brand-300">
            📄 Statement from <strong>{range.startDate}</strong> to <strong>{range.endDate}</strong>
          </div>
        )}

        {!showOptions ? (
          <button onClick={getStatement} className="btn-primary w-full py-3.5">
            <RiFileTextLine /> Get Statement
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-dark-200 text-sm font-medium">How would you like to receive it?</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Download now */}
              <button onClick={downloadPDF} disabled={loading} className="btn-primary py-3.5">
                {loading
                  ? <><div className="spinner w-4 h-4" /> Generating PDF...</>
                  : <><RiDownloadLine /> Download Now</>
                }
              </button>
              {/* Email to registered address */}
              <button
                onClick={emailStatement}
                disabled={emailing || cooldown > 0}
                className="w-full py-3.5 rounded-xl border border-brand-500/40 text-brand-300 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-brand-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailing
                  ? <><div className="spinner w-4 h-4" /> Sending...</>
                  : cooldown > 0
                  ? <><RiTimeLine /> {`Wait ${Math.floor(cooldown / 60)}:${String(cooldown % 60).padStart(2, '0')}`}</>
                  : <><RiMailSendLine /> Get Statement on Email</>
                }
              </button>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-dark-700/50 border border-white/[0.05]">
              <RiShieldCheckLine className="text-green-400 mt-0.5 shrink-0" />
              <p className="text-dark-300 text-xs leading-relaxed">
                For your security, statements are only ever emailed to your <strong className="text-dark-100">registered email address</strong>.
                Email requests are limited (max 3 per 15 minutes, 5 per day) to protect against automated abuse.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="glass-card p-4 text-xs text-dark-400">
        🔒 Statements are official documents issued by Alister Bank. SWIFT: ALSTINBB
      </div>
    </div>
  );
}
