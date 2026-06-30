import React, { useEffect, useState } from 'react';
import api from '../services/api';
import PageLoader from './common/PageLoader';
import NotFoundPage from '../pages/NotFoundPage';

/**
 * Gate for all /admin routes (login + panel).
 *
 * On mount it asks the backend whether THIS browser/device is approved for
 * admin access. Unapproved devices are shown a generic 404 "page not found" —
 * so the admin panel is completely hidden from them (they can't even see a
 * login form). Approved devices (or the first-time bootstrap window) render the
 * wrapped admin content normally.
 *
 * The device is identified by a persistent random id in localStorage, the same
 * one the admin login sends — so once a super-admin approves it under
 * Admin → Devices, this gate starts allowing it.
 */
function getDeviceId() {
  let id = localStorage.getItem('adminDeviceId');
  if (!id) {
    id = (window.crypto && crypto.randomUUID && crypto.randomUUID()) ||
      `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('adminDeviceId', id);
  }
  return id;
}

export default function AdminDeviceGate({ children }) {
  const [state, setState] = useState('checking'); // 'checking' | 'allowed' | 'denied'

  useEffect(() => {
    let active = true;
    api.post('/admin/device-check', { deviceId: getDeviceId() })
      .then(({ data }) => { if (active) setState(data?.data?.allowed ? 'allowed' : 'denied'); })
      .catch(() => { if (active) setState('denied'); });
    return () => { active = false; };
  }, []);

  if (state === 'checking') return <PageLoader />;
  if (state === 'denied') return <NotFoundPage />;
  return children;
}
