import React, { useState } from 'react';
import { RiDownloadLine, RiFileTextLine, RiCalendarLine } from 'react-icons/ri';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../../services/api';

export default function StatementPage() {
  const { account } = useSelector(s => s.account);
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const [loading, setLoading] = useState(false);

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
  };

  const downloadPDF = async () => {
    if (!range.startDate || !range.endDate) { toast.error('Please select a date range'); return; }
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

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="page-title">Bank Statement</h1>
        <p className="text-dark-300 text-sm mt-0.5">Download official PDF statements for any date range</p>
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
            { label: 'Account Type', value: account?.account_type?.toUpperCase() || 'SAVINGS' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-dark-700/50 rounded-xl p-3">
              <p className="text-dark-400 text-xs">{label}</p>
              <p className="text-white font-semibold text-sm mt-1">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick ranges */}
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
            <input type="date" value={range.startDate} onChange={e => setRange(r => ({...r, startDate: e.target.value}))} className="input-field" />
          </div>
          <div>
            <label className="form-label"><RiCalendarLine className="inline mr-1" />To Date</label>
            <input type="date" value={range.endDate} onChange={e => setRange(r => ({...r, endDate: e.target.value}))} className="input-field" max={new Date().toISOString().split('T')[0]} />
          </div>
        </div>

        {range.startDate && range.endDate && (
          <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 mb-4 text-sm text-brand-300">
            📄 Statement from <strong>{range.startDate}</strong> to <strong>{range.endDate}</strong>
          </div>
        )}

        <button onClick={downloadPDF} disabled={loading} className="btn-primary w-full py-3.5">
          {loading
            ? <><div className="spinner w-4 h-4" /> Generating PDF...</>
            : <><RiDownloadLine /> Download PDF Statement</>
          }
        </button>
      </div>

      <div className="glass-card p-4 text-xs text-dark-400">
        🔒 Statements are official documents with a QR code for verification. Issued by Alister Bank. SWIFT: ALSTINBB
      </div>
    </div>
  );
}
