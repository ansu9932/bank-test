import React from 'react';
import { motion } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import { RiEyeLine, RiEyeOffLine, RiNfcLine, RiWifiLine } from 'react-icons/ri';
import { toggleBalanceVisibility } from '../../store/slices/accountSlice';

export default function AccountCard() {
  const dispatch = useDispatch();
  const { account, balanceVisible } = useSelector(s => s.account);
  const { user } = useSelector(s => s.auth);

  const maskAccount = (num) => num
    ? `${num.slice(0, 4)} **** **** ${num.slice(-4)}`
    : '**** **** **** ****';

  const formatBalance = (bal) => {
    if (!balanceVisible) return '$ ••••••';
    return `$ ${parseFloat(bal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="relative w-full max-w-sm rounded-3xl overflow-hidden card-shimmer"
      style={{ background: 'linear-gradient(135deg, #c8102e 0%, #8b0000 55%, #3d0010 100%)', minHeight: 200 }}
    >
      {/* Decorative circles */}
      <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/[0.04]" />
      <div className="absolute -bottom-12 -left-8 w-52 h-52 rounded-full bg-white/[0.03]" />

      <div className="relative p-6 flex flex-col h-full">
        {/* Top row */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-white/60 text-xs uppercase tracking-widest font-medium">Alister Bank</p>
            <p className="text-white font-semibold text-sm mt-0.5">
              {account?.account_type?.toUpperCase()} ACCOUNT
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <RiWifiLine className="text-white/50 text-xl" />
            <p className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              account?.status === 'active'
                ? 'bg-green-500/20 text-green-300'
                : 'bg-yellow-500/20 text-yellow-300'
            }`}>
              {account?.status?.toUpperCase() || 'ACTIVE'}
            </p>
          </div>
        </div>

        {/* Balance */}
        <div className="mb-6">
          <p className="text-white/50 text-xs mb-1 uppercase tracking-wide">Available Balance</p>
          <div className="flex items-center gap-3">
            <motion.p
              key={balanceVisible ? 'visible' : 'hidden'}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="balance-display text-white text-2xl font-700 tracking-tight"
            >
              {formatBalance(account?.balance)}
            </motion.p>
            <button
              onClick={() => dispatch(toggleBalanceVisibility())}
              className="text-white/50 hover:text-white transition-colors p-1"
            >
              {balanceVisible ? <RiEyeOffLine /> : <RiEyeLine />}
            </button>
          </div>
        </div>

        {/* Account number */}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-widest mb-1">Account Number</p>
            <p className="text-white/80 font-mono text-sm tracking-widest">
              {maskAccount(account?.account_number)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-white/40 text-[10px] uppercase mb-1">SWIFT</p>
            <p className="text-white/70 text-xs font-mono">{account?.swift_code || 'ALSTINBB'}</p>
          </div>
        </div>

        {/* Card holder */}
        <div className="mt-4 flex items-center justify-between">
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-widest mb-0.5">Card Holder</p>
            <p className="text-white/90 text-sm font-medium tracking-wide uppercase">
              {user?.firstName} {user?.lastName}
            </p>
          </div>
          <RiNfcLine className="text-white/30 text-3xl" />
        </div>
      </div>
    </motion.div>
  );
}
