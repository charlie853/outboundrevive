'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { StatCard } from '@/app/components/StatCard';

type Stats = {
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  threads: number;
  queue_queued: number;
};

export default function EmailStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }
      fetch('/api/email/stats', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
        .then(setStats)
        .catch((e) => { setError(e?.message || 'Error'); setStats(null); })
        .finally(() => setLoading(false));
    });
  }, []);

  if (loading) {
    return (
      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-[12px] bg-surface-bg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
        <button type="button" className="ml-3 rounded-lg border border-rose-300 px-3 py-1 text-xs font-medium" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    { label: 'Sent', value: stats.sent, accent: 'brand' as const },
    { label: 'Opened', value: stats.opened, accent: 'brand' as const },
    { label: 'Replied', value: stats.replied, accent: 'success' as const },
    { label: 'Bounced', value: stats.bounced, accent: 'danger' as const },
    { label: 'Unsubscribed', value: stats.unsubscribed, accent: 'danger' as const },
    { label: 'Threads', value: stats.threads, accent: 'brand' as const },
    { label: 'Queued', value: stats.queue_queued, accent: 'warning' as const },
  ];

  return (
    <div className="mt-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-ink-1">Email stats</h2>
        <p className="text-sm text-ink-2 mt-0.5">Sent, opens, replies, and deliverability across campaigns.</p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, accent }) => (
          <StatCard key={label} title={label} value={value} accentColor={accent} />
        ))}
      </div>
    </div>
  );
}
