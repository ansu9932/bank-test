import React, { useEffect, useState } from 'react';
import { RiRefreshLine, RiMessage2Line, RiCheckboxCircleFill, RiErrorWarningLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

/* ──────────────────────────────────────────────────────────────────────────
   ADMIN · SMS SETTINGS
   Lets an admin choose which provider sends EVERY transactional user SMS:
   - Twilio (Programmable Messaging)
   - Brevo  (Transactional SMS)
   The choice is stored server-side (app_settings.sms_provider) and applies
   immediately to all SMS sent by the backend.
   ────────────────────────────────────────────────────────────────────────── */

const PROVIDERS = [
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Programmable Messaging API. Sends from your Twilio phone number or Messaging Service.',
    envHint: 'TWILIO_ACCOUNT_SID · TWILIO_AUTH_TOKEN · TWILIO_FROM_NUMBER',
  },
  {
    id: 'brevo',
    name: 'Brevo',
    description: 'Brevo Transactional SMS API. Sends with an alphanumeric sender name (e.g. ALSTER).',
    envHint: 'BREVO_API_KEY · BREVO_SMS_SENDER (optional)',
  },
];

export default function AdminSmsSettingsPage() {
  const [settings, setSettings] = useState(null); // { provider, providers: { twilio, brevo } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // provider id being saved

  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/sms-settings', { headers });
      setSettings(data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch SMS settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); /* eslint-disable-next-line */ }, []);

  const selectProvider = async (providerId) => {
    if (settings?.provider === providerId || saving) return;
    setSaving(providerId);
    try {
      const { data } = await api.put('/admin/sms-settings', { provider: providerId }, { headers });
      setSettings((s) => ({ ...s, provider: data.data.provider }));
      toast.success(data.message || `SMS provider set to ${providerId}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update SMS provider');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><RiMessage2Line /> SMS Settings</h1>
          <p className="text-dark-300 text-sm mt-0.5">
            Choose which provider sends transactional SMS to users. Applies immediately to all SMS.
          </p>
        </div>
        <button onClick={fetchSettings} className="btn-ghost" aria-label="Refresh"><RiRefreshLine /></button>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center"><div className="spinner w-8 h-8 mx-auto" style={{ borderWidth: 3 }} /></div>
      ) : !settings ? (
        <div className="glass-card p-8 text-center text-dark-400 text-sm">Could not load SMS settings.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {PROVIDERS.map((p) => {
            const isActive = settings.provider === p.id;
            const info = settings.providers?.[p.id] || {};
            const isSaving = saving === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProvider(p.id)}
                disabled={Boolean(saving)}
                aria-pressed={isActive}
                className={`glass-card p-5 text-left transition-all disabled:opacity-60 ${
                  isActive
                    ? 'ring-2 ring-emerald-400/60'
                    : 'hover:ring-1 hover:ring-white/20 cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white text-base font-semibold">{p.name}</p>
                  {isActive ? (
                    <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300">
                      <RiCheckboxCircleFill /> Active
                    </span>
                  ) : (
                    <span className="text-xs px-2.5 py-1 rounded-lg bg-white/[0.06] text-dark-300">
                      {isSaving ? 'Switching…' : 'Select'}
                    </span>
                  )}
                </div>
                <p className="text-dark-300 text-[13px] mt-2 leading-relaxed">{p.description}</p>
                <div className="flex items-center gap-2 mt-3 text-[12px]">
                  {info.configured ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <RiCheckboxCircleFill /> Credentials configured
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-yellow-400">
                      <RiErrorWarningLine /> Credentials missing
                    </span>
                  )}
                  {info.sender && <span className="text-dark-400">· Sender: <span className="font-mono">{info.sender}</span></span>}
                </div>
                <p className="text-dark-500 text-[11px] mt-2 font-mono truncate">{p.envHint}</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="glass-card p-4 text-[12px] text-dark-300 leading-relaxed">
        <p className="text-white text-sm font-medium mb-1">How the SMS provider switch works</p>
        <p>• The selected provider is stored on the server and used for <strong>every user SMS</strong> (e.g. SWIFT approval alerts) from the moment you switch.</p>
        <p>• If a provider shows <strong>Credentials missing</strong>, add its environment variables on the server before selecting it — otherwise SMS sends will fail silently (they never crash the app).</p>
        <p>• Every switch is recorded in the <strong>Audit Logs</strong> with the admin who made the change.</p>
      </div>
    </div>
  );
}
