import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RiSearchLine, RiArrowRightLine, RiRefreshLine, RiMailSendLine,
  RiCheckLine, RiTimeLine, RiCloseLine, RiLoader4Line,
} from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { safeFormat } from '../../utils/dateHelpers';

// Visual treatment per computed step status (matches the backend
// 'complete' | 'current' | 'pending' | 'rejected' values).
const stepStyle = {
  complete: { dot: 'bg-emerald-500 border-emerald-500 text-white', label: 'text-emerald-400', Icon: RiCheckLine },
  current: { dot: 'bg-brand-500 border-brand-500 text-white', label: 'text-brand-400', Icon: RiTimeLine },
  pending: { dot: 'bg-dark-700 border-white/15 text-dark-400', label: 'text-dark-400', Icon: RiTimeLine },
  rejected: { dot: 'bg-red-500 border-red-500 text-white', label: 'text-red-400', Icon: RiCloseLine },
};

// Friendly label for the "stuck at" pill.
const STEP_LABELS = {
  registration: 'Registration',
  email_verification: 'Email Verification',
  kyc_review: 'KYC Review',
  video_kyc: 'Video KYC',
  approval: 'KYC Approval',
  activation_deposit: 'Activation Deposit',
  account_setup: 'Account Setup',
  completed: 'Completed',
};

export default function AdminOnboardingPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  // Tracks the in-flight resend so we can disable the exact button: `${userId}:${step}`.
  const [sending, setSending] = useState(null);

  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/onboarding', {
        params: { search, page, limit: 20, includeCompleted },
        headers,
      });
      setUsers(data.data.users);
      setTotal(data.data.pagination.total);
    } catch {
      toast.error('Failed to fetch onboarding progress');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); /* eslint-disable-next-line */ }, [search, includeCompleted, page]);

  const resendStep = async (userId, step) => {
    setSending(`${userId}:${step}`);
    try {
      const { data } = await api.post(`/admin/users/${userId}/resend-step`, { step }, { headers });
      toast.success(data.message || 'Email re-sent');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to re-send email');
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Onboarding Progress</h1>
          <p className="text-dark-300 text-sm mt-0.5">{total} {includeCompleted ? 'total' : 'in-progress'} users</p>
        </div>
        <button onClick={fetchUsers} className="btn-ghost"><RiRefreshLine /></button>
      </div>

      {/* Search + filter */}
      <div className="glass-card p-4 flex items-center gap-3">
        <div className="relative flex-1">
          <RiSearchLine className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dark-300" />
          <input
            type="text"
            placeholder="Search name, email, customer ID..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input-field pl-10 py-2.5"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-dark-300 whitespace-nowrap cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeCompleted}
            onChange={e => { setIncludeCompleted(e.target.checked); setPage(1); }}
            className="accent-brand-500"
          />
          Show completed
        </label>
      </div>

      {/* List */}
      {loading ? (
        <div className="glass-card p-8 text-center"><div className="spinner w-8 h-8 mx-auto" style={{ borderWidth: 3 }} /></div>
      ) : users.length === 0 ? (
        <div className="glass-card p-8 text-center text-dark-400 text-sm">No users found.</div>
      ) : (
        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id} className="glass-card p-4 sm:p-5">
              {/* Header row: identity + current step + open link */}
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-brand-500/15 flex items-center justify-center flex-shrink-0">
                    <span className="text-brand-400 text-xs font-bold">{u.first_name?.[0]}{u.last_name?.[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{u.first_name} {u.last_name}</p>
                    <p className="text-dark-400 text-xs truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-[10px] uppercase tracking-wide text-dark-500">Stuck at</p>
                    <p className={`text-xs font-medium ${u.completed ? 'text-emerald-400' : 'text-brand-400'}`}>
                      {STEP_LABELS[u.currentStep] || u.currentStep}
                    </p>
                  </div>
                  <Link
                    to={`/admin/users/${u.id}`}
                    className="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 hover:bg-brand-500/20 transition-colors"
                    title="Open user"
                  >
                    <RiArrowRightLine />
                  </Link>
                </div>
              </div>

              {/* Step tracker */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {u.steps.map(step => {
                  const s = stepStyle[step.status] || stepStyle.pending;
                  const Icon = s.Icon;
                  const busy = sending === `${u.id}:${step.key}`;
                  return (
                    <div key={step.key} className="flex flex-col items-center text-center gap-1.5">
                      <div className={`w-7 h-7 rounded-full border flex items-center justify-center ${s.dot}`}>
                        <Icon className="text-sm" />
                      </div>
                      <p className={`text-[10px] leading-tight ${s.label}`}>{step.label}</p>
                      {step.canResend && (
                        <button
                          onClick={() => resendStep(u.id, step.key)}
                          disabled={busy}
                          className="mt-0.5 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 transition-colors disabled:opacity-50"
                          title={`Re-send ${step.label} email`}
                        >
                          {busy ? <RiLoader4Line className="animate-spin" /> : <RiMailSendLine />}
                          {busy ? 'Sending' : 'Resend'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Footer meta */}
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/[0.05] text-[11px] text-dark-400">
                <span className="font-mono">{u.customer_id}</span>
                {u.account_number && <span className="font-mono">A/C ****{String(u.account_number).slice(-4)}</span>}
                <span className="ml-auto">Joined {safeFormat(u.created_at, 'dd MMM yyyy')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-dark-400">
        <span>Page {page}</span>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost text-xs disabled:opacity-30">Prev</button>
          <button onClick={() => setPage(p => p + 1)} disabled={users.length < 20} className="btn-ghost text-xs disabled:opacity-30">Next</button>
        </div>
      </div>
    </div>
  );
}
