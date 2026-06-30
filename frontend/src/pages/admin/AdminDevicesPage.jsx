import React, { useEffect, useState } from 'react';
import { RiRefreshLine, RiCheckLine, RiCloseLine, RiShieldKeyholeLine } from 'react-icons/ri';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { safeFormat } from '../../utils/dateHelpers';

const statusBadge = { approved: 'badge-success', pending: 'badge-warning', revoked: 'badge-danger' };

export default function AdminDevicesPage() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null); // `${id}:${action}`

  const headers = { Authorization: `Bearer ${localStorage.getItem('adminToken')}` };

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/devices', { headers });
      setDevices(data.data.devices);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDevices(); /* eslint-disable-next-line */ }, []);

  const act = async (id, action) => {
    setActing(`${id}:${action}`);
    try {
      const { data } = await api.post(`/admin/devices/${id}/${action}`, {}, { headers });
      toast.success(data.message || `Device ${action}d`);
      fetchDevices();
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} device`);
    } finally {
      setActing(null);
    }
  };

  // This device (the one currently in use) so we can highlight it.
  const myDeviceId = localStorage.getItem('adminDeviceId');
  const pendingCount = devices.filter((d) => d.status === 'pending').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title flex items-center gap-2"><RiShieldKeyholeLine /> Admin Devices</h1>
          <p className="text-dark-300 text-sm mt-0.5">
            Only approved devices can sign in to the admin panel.
            {pendingCount > 0 && <span className="text-yellow-400"> · {pendingCount} pending</span>}
          </p>
        </div>
        <button onClick={fetchDevices} className="btn-ghost"><RiRefreshLine /></button>
      </div>

      {loading ? (
        <div className="glass-card p-8 text-center"><div className="spinner w-8 h-8 mx-auto" style={{ borderWidth: 3 }} /></div>
      ) : devices.length === 0 ? (
        <div className="glass-card p-8 text-center text-dark-400 text-sm">No devices yet.</div>
      ) : (
        <div className="space-y-3">
          {devices.map((d) => {
            const isMine = d.device_id === myDeviceId;
            return (
              <div key={d.id} className="glass-card p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white text-sm font-medium">{d.label || 'Unknown device'}</p>
                    <span className={`badge ${statusBadge[d.status]} text-[10px]`}>{d.status}</span>
                    {isMine && <span className="badge badge-info text-[10px]">This device</span>}
                  </div>
                  <p className="text-dark-400 text-[11px] mt-1 font-mono truncate">{d.device_id}</p>
                  <p className="text-dark-500 text-[11px] mt-1 truncate">{d.user_agent}</p>
                  <div className="flex items-center gap-3 text-[11px] text-dark-400 mt-1">
                    {d.ip_address && <span>IP: {d.ip_address}</span>}
                    <span>Added {safeFormat(d.created_at || d.createdAt, 'dd MMM yyyy HH:mm')}</span>
                    {d.last_seen_at && <span>· Last seen {safeFormat(d.last_seen_at, 'dd MMM HH:mm')}</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {d.status !== 'approved' && (
                    <button
                      onClick={() => act(d.id, 'approve')}
                      disabled={acting === `${d.id}:approve`}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
                    >
                      <RiCheckLine /> Approve
                    </button>
                  )}
                  {d.status !== 'revoked' && (
                    <button
                      onClick={() => act(d.id, 'revoke')}
                      disabled={acting === `${d.id}:revoke`}
                      className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                    >
                      <RiCloseLine /> Revoke
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="glass-card p-4 text-[12px] text-dark-300 leading-relaxed">
        <p className="text-white text-sm font-medium mb-1">How device approval works</p>
        <p>• When someone signs in from a new browser, that device is recorded as <strong>pending</strong> and blocked.</p>
        <p>• A <strong>super-admin</strong> approves it here — then that device can sign in.</p>
        <p>• <strong>Revoke</strong> immediately cuts off a device, even if it's currently signed in.</p>
      </div>
    </div>
  );
}
