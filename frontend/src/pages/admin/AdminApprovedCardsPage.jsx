import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RiBankCardLine, RiAddLine, RiDeleteBin6Line, RiFlaskLine, RiLoader4Line } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';

/* Admin control surface for the SANDBOX activation-deposit simulator. Cards
   added here are the only ones the simulated activation-deposit page accepts.
   No real payments are involved — this is a demo/sandbox allow-list. */

const groupCard = (v) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim();

export default function AdminApprovedCardsPage() {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', cardNumber: '', cardHolder: '', expiry: '' });
  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const load = async () => {
    try {
      const { data } = await api.get('/admin/approved-cards', { headers });
      setCards(data.data.cards || []);
    } catch { toast.error('Failed to load approved cards.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const setExpiry = (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = `${v.slice(0, 2)}/${v.slice(2)}`;
    setForm((f) => ({ ...f, expiry: v }));
  };

  const addCard = async () => {
    if (form.cardNumber.replace(/\D/g, '').length < 12) { toast.error('Enter a valid card number.'); return; }
    if (!form.cardHolder.trim()) { toast.error('Cardholder name is required.'); return; }
    setAdding(true);
    try {
      await api.post('/admin/approved-cards', {
        label: form.label.trim(),
        cardNumber: form.cardNumber.replace(/\D/g, ''),
        cardHolder: form.cardHolder.trim(),
        expiry: form.expiry,
      }, { headers });
      toast.success('Approved card added.');
      setForm({ label: '', cardNumber: '', cardHolder: '', expiry: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add card.'); }
    finally { setAdding(false); }
  };

  const toggle = async (card) => {
    try {
      await api.patch(`/admin/approved-cards/${card.id}`, { is_active: !card.is_active }, { headers });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update card.'); }
  };

  const remove = async (card) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete the card ending ${card.last4}?`)) return;
    try {
      await api.delete(`/admin/approved-cards/${card.id}`, { headers });
      toast.success('Card deleted.');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to delete card.'); }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="page-title">Approved Cards</h1>
        <p className="text-dark-300 text-sm">Sandbox allow-list for the activation-deposit simulator.</p>
      </div>

      <div className="rounded-xl px-4 py-3 flex items-start gap-2"
        style={{ background: 'rgba(245,196,81,0.1)', border: '1px solid rgba(245,196,81,0.3)' }}>
        <RiFlaskLine className="mt-0.5 flex-shrink-0" style={{ color: '#f5c451' }} />
        <p className="text-xs leading-relaxed" style={{ color: '#f5d98a' }}>
          These cards are used <strong>only</strong> by the simulated activation-deposit flow. No real payment is
          processed and no card is charged. Only cards listed and active here will be accepted on the deposit page.
        </p>
      </div>

      {/* Add card */}
      <div className="glass-card p-5">
        <p className="text-white font-semibold mb-3 flex items-center gap-2"><RiAddLine /> Add Approved Card</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input className="input-field text-sm" placeholder="Label (optional)" value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <input className="input-field text-sm font-mono" placeholder="Card number" value={form.cardNumber}
            onChange={(e) => setForm((f) => ({ ...f, cardNumber: groupCard(e.target.value) }))} inputMode="numeric" />
          <input className="input-field text-sm" placeholder="Cardholder name" value={form.cardHolder}
            onChange={(e) => setForm((f) => ({ ...f, cardHolder: e.target.value }))} />
          <input className="input-field text-sm font-mono" placeholder="Expiry MM/YY" value={form.expiry}
            onChange={setExpiry} inputMode="numeric" />
        </div>
        <button onClick={addCard} disabled={adding} className="btn-primary mt-3 py-2.5 px-5 text-sm">
          {adding ? <><RiLoader4Line className="animate-spin" /> Adding…</> : <>Add Card</>}
        </button>
      </div>

      {/* List */}
      <div className="glass-card p-5">
        <p className="text-white font-semibold mb-3 flex items-center gap-2"><RiBankCardLine /> Cards ({cards.length})</p>
        {loading ? (
          <div className="flex justify-center py-8"><div className="spinner w-7 h-7" style={{ borderWidth: 3 }} /></div>
        ) : cards.length === 0 ? (
          <p className="text-dark-300 text-sm text-center py-6">No approved cards yet. Add one above.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-dark-400 text-xs uppercase tracking-wide border-b border-white/[0.06]">
                  <th className="text-left font-medium py-2 px-1">Label</th>
                  <th className="text-left font-medium py-2 px-1">Card</th>
                  <th className="text-left font-medium py-2 px-1">Holder</th>
                  <th className="text-left font-medium py-2 px-1">Network</th>
                  <th className="text-left font-medium py-2 px-1">Status</th>
                  <th className="text-right font-medium py-2 px-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-2.5 px-1 text-dark-200">{c.label || '—'}</td>
                    <td className="py-2.5 px-1 text-white font-mono">•••• {c.last4}</td>
                    <td className="py-2.5 px-1 text-dark-200">{c.card_holder_name}</td>
                    <td className="py-2.5 px-1 text-dark-200">{c.network}</td>
                    <td className="py-2.5 px-1">
                      <button onClick={() => toggle(c)}
                        className={`badge text-[10px] ${c.is_active ? 'badge-success' : 'badge-warning'}`}>
                        {c.is_active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="py-2.5 px-1 text-right">
                      <button onClick={() => remove(c)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 text-xs font-medium transition-colors">
                        <RiDeleteBin6Line /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
