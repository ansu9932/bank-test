import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RiCustomerService2Line, RiAddLine, RiCheckLine, RiTimeLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { safeFormat } from '../../utils/dateHelpers';

const statusColor = { open: 'badge-warning', in_progress: 'badge-info', resolved: 'badge-success', closed: 'badge-info' };
const priorityColor = { low: 'badge-info', medium: 'badge-warning', high: 'badge-danger', urgent: 'badge-danger' };

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', category: 'account', priority: 'medium' });
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchTickets(); }, []);

  const fetchTickets = async () => {
    try {
      const { data } = await api.get('/transactions/support-tickets');
      setTickets(data.data.tickets);
    } catch {}
  };

  const submitTicket = async (e) => {
    e.preventDefault();
    if (!form.subject || !form.description) { toast.error('Subject and description are required'); return; }
    setLoading(true);
    try {
      await api.post('/transactions/support-tickets', form);
      toast.success('Ticket created! Our team will respond shortly.');
      setShowForm(false);
      setForm({ subject: '', description: '', category: 'account', priority: 'medium' });
      fetchTickets();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create ticket');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Support</h1>
          <p className="text-dark-300 text-sm mt-0.5">Create and track your support requests</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary"><RiAddLine /> New Ticket</button>
      </div>

      {/* Contact info */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: '📞', label: '24/7 Helpline', value: '1800-XXX-XXXX', sub: 'Toll-free' },
          { icon: '📧', label: 'Email Support', value: 'support@alisterbank.com', sub: '24hr response' },
          { icon: '💬', label: 'Live Chat', value: 'Available Now', sub: 'Mon-Fri 9am-6pm' },
        ].map(c => (
          <div key={c.label} className="glass-card p-4 text-center">
            <span className="text-2xl">{c.icon}</span>
            <p className="text-white font-medium text-xs mt-2">{c.label}</p>
            <p className="text-dark-300 text-[10px] mt-1 truncate">{c.value}</p>
            <p className="text-dark-500 text-[10px]">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* New ticket form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
          className="glass-card p-5">
          <h3 className="text-white font-semibold mb-4">Create Support Ticket</h3>
          <form onSubmit={submitTicket} className="space-y-4">
            <div>
              <label className="form-label">Subject *</label>
              <input className="input-field" value={form.subject} onChange={e => setForm(f => ({...f, subject: e.target.value}))} placeholder="Brief description of your issue" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">Category</label>
                <select className="input-field" value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                  {['transaction', 'kyc', 'account', 'card', 'technical', 'other'].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Priority</label>
                <select className="input-field" value={form.priority} onChange={e => setForm(f => ({...f, priority: e.target.value}))}>
                  {['low','medium','high','urgent'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="form-label">Description *</label>
              <textarea className="input-field resize-none" rows={4} value={form.description}
                onChange={e => setForm(f => ({...f, description: e.target.value}))}
                placeholder="Describe your issue in detail..." />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
                {loading ? <><div className="spinner w-4 h-4" /> Submitting...</> : 'Submit Ticket'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Tickets list */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.05]">
          <p className="text-white font-semibold text-sm">My Tickets</p>
        </div>
        {tickets.length === 0 ? (
          <div className="text-center py-10">
            <RiCustomerService2Line className="text-dark-400 text-5xl mx-auto mb-2" />
            <p className="text-dark-400 text-sm">No support tickets yet</p>
          </div>
        ) : tickets.map(t => (
          <div key={t.id} className="px-5 py-4 border-b border-white/[0.04] last:border-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <p className="text-white font-medium text-sm">{t.subject}</p>
                <p className="text-dark-400 text-xs mt-0.5 truncate">{t.description}</p>
                <p className="text-dark-500 text-[10px] mt-1.5 flex items-center gap-1">
                  <RiTimeLine /> {safeFormat(t.created_at, 'dd MMM yyyy HH:mm')} · #{t.ticket_number}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className={`badge ${statusColor[t.status]} text-[10px]`}>{t.status.replace('_',' ')}</span>
                <span className={`badge ${priorityColor[t.priority]} text-[10px]`}>{t.priority}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
