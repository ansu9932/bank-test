import React, { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { safeFormat } from '../../utils/dateHelpers';

const COLORS = ['#c8102e','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-700 border border-white/[0.08] rounded-xl p-3 text-xs shadow-glass">
      <p className="text-dark-300 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: ${parseFloat(p.value).toLocaleString('en-US')}
        </p>
      ))}
    </div>
  );
};

export default function AnalyticsPage() {
  const { transactions } = useSelector(s => s.transaction);
  const { account } = useSelector(s => s.account);

  const monthlyData = useMemo(() => {
    const map = {};
    transactions.forEach(tx => {
      const m = safeFormat(tx.created_at, 'MMM yy', 'Unknown');
      if (!map[m]) map[m] = { month: m, credit: 0, debit: 0, net: 0 };
      const amt = parseFloat(tx.amount);
      if (tx.transaction_type === 'credit') { map[m].credit += amt; map[m].net += amt; }
      else { map[m].debit += amt; map[m].net -= amt; }
    });
    return Object.values(map).slice(-6).reverse();
  }, [transactions]);

  const modeBreakdown = useMemo(() => {
    const map = {};
    transactions.filter(t => t.transaction_type === 'debit').forEach(tx => {
      const k = tx.transfer_mode || 'OTHER';
      if (!map[k]) map[k] = { name: k, value: 0 };
      map[k].value += parseFloat(tx.amount);
    });
    return Object.values(map);
  }, [transactions]);

  const totalCredit = transactions.filter(t => t.transaction_type === 'credit').reduce((a, t) => a + parseFloat(t.amount), 0);
  const totalDebit  = transactions.filter(t => t.transaction_type === 'debit').reduce((a, t) => a + parseFloat(t.amount), 0);

  const StatCard = ({ label, value, color, sub }) => (
    <div className="glass-card p-5">
      <p className="text-dark-300 text-xs uppercase tracking-wide mb-2">{label}</p>
      <p className={`font-display text-2xl font-700 ${color}`}>{value}</p>
      {sub && <p className="text-dark-400 text-xs mt-1">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Analytics</h1>
        <p className="text-dark-300 text-sm mt-0.5">Insights into your spending and income patterns</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Credits" value={`$${(totalCredit/1000).toFixed(1)}k`} color="text-green-400"
          sub={`${transactions.filter(t=>t.transaction_type==='credit').length} txns`} />
        <StatCard label="Total Debits"  value={`$${(totalDebit/1000).toFixed(1)}k`}  color="text-red-400"
          sub={`${transactions.filter(t=>t.transaction_type==='debit').length} txns`} />
        <StatCard label="Net Flow"
          value={`${totalCredit >= totalDebit ? '+' : ''}$${((totalCredit-totalDebit)/1000).toFixed(1)}k`}
          color={totalCredit >= totalDebit ? 'text-green-400' : 'text-red-400'} />
        <StatCard label="Balance" value={`$${parseFloat(account?.balance||0).toLocaleString('en-US')}`} color="text-white" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 glass-card p-5">
          <p className="text-white font-semibold text-sm mb-4">Monthly Cash Flow</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={monthlyData} barCategoryGap="30%">
              <XAxis dataKey="month" tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#666', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="credit" name="Credit" fill="#22c55e" radius={[6,6,0,0]} />
              <Bar dataKey="debit"  name="Debit"  fill="#ef4444" radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <p className="text-white font-semibold text-sm mb-4">Spending by Mode</p>
          {modeBreakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={modeBreakdown} cx="50%" cy="50%" outerRadius={70} dataKey="value" strokeWidth={0}>
                    {modeBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `$${parseFloat(v).toLocaleString('en-US')}`}
                    contentStyle={{ background:'#1e1e2e', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, fontSize:12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {modeBreakdown.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i%COLORS.length] }} />
                      <span className="text-dark-200">{item.name}</span>
                    </div>
                    <span className="text-white font-medium">${item.value.toLocaleString('en-US')}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-dark-400 text-sm text-center py-8">No spending data</p>}
        </div>
      </div>

      <div className="glass-card p-5">
        <p className="text-white font-semibold text-sm mb-4">Net Flow Trend</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={monthlyData}>
            <defs>
              <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#c8102e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#c8102e" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill:'#666', fontSize:11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill:'#666', fontSize:10 }} axisLine={false} tickLine={false}
              tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="net" name="Net" stroke="#c8102e" fill="url(#netGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
