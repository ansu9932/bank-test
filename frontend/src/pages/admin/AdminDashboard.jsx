import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RiGroupLine, RiExchangeLine, RiShieldCheckLine, RiAlertLine, RiTimeLine } from 'react-icons/ri';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../../services/api';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/dashboard', { headers: { Authorization: `Bearer ${localStorage.getItem('adminToken')}` } })
      .then(({ data }) => setStats(data.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="spinner w-8 h-8" style={{ borderWidth: 3 }} /></div>;
  if (!stats) return <p className="text-dark-300">Failed to load stats.</p>;

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, icon: RiGroupLine, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Pending KYC', value: stats.pendingKYC, icon: RiTimeLine, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { label: 'Active Accounts', value: stats.activeAccounts, icon: RiShieldCheckLine, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Frozen Accounts', value: stats.frozenAccounts, icon: RiAlertLine, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: "Today's Transactions", value: stats.todayTransactions, icon: RiExchangeLine, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Flagged Transactions', value: stats.flaggedTransactions, icon: RiAlertLine, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'Open Tickets', value: stats.pendingTickets, icon: RiGroupLine, color: 'text-brand-400', bg: 'bg-brand-500/10' },
    { label: 'Total Volume ($)', value: `$${(parseFloat(stats.totalVolume||0)/100000).toFixed(1)}L`, icon: RiExchangeLine, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ];

  // Build chart
  const monthMap = {};
  stats.monthlyData?.forEach(d => {
    if (!monthMap[d.month]) monthMap[d.month] = { month: d.month, credit: 0, debit: 0 };
    if (d.transaction_type === 'credit') monthMap[d.month].credit = parseFloat(d.total);
    else monthMap[d.month].debit = parseFloat(d.total);
  });
  const chartData = Object.values(monthMap);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="text-dark-300 text-sm mt-0.5">Banking operations overview</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }} className="glass-card p-4">
            <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
              <c.icon className={`${c.color} text-lg`} />
            </div>
            <p className="text-white font-display font-700 text-xl">{c.value}</p>
            <p className="text-dark-400 text-xs mt-1">{c.label}</p>
          </motion.div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="glass-card p-5">
          <p className="text-white font-semibold text-sm mb-4">Monthly Transaction Volume</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v/100000).toFixed(0)}L`} />
              <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                formatter={v => [`$${parseFloat(v).toLocaleString('en-US')}`, '']} />
              <Bar dataKey="credit" name="Credits" fill="#22c55e" radius={[4,4,0,0]} />
              <Bar dataKey="debit" name="Debits" fill="#ef4444" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
