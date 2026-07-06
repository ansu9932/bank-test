/**
 * History — full transaction list with credit/debit filter and PDF
 * statement download (same endpoints as the website dashboard).
 */
import { useState } from 'react';
import useSWR from 'swr';
import { ArrowDownLeft, ArrowUpRight, Download } from 'lucide-react';
import api from '../../services/api';
import { Screen, AppHeader, Card } from '../components/AppUI';

const fetcher = (url) => api.get(url).then((r) => r.data.data);

const fmtMoney = (v) =>
  `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'credit', label: 'Received' },
  { id: 'debit', label: 'Sent' },
];

export default function HistoryScreen() {
  const [filter, setFilter] = useState('all');
  const [downloading, setDownloading] = useState(false);
  const { data, isLoading } = useSWR('/transactions?limit=50', fetcher);

  const txns = (data?.transactions || data || []).filter((t) => {
    if (filter === 'all') return true;
    const credit = t.type === 'credit' || t.direction === 'credit';
    return filter === 'credit' ? credit : !credit;
  });

  const downloadStatement = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await api.get('/transactions/download-statement', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'alister-bank-statement.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* statement service unavailable — silently ignore, list still visible */
    } finally {
      setDownloading(false);
    }
  };

  // Group transactions by calendar day for scannable sections.
  const groups = txns.reduce((acc, t) => {
    const day = new Date(t.created_at || t.createdAt).toLocaleDateString('en-US', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    (acc[day] = acc[day] || []).push(t);
    return acc;
  }, {});

  return (
    <Screen className="pb-24">
      <AppHeader
        title="Transactions"
        right={
          <button type="button" className="app-icon-btn" onClick={downloadStatement}
            disabled={downloading} aria-label="Download PDF statement">
            <Download size={18} aria-hidden="true" />
          </button>
        }
      />

      {/* Filter chips */}
      <div className="px-5 flex gap-2" role="group" aria-label="Filter transactions">
        {FILTERS.map((f) => (
          <button key={f.id} type="button"
            className={`app-chip ${filter === f.id ? 'app-chip-active' : ''}`}
            onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="px-5 mt-4 flex flex-col gap-5">
        {isLoading && <Card><p className="app-dim text-sm text-center py-6">Loading transactions…</p></Card>}

        {!isLoading && txns.length === 0 && (
          <Card><p className="app-dim text-sm text-center py-6">No transactions found</p></Card>
        )}

        {Object.entries(groups).map(([day, list]) => (
          <section key={day} aria-label={day}>
            <h2 className="app-dim text-xs font-semibold uppercase tracking-wide mb-2">{day}</h2>
            <Card className="divide-y" style={{ borderColor: 'var(--app-border)' }}>
              {list.map((t) => {
                const credit = t.type === 'credit' || t.direction === 'credit';
                return (
                  <div key={t.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                    <span className={`app-tx-icon ${credit ? 'app-tx-credit' : 'app-tx-debit'}`}>
                      {credit
                        ? <ArrowDownLeft size={16} aria-hidden="true" />
                        : <ArrowUpRight size={16} aria-hidden="true" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {t.description || t.beneficiary_name || (credit ? 'Money received' : 'Money sent')}
                      </p>
                      <p className="app-dim text-xs capitalize">
                        {(t.status || 'completed').toLowerCase()}
                        {t.reference ? ` · ${t.reference}` : ''}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums ${credit ? 'app-credit-text' : ''}`}>
                      {credit ? '+' : '-'}{fmtMoney(t.amount)}
                    </p>
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
      </div>
    </Screen>
  );
}
