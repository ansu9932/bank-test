import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import {
  RiSendPlaneLine, RiFileTextLine, RiAddLine,
  RiArrowUpLine, RiArrowDownLine, RiExchangeLine,
  RiGroupLine, RiBankCardLine, RiArrowRightLine,
  RiTrendingUpLine,
} from 'react-icons/ri';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import AccountCard from '../../components/dashboard/AccountCard';
import { fetchTransactions } from '../../store/slices/transactionSlice';
import { safeFormat } from '../../utils/dateHelpers';

const QuickAction = ({ to, icon: Icon, label, color }) => (
  <Link to={to} className="glass-card-hover p-4 flex flex-col items-center gap-2.5 text-center">
    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${color}`}>
      <Icon className="text-xl text-white" />
    </div>
    <p className="text-dark-200 text-xs font-medium">{label}</p>
  </Link>
);

const TxRow = ({ tx }) => {
  const isCredit = tx.transaction_type === 'credit';
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0"
    >
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${isCredit ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
        {isCredit
          ? <RiArrowDownLine className="text-green-400 text-base" />
          : <RiArrowUpLine className="text-red-400 text-base" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">
          {tx.description || tx.narration || (isCredit ? tx.from_account_name : tx.to_account_name) || 'Transaction'}
        </p>
        <p className="text-dark-300 text-xs mt-0.5 flex items-center gap-1.5">
          <span className="badge badge-info py-0 px-1.5 text-[10px]">{tx.transfer_mode}</span>
          {safeFormat(tx.created_at, 'dd MMM, HH:mm')}
        </p>
      </div>
      <p className={`text-sm font-bold flex-shrink-0 ${isCredit ? 'text-green-400' : 'text-red-400'}`}>
        {isCredit ? '+' : '-'}${parseFloat(tx.amount).toLocaleString('en-US')}
      </p>
    </motion.div>
  );
};

// Build mini chart from transactions
const buildChartData = (transactions) => {
  const map = {};
  transactions.slice(0, 30).forEach(tx => {
    const day = safeFormat(tx.created_at, 'dd MMM', 'Unknown');
    if (!map[day]) map[day] = { day, credit: 0, debit: 0 };
    if (tx.transaction_type === 'credit') map[day].credit += parseFloat(tx.amount);
    else map[day].debit += parseFloat(tx.amount);
  });
  return Object.values(map).reverse();
};

export default function DashboardHome() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { account } = useSelector(s => s.account);
  const { transactions } = useSelector(s => s.transaction);
  const { user } = useSelector(s => s.auth);

  const chartData = buildChartData(transactions);

  const stats = [
    {
      label: 'Total Credits',
      value: `$${transactions.filter(t=>t.transaction_type==='credit').reduce((a,t)=>a+parseFloat(t.amount),0).toLocaleString('en-US')}`,
      icon: RiArrowDownLine, color: 'text-green-400', bg: 'bg-green-500/10',
    },
    {
      label: 'Total Debits',
      value: `$${transactions.filter(t=>t.transaction_type==='debit').reduce((a,t)=>a+parseFloat(t.amount),0).toLocaleString('en-US')}`,
      icon: RiArrowUpLine, color: 'text-red-400', bg: 'bg-red-500/10',
    },
    {
      label: 'Transactions',
      value: transactions.length,
      icon: RiExchangeLine, color: 'text-blue-400', bg: 'bg-blue-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-700 text-white">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {user?.firstName}! 👋
          </h1>
          <p className="text-dark-300 text-sm mt-0.5">Here's your financial overview</p>
        </div>
        <div className="hidden sm:block">
          <p className="text-dark-300 text-xs text-right">{safeFormat(new Date(), 'EEEE, dd MMMM yyyy')}</p>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Left — card + stats */}
        <div className="xl:col-span-2 space-y-5">
          <AccountCard />

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {stats.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass-card p-3 text-center"
              >
                <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center mx-auto mb-2`}>
                  <s.icon className={`${s.color} text-sm`} />
                </div>
                <p className="text-white text-sm font-bold">{s.value}</p>
                <p className="text-dark-400 text-[10px] mt-0.5">{s.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Quick actions */}
          <div>
            <p className="text-dark-300 text-xs uppercase tracking-widest font-medium mb-3">Quick Actions</p>
            <div className="grid grid-cols-4 gap-2">
              <QuickAction to="/dashboard/transfer" icon={RiSendPlaneLine} label="Transfer" color="bg-brand-500" />
              <QuickAction to="/dashboard/statement" icon={RiFileTextLine} label="Statement" color="bg-blue-500" />
              <QuickAction to="/dashboard/beneficiaries" icon={RiGroupLine} label="Beneficiaries" color="bg-purple-500" />
              <QuickAction to="/dashboard/analytics" icon={RiTrendingUpLine} label="Analytics" color="bg-emerald-500" />
            </div>
          </div>

          {/* Account info */}
          <div className="glass-card p-4 space-y-3">
            <p className="text-dark-300 text-xs uppercase tracking-widest font-medium">Account Details</p>
            {[
              { label: 'Account Number', value: account?.account_number || '—' },
              { label: 'SWIFT Code', value: account?.swift_code || 'ALSTINBB' },
              { label: 'Daily Limit', value: `$${parseFloat(account?.daily_transfer_limit || 500000).toLocaleString('en-US')}` },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-dark-300">{label}</span>
                <span className="text-white font-medium font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — chart + transactions */}
        <div className="xl:col-span-3 space-y-5">
          {/* Mini chart */}
          {chartData.length > 0 && (
            <div className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-white font-semibold text-sm">Transaction Activity</p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block"/>Credits</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block"/>Debits</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="credit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="debit" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: '#1e1e2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [`$${v.toLocaleString('en-US')}`, '']}
                  />
                  <Area type="monotone" dataKey="credit" stroke="#22c55e" fill="url(#credit)" strokeWidth={2} />
                  <Area type="monotone" dataKey="debit" stroke="#ef4444" fill="url(#debit)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Recent transactions */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white font-semibold text-sm">Recent Transactions</p>
              <Link to="/dashboard/transactions" className="text-brand-400 hover:text-brand-300 text-xs flex items-center gap-1">
                View all <RiArrowRightLine />
              </Link>
            </div>
            {transactions.length === 0 ? (
              <div className="text-center py-10">
                <RiExchangeLine className="text-dark-400 text-4xl mx-auto mb-2" />
                <p className="text-dark-400 text-sm">No transactions yet</p>
              </div>
            ) : (
              transactions.slice(0, 8).map(tx => <TxRow key={tx.id} tx={tx} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
