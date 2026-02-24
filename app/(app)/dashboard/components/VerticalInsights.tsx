'use client';

import { useEffect, useState } from 'react';

type SummaryResponse = {
  watchlist: Record<string, number>;
  micro_surveys: {
    mileage_band: boolean;
    timing_intent: boolean;
    drivers_in_household: boolean;
    collected_keys: number;
  };
  offers: {
    total: number;
    accepted: number;
    revenue: number;
  };
};

type WatchlistRow = {
  score: number;
  window: string;
  lead: {
    id: string;
    name: string | null;
    phone: string;
    crm_status?: string | null;
    crm_stage?: string | null;
  };
};

const WINDOW_LABELS: Record<string, string> = {
  '0-3m': 'Next 0-3 months',
  '3-6m': 'Next 3-6 months',
  '6-12m': 'Next 6-12 months',
};

function formatPhone(phone?: string) {
  if (!phone) return '';
  const digits = phone.replace(/\D+/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export default function VerticalInsights() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [summaryRes, watchlistRes] = await Promise.all([
          fetch('/api/insights/vertical', { cache: 'no-store' }),
          fetch('/api/watchlist?limit=5', { cache: 'no-store' }),
        ]);
        if (!summaryRes.ok) throw new Error('Failed to load summary');
        if (!watchlistRes.ok) throw new Error('Failed to load watchlist');
        const summaryJson = await summaryRes.json();
        const watchlistJson = await watchlistRes.json();
        if (!mounted) return;
        setSummary(summaryJson);
        setWatchlist(watchlistJson.data || []);
      } catch (err: any) {
        console.error('[VerticalInsights] load failed', err);
        if (mounted) setError(err?.message || 'Failed to load insights');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-[12px] border border-surface-line bg-surface-card p-6 shadow-sm">
        <p className="text-ink-2">Loading vertical insights…</p>
      </div>
    );
  }

  if (error || !summary) return null;

  const acceptanceRate =
    summary.offers.total > 0
      ? Math.round((summary.offers.accepted / summary.offers.total) * 100)
      : 0;

  const coverageItems = [
    { key: 'mileage_band', label: 'Mileage band', ready: summary.micro_surveys.mileage_band },
    { key: 'timing_intent', label: 'Timing intent', ready: summary.micro_surveys.timing_intent },
    { key: 'drivers_in_household', label: 'Drivers in household', ready: summary.micro_surveys.drivers_in_household },
  ];

  return (
    <div className="rounded-[12px] border border-surface-line bg-surface-card p-6 shadow-sm space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink-1">Auto Dealer Insights</h2>
          <p className="text-sm text-ink-2 mt-1">Upsell performance, watchlist, and micro-survey coverage.</p>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[12px] bg-surface-bg border border-surface-line p-4">
          <div className="text-sm text-ink-2">Service Upsells</div>
          <div className="mt-2 text-3xl font-semibold text-ink-1">{summary.offers.total}</div>
          <div className="text-sm text-ink-2">sent · {summary.offers.accepted} accepted ({acceptanceRate}%)</div>
          <div className="text-sm text-success mt-2">Attributed ${summary.offers.revenue.toFixed(0)}</div>
        </article>

        <article className="rounded-[12px] bg-surface-bg border border-surface-line p-4">
          <div className="text-sm text-ink-2">Watchlist Buckets</div>
          <ul className="mt-3 space-y-1 text-ink-1">
            {Object.entries(WINDOW_LABELS).map(([window, label]) => (
              <li key={window} className="flex items-center justify-between text-sm">
                <span className="text-ink-2">{label}</span>
                <span className="font-semibold text-ink-1">
                  {summary.watchlist?.[window] || 0}
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-[12px] bg-surface-bg border border-surface-line p-4">
          <div className="text-sm text-ink-2">Micro-Survey Coverage</div>
          <ul className="mt-3 space-y-1 text-sm">
            {coverageItems.map((item) => (
              <li key={item.key} className="flex items-center justify-between">
                <span className="text-ink-2">{item.label}</span>
                <span className={item.ready ? 'text-success font-semibold' : 'text-ink-3'}>
                  {item.ready ? '✔' : '—'}
                </span>
              </li>
            ))}
          </ul>
          <div className="text-xs text-ink-3 mt-2">
            Facts collected: {summary.micro_surveys.collected_keys}
          </div>
        </article>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-ink-1">Next-to-Buy Watchlist</h3>
          <span className="text-xs text-ink-3">Top 5 leads</span>
        </div>
        {watchlist.length === 0 ? (
          <p className="text-ink-2 text-sm">No leads on the watchlist yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-surface-line bg-surface-bg">
            <table className="min-w-full divide-y divide-surface-line text-sm">
              <thead>
                <tr className="text-left text-ink-2">
                  <th className="px-4 py-2 font-medium">Lead</th>
                  <th className="px-4 py-2 font-medium">Bucket</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-line">
                {watchlist.map((row) => (
                  <tr key={row.lead.id}>
                    <td className="px-4 py-3">
                      <div className="text-ink-1 font-medium">{row.lead.name || 'Unknown lead'}</div>
                      <div className="text-ink-3">{formatPhone(row.lead.phone)}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-2">{WINDOW_LABELS[row.window] || row.window}</td>
                    <td className="px-4 py-3 font-semibold text-ink-1">{(row.score * 100).toFixed(0)}%</td>
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

