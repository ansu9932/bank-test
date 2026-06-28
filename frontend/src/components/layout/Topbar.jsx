import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RiBellLine, RiSearchLine,
  RiCheckLine, RiAlertLine, RiArrowRightLine,
} from 'react-icons/ri';
import { markAllRead } from '../../store/slices/notificationSlice';
import { formatDistanceToNow } from 'date-fns';

const typeIcon = { transaction: '💸', security: '🔒', kyc: '✅', system: '🔔', alert: '⚠️' };

export default function Topbar() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const notifRef = useRef(null);
  const { notifications, unreadCount } = useSelector(s => s.notification);
  const { user } = useSelector(s => s.auth);

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="h-16 flex items-center justify-between px-4 lg:px-6 border-b border-white/[0.05] bg-dark-800/50 backdrop-blur-sm flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-dark-700 rounded-xl px-3 py-2 border border-white/[0.06] min-w-[240px]">
          <RiSearchLine className="text-dark-300 text-base flex-shrink-0" />
          <input
            type="text" placeholder="Search transactions, features..."
            className="bg-transparent text-sm text-white placeholder-dark-300 outline-none w-full"
          />
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2.5 rounded-xl hover:bg-white/[0.05] text-dark-200 hover:text-white transition-colors"
          >
            <RiBellLine className="text-xl" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center animate-pulse-red">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-2 w-80 glass-card overflow-hidden z-50 shadow-glass"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                  <p className="font-semibold text-sm text-white">Notifications</p>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => dispatch(markAllRead())}
                      className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <RiCheckLine /> Mark all read
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-center text-dark-300 text-sm py-8">No notifications</p>
                  ) : notifications.slice(0, 8).map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] cursor-pointer ${!n.is_read ? 'bg-brand-500/5' : ''}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-lg mt-0.5 flex-shrink-0">{typeIcon[n.type] || '🔔'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium">{n.title}</p>
                          <p className="text-dark-300 text-xs mt-0.5 truncate">{n.message}</p>
                          <p className="text-dark-400 text-[10px] mt-1">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        {!n.is_read && <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1" />}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* User avatar */}
        <div
          onClick={() => navigate('/dashboard/profile')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/[0.05] cursor-pointer transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
            <span className="text-brand-400 text-xs font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          <div className="hidden sm:block">
            <p className="text-white text-sm font-medium leading-none">{user?.firstName}</p>
            <p className="text-dark-300 text-[10px] mt-0.5">{user?.accountStatus}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
