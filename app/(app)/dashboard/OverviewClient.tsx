'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Download, Mail, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { authenticatedFetch } from '@/lib/api-client';
import KpiCards from '@/app/(app)/dashboard/components/KpiCards';
import RepliesChart from '@/app/(app)/dashboard/components/RepliesChart';
import { WhiteChartCard } from '@/app/components/StatCard';
import { TimeRangeSelector, useTimeRange } from '@/app/(app)/dashboard/components/TimeRangeSelector';
import { useMetricsData } from '@/app/(app)/dashboard/components/useMetricsData';
import TopBar from '@/app/(app)/dashboard/components/TopBar';
import AutotexterToggle from '@/app/components/AutotexterToggle';
import VerticalInsights from '@/app/(app)/dashboard/components/VerticalInsights';

const WINDOW_LABELS: Record<string, string> = {
  '0-3m': 'Next 0–3 months',
  '3-6m': 'Next 3–6 months',
  '6-12m': 'Next 6–12 months',
};

type WatchlistRow = { score: number; window: string; lead: { id: string; name: string | null; phone: string; email?: string | null }; reasons?: unknown };

function escapeCsv(val: string | number): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function exportDashboardCsv(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const [metricsRes, emailRes] = await Promise.all([
    fetch('/api/metrics?range=all', { headers }),
    token ? fetch('/api/email/stats', { headers }).then((r) => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
  ]);

  const metrics = metricsRes.ok ? await metricsRes.json() : null;
  const emailStats = emailRes && typeof emailRes === 'object' ? emailRes : null;

  const rows: string[] = [];
  const line = (cells: (string | number)[]) => rows.push(cells.map(escapeCsv).join(','));

  line(['OutboundRevive Dashboard Export']);
  line([`Generated,${new Date().toISOString()}`]);
  rows.push('');

  line(['SUMMARY (All Time)']);
  if (metrics?.ok && metrics.kpis) {
    const k = metrics.kpis;
    line(['Metric', 'Value']);
    line(['New Leads', k.newLeads ?? 0]);
    line(['Messages Sent', k.messagesSent ?? 0]);
    line(['Delivered %', `${Math.round((k.deliveredPct ?? 0) * 100)}%`]);
    line(['Replies', k.replies ?? 0]);
    line(['Contacted', k.contacted ?? 0]);
    line(['Booked', k.booked ?? 0]);
    line(['Reply Rate %', `${k.replyRate ?? 0}%`]);
    line(['Opt-Out Rate %', `${k.optOutRate ?? 0}%`]);
    line(['Appointments Booked', k.appointmentsBooked ?? 0]);
    line(['Appointments Kept', k.appointmentsKept ?? 0]);
    line(['Re-engaged', k.reEngaged ?? 0]);
  } else {
    line(['Metrics could not be loaded for this export.']);
  }
  rows.push('');

  const delivery = metrics?.charts?.deliveryOverTime ?? [];
  const replies = metrics?.charts?.repliesOverTime ?? [];
  if (delivery.length || replies.length) {
    line(['MONTHLY BREAKDOWN']);
    const monthMap = new Map<string, { label: string; sent: number; delivered: number; replies: number }>();
    delivery.forEach((b: { label: string; start?: string; sent?: number; delivered?: number }) => {
      const monthKey = b.start ? b.start.slice(0, 7) : b.label;
      const existing = monthMap.get(monthKey) || { label: b.label, sent: 0, delivered: 0, replies: 0 };
      existing.sent += b.sent ?? 0;
      existing.delivered += b.delivered ?? 0;
      monthMap.set(monthKey, existing);
    });
    replies.forEach((b: { label: string; start?: string; replies?: number }) => {
      const monthKey = b.start ? b.start.slice(0, 7) : b.label;
      const existing = monthMap.get(monthKey) || { label: b.label, sent: 0, delivered: 0, replies: 0 };
      existing.replies += b.replies ?? 0;
      monthMap.set(monthKey, existing);
    });
    line(['Period', 'Messages Sent', 'Delivered', 'Replies']);
    [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([, v]) => line([v.label, v.sent, v.delivered, v.replies]));
    rows.push('');
  }

  if (emailStats && typeof emailStats.sent === 'number') {
    line(['EMAIL STATS']);
    line(['Metric', 'Value']);
    line(['Sent', emailStats.sent ?? 0]);
    line(['Opened', emailStats.opened ?? 0]);
    line(['Replied', emailStats.replied ?? 0]);
    line(['Bounced', emailStats.bounced ?? 0]);
    line(['Unsubscribed', emailStats.unsubscribed ?? 0]);
    line(['Threads', emailStats.threads ?? 0]);
    line(['Queued', emailStats.queue_queued ?? 0]);
    rows.push('');
  }

  const csv = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `outboundrevive-dashboard-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function OverviewClient() {
  const { range, setRange } = useTimeRange();
  const { kpis, replyPoints, isLoading, error, showBanner, isUnauthorized, mutate } = useMetricsData(range);
  const [exporting, setExporting] = useState(false);
  const [demoSeeding, setDemoSeeding] = useState(false);
  const [demoSeeded, setDemoSeeded] = useState(false);

  const { data: watchlistData, mutate: mutateWatchlist } = useSWR<{ data: WatchlistRow[] }>(
    '/api/watchlist?limit=5',
    (url) => authenticatedFetch(url).then((r) => (r.ok ? r.json() : { data: [] })),
    { revalidateOnFocus: true }
  );
  const watchlist = watchlistData?.data ?? [];

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportDashboardCsv();
    } finally {
      setExporting(false);
    }
  };

  const handleLoadDemoEmail = async () => {
    setDemoSeeding(true);
    setDemoSeeded(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const r = await fetch('/api/internal/demo/seed-email', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        setDemoSeeded(true);
        mutateWatchlist();
        setTimeout(() => setDemoSeeded(false), 5000);
      }
    } finally {
      setDemoSeeding(false);
    }
  };

  return (
    <div>
      <TopBar
        title="Overview"
        subtitle="Quick health snapshot of your outreach performance."
        rightContent={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-card px-4 py-2 text-sm font-medium text-ink-1 hover:bg-surface-bg transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <TimeRangeSelector range={range} onRangeChange={setRange} />
            <AutotexterToggle />
          </div>
        }
      />

      {showBanner && (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Metrics temporarily unavailable. If you're not signed in, please sign in and refresh.
          <button
            type="button"
            className="ml-3 rounded-lg border border-amber-400 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
            onClick={() => mutate()}
          >
            Retry
          </button>
        </div>
      )}

      {error && !isUnauthorized && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Couldn't load metrics.
          <button
            type="button"
            className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
            onClick={() => mutate()}
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="mt-6">
        {isLoading && !kpis ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-28 animate-pulse rounded-[12px] bg-surface-bg" />
            ))}
          </div>
        ) : (
          <KpiCards data={kpis} />
        )}
      </div>

      {/* Chart - full width */}
      <div className="mt-8">
        {replyPoints.length >= 1 ? (
          <WhiteChartCard title="Lead Engagement">
            <RepliesChart days={replyPoints} />
          </WhiteChartCard>
        ) : (
          <WhiteChartCard title="Lead Engagement">
            <div className="text-sm text-ink-2">No replies yet. Once leads respond, you'll see engagement trends here.</div>
          </WhiteChartCard>
        )}
      </div>

      {/* Most likely to buy — ranker / watchlist */}
      <div className="mt-8">
        <div className="rounded-xl border border-surface-border bg-surface-card shadow-sm overflow-hidden">
          <div className="border-b border-surface-border px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-600" />
              <div>
                <h2 className="text-lg font-semibold text-ink-1">Most likely to buy</h2>
                <p className="text-sm text-ink-2 mt-0.5">Leads ranked by purchase intent (email reply interest, timing, and engagement).</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {watchlist.length === 0 ? (
              <p className="text-sm text-ink-2">No leads on the list yet. Load the demo email thread to see Test (replied interested, asked for a call).</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-surface-border">
                <table className="min-w-full divide-y divide-surface-border text-sm">
                  <thead>
                    <tr className="text-left text-ink-2 bg-surface-bg/50">
                      <th className="px-4 py-3 font-medium">Lead</th>
                      <th className="px-4 py-3 font-medium">Window</th>
                      <th className="px-4 py-3 font-medium">Score</th>
                      <th className="px-4 py-3 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {watchlist.map((row) => {
                      const r = row.reasons as { summary?: string; source?: string } | undefined;
                      const reason = r?.summary ?? (r?.source ? `Source: ${r.source}` : '—');
                      return (
                        <tr key={row.lead.id}>
                          <td className="px-4 py-3">
                            <span className="font-medium text-ink-1">{row.lead.name || 'Unknown'}</span>
                            {(row.lead.email || row.lead.phone) && (
                              <span className="block text-xs text-ink-3">{row.lead.email || row.lead.phone}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-ink-2">{WINDOW_LABELS[row.window] || row.window}</td>
                          <td className="px-4 py-3 font-semibold text-ink-1">{(row.score * 100).toFixed(0)}%</td>
                          <td className="px-4 py-3 text-ink-2 max-w-[200px] truncate" title={String(reason)}>{String(reason)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Email dashboard quick access */}
      <div className="mt-8">
        <div className="rounded-xl border border-surface-border bg-surface-card shadow-sm overflow-hidden">
          <div className="border-b border-surface-border px-6 py-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink-1">Email</h2>
              <p className="text-sm text-ink-2 mt-0.5">Cold email campaigns, Unibox, and deliverability.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadDemoEmail}
                disabled={demoSeeding}
                className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-bg px-4 py-2 text-sm font-medium text-ink-1 hover:bg-surface-card transition disabled:opacity-50"
              >
                <Mail className="w-4 h-4" />
                {demoSeeding ? 'Loading…' : demoSeeded ? 'Demo loaded' : 'Load demo email'}
              </button>
              <Link
                href="/dashboard/email"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition"
              >
                Open Email →
              </Link>
            </div>
          </div>
          <div className="px-6 py-4 flex flex-wrap gap-3">
            <Link href="/dashboard/email/campaigns" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Campaigns</Link>
            <Link href="/dashboard/email/leads" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Leads</Link>
            <Link href="/dashboard/email/unibox" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Unibox</Link>
            <Link href="/dashboard/email/domains" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Domains</Link>
            <Link href="/dashboard/email/stats" className="text-sm font-medium text-ink-2 hover:text-brand-600 transition">Stats</Link>
          </div>
        </div>
      </div>

      {/* Vertical Insights - Auto Dealer Features */}
      <div className="mt-8">
        <VerticalInsights />
      </div>
    </div>
  );
}

