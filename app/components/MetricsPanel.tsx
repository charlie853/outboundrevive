'use client';

/**
 * MetricsPanel - Dashboard Overview
 * 
 * WHAT IT IS:
 * A live view of outreach performance and conversation health. Shows key metrics,
 * time-series charts, and funnel visualization to help users understand campaign effectiveness.
 * 
 * METRICS DEFINITIONS:
 * - Replies: Count of inbound messages (messages_in) over the selected range
 * - Reply Rate: replies / delivered outbounds (excludes failed/throttled)
 * - Booked: Count of appointments created (leads.booked=true) 
 * - Kept: Appointments that happened (leads.kept=true or calendar confirmation)
 * - Opt-out Rate: Count of opted_out leads / delivered outbounds
 * - Link Sends: Count of outbound messages containing booking_link
 * - First Response Time: Median time from first outbound to first inbound per lead
 * - Lift vs Baseline: Reactivation rate compared to pre-AI baseline window
 * 
 * CHARTS:
 * - Time Series: Replies/day and Booked/day with 7-day rolling average
 * - Funnel: Delivered → Replied → Booked → Kept
 * - Heatmap: Inbound replies by hour-of-day / day-of-week (shows best engagement times)
 * - Cohort: Reactivation rate by lead-age cohort (0-30d, 31-90d, 91-180d, 180d+)
 * 
 * TODO - CHART IMPROVEMENTS (dev prompt for next iteration):
 * - Make charts interactive with hover tooltips showing exact counts
 * - Add date range picker (default to last 30 days, allow custom ranges)
 * - Implement CSV export for visible data range
 * - Add empty-state messages with helpful tips ("No data yet - send your first campaign!")
 * - Ensure timezone handling uses lead.tz or account.timezone where available
 * - Add loading skeletons for better perceived performance
 * - Consider recharts or tremor for richer visualizations
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import KpiCards from '@/app/(app)/dashboard/components/KpiCards';
import DeliveryChart from '@/app/(app)/dashboard/components/DeliveryChart';
import RepliesChart from '@/app/(app)/dashboard/components/RepliesChart';
import Funnel from '@/app/(app)/dashboard/components/Funnel';
import PricingModal from '@/app/components/PricingModal';
import { ChartCard, WhiteChartCard } from '@/app/components/StatCard';
import type { DeliveryPoint, ReplyPoint, Kpis, FunnelData } from '@/lib/types/metrics';

const WINDOW_OPTIONS = [
  { label: '24H', value: '24h' as const },
  { label: '7D', value: '7d' as const },
  { label: '1M', value: '30d' as const },
  { label: 'All Time', value: 'all' as const },
];
type WindowKey = (typeof WINDOW_OPTIONS)[number]['value'];

const fetcher = (url: string) =>
  fetch(url, { cache: 'no-store' }).then(async (res) => {
    if (!res.ok) {
      const err: any = new Error(`http ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  });
const fetcherNoThrow = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));

const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalisePct = (value: unknown) => {
  const num = toNumber(value, NaN);
  if (!Number.isFinite(num)) return undefined;
  return Math.abs(num) > 1 ? num / 100 : num;
};

const buildKpis = (
  k: any
): Kpis & {
  booked?: number;
  contacted?: number;
  optedOut?: number;
  replyRate?: number;
  optOutRate?: number;
  appointmentsBooked?: number;
  appointmentsKept?: number;
  appointmentsNoShow?: number;
  reEngaged?: number;
  reEngagementRate?: number;
} => {
  const newLeads = toNumber(k?.newLeads);
  const messagesSent = toNumber(k?.messagesSent);
  const deliveredPct = normalisePct(k?.deliveredPct) ?? 0;
  const replies = toNumber(k?.replies);
  
  // Engagement KPIs
  const booked = toNumber(k?.booked);
  const contacted = toNumber(k?.contacted);
  const optedOut = toNumber(k?.optedOut);
  const replyRate = normalisePct(k?.replyRate) ?? 0;
  const optOutRate = normalisePct(k?.optOutRate) ?? 0;

  // Appointment KPIs
  const appointmentsBooked = toNumber(k?.appointmentsBooked);
  const appointmentsKept = toNumber(k?.appointmentsKept);
  const appointmentsNoShow = toNumber(k?.appointmentsNoShow);

  // Re-engagement KPIs
  const reEngaged = toNumber(k?.reEngaged);
  const reEngagementRate = normalisePct(k?.reEngagementRate) ?? 0;

  return {
    leadsNew: newLeads,
    sent: messagesSent,
    delivered: 0,
    deliveredRate: deliveredPct,
    replies,
    booked,
    contacted,
    optedOut,
    replyRate,
    optOutRate,
    appointmentsBooked,
    appointmentsKept,
    appointmentsNoShow,
    reEngaged,
    reEngagementRate,
    deltas: { leadsNew: 0, sent: 0, deliveredRate: 0, replies: 0 },
  };
};

export default function MetricsPanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialRange = (() => {
    const fromQuery = (searchParams?.get('range') ?? searchParams?.get('window') ?? '7d').toLowerCase();
    const values = WINDOW_OPTIONS.map((o) => o.value);
    return values.includes(fromQuery as WindowKey) ? (fromQuery as WindowKey) : '7d';
  })();

  const [range, setRange] = useState<WindowKey>(initialRange);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(`/api/metrics?range=${range}`, fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    shouldRetryOnError: (err) => err?.status !== 401,
  });

  // Feature flags (caps/cadences/new_charts)
  const { data: status } = useSWR('/api/ui/account/status', fetcherNoThrow, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
  });
  const newChartsEnabled: boolean = !!status?.new_charts_enabled;

  // Analytics panels (only fetch what we display to clients)
  const { data: intents } = useSWR(`/api/analytics/intents?range=${range}`, fetcherNoThrow, { refreshInterval: 60000 });
  const { data: billing } = useSWR(`/api/billing/status`, fetcherNoThrow, { refreshInterval: 60000 });

  console.debug('METRICS payload', data);

  const handleSetRange = (value: WindowKey) => {
    if (value === range) return;
    setRange(value);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('range', value);
    params.set('window', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    mutate();
  };

  if (error) {
    console.warn('[METRICS_PANEL] error', error);
  }

  const isUnauthorized = (error as any)?.status === 401;
  const showBanner = (!error && data?.ok === false) || isUnauthorized;

  const kpiPayload = data?.kpis ?? { newLeads: 0, messagesSent: 0, deliveredPct: 0, replies: 0 };
  const charts = data?.charts ?? { deliveryOverTime: [], repliesOverTime: [], timezone: 'America/New_York' };
  const deliveryPoints: DeliveryPoint[] = Array.isArray(charts.deliveryOverTime) ? charts.deliveryOverTime : [];
  const replyPoints: ReplyPoint[] = Array.isArray(charts.repliesOverTime) ? charts.repliesOverTime : [];

  const kpis = buildKpis(kpiPayload);
  const funnelData: FunnelData | undefined = data?.funnel;

  return (
    <section className="space-y-10">
      {/* Time Range Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[12px] border border-surface-line bg-surface-card shadow-sm p-1 gap-1">
          {WINDOW_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleSetRange(value)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                range === value 
                  ? 'bg-warning text-white shadow-sm' 
                  : 'text-ink-2 hover:bg-surface-bg hover:text-ink-1'
              }`}
              aria-pressed={range === value}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const csv = [
              ['Metric', 'Value', 'Delta'],
              ['New Leads', kpis.leadsNew, `${Math.round(kpis.deltas.leadsNew * 100)}%`],
              ['Messages Sent', kpis.sent, `${Math.round(kpis.deltas.sent * 100)}%`],
              ['Delivered Rate', `${Math.round(kpis.deliveredRate * 100)}%`, `${Math.round(kpis.deltas.deliveredRate * 100)}%`],
              ['Replies', kpis.replies, `${Math.round(kpis.deltas.replies * 100)}%`],
            ].map(row => row.join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `outboundrevive-metrics-${range}.csv`;
            a.click();
          }}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-warning to-orange-500 rounded-[12px] hover:from-warning/90 hover:to-orange-500/90 transition-all shadow-sm hover:shadow-md"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </button>
      </div>

      {showBanner && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Metrics temporarily unavailable. If you’re not signed in, please sign in and refresh.
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
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Couldn’t load metrics.
          <button
            type="button"
            className="rounded-lg border border-rose-300 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
            onClick={() => mutate()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl bg-surface-bg" />
          ))}
        </div>
      ) : (
        <KpiCards data={kpis} className="mt-4" />
      )}

      {/* Insight Panel - Hidden for now, may be needed later */}
      <div className="hidden p-6 rounded-[12px] bg-surface-card border border-surface-line shadow-sm">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🧠</span>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-ink-1 mb-2">Smart Takeaways</h3>
            <div className="space-y-2 text-sm text-ink-2">
              <p>• You're generating replies, but timing suggests a second follow-up could lift conversion.</p>
              <p>• 7 leads reopened messages without replying — automation already queued a nudge.</p>
              <p>• Engagement peaks late afternoon — consider scheduling outbound then.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Time Series Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {deliveryPoints.length >= 1 ? (
          <WhiteChartCard title="Message Delivery">
            <DeliveryChart days={deliveryPoints} />
          </WhiteChartCard>
        ) : (
          <WhiteChartCard title="Message Delivery">
            <div className="text-sm text-gray-700">No delivery data yet. Send your first campaign to see stats here.</div>
          </WhiteChartCard>
        )}
        {replyPoints.length >= 1 ? (
          <WhiteChartCard title="Lead Engagement">
            <RepliesChart days={replyPoints} />
          </WhiteChartCard>
        ) : (
          <WhiteChartCard title="Lead Engagement">
            <div className="text-sm text-gray-700">No replies yet. Once leads respond, you'll see engagement trends here.</div>
          </WhiteChartCard>
        )}
      </div>

      {/* Business Metrics - Cap progress only (hide quiet hours & carrier panels from client view) */}
      <div className="grid gap-6 md:grid-cols-2">
        <ChartCard>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-ink-1">Monthly SMS Cap</h3>
            <button
              onClick={() => setIsPricingModalOpen(true)}
              className="text-sm font-bold text-warning hover:opacity-80 underline transition-colors"
            >
              View Plans →
            </button>
          </div>
          {billing?.monthly_cap_segments ? (
            <div>
              <div className="text-xs text-ink-2 mb-1">Plan: {billing?.plan_tier || 'unknown'}</div>
              {(() => {
                const used = Number(billing?.segments_used || 0);
                const cap = Number(billing?.monthly_cap_segments || 0);
                const pct = cap > 0 ? Math.min(1, used / cap) : 0;
                const pc100 = Math.round(pct * 100);
                const bar = (
                  <div className="w-full h-2 bg-surface-line rounded">
                    <div className={`h-2 rounded ${pc100 >= 100 ? 'bg-danger' : pc100 >= 80 ? 'bg-warning' : 'bg-brand-500'}`} style={{ width: `${pc100}%` }} />
                  </div>
                );
                return (
            <div className="space-y-2">
                    {bar}
                  <div className="text-xs text-ink-2">{used} / {cap} segments ({pc100}%)</div>
                    {pc100 >= 100 && (
                    <div className="text-xs text-danger">Cap reached — outbound paused. <button onClick={() => setIsPricingModalOpen(true)} className="underline">Upgrade</button></div>
                    )}
                    {pc100 >= 80 && pc100 < 100 && (
                    <div className="text-xs text-warning">Approaching cap — consider upgrading. <button onClick={() => setIsPricingModalOpen(true)} className="underline">Upgrade</button></div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-sm text-ink-2">Billing info unavailable.</div>
          )}
        </ChartCard>
        <ChartCard title="Top Intents">
          <div className="text-xs text-ink-2 border border-surface-line rounded-[12px] p-2 max-h-48 overflow-auto">
          {(Array.isArray(intents?.intents) && intents.intents.length > 0 ? intents.intents : []).map((row: any) => (
            <div key={row.intent} className="flex justify-between text-ink-1"><span>{row.intent}</span><span>{row.count}</span></div>
          ))}
          {(!intents?.intents || intents.intents.length === 0) && (
            <div className="text-ink-2">No intent data yet.</div>
          )}
          </div>
        </ChartCard>
      </div>

      {/* 
        Note: Quiet Hours, Carrier/Error, and detailed heatmap panels are hidden from client view.
        These are ops/admin metrics that can be re-enabled in an internal admin dashboard if needed.
      */}

      {/* Appointment Performance + Re-engagement */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Appointment Performance */}
        <ChartCard title="Appointment Performance">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
              <div className="flex-1">
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Booked</div>
                <div className="text-3xl font-bold text-ink-1">{kpis.appointmentsBooked ?? 0}</div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
              <div className="flex-1">
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Kept (Attended)</div>
                <div className="text-3xl font-bold text-ink-1">{kpis.appointmentsKept ?? 0}</div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
              <div className="flex-1">
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">No-Show</div>
                <div className="text-3xl font-bold text-ink-1">{kpis.appointmentsNoShow ?? 0}</div>
              </div>
            </div>
            {(kpis.appointmentsBooked ?? 0) > 0 && (
              <div className="pt-3 border-t border-surface-line">
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Show-up Rate</div>
                <div className="text-2xl font-bold text-ink-1">
                  {Math.round(((kpis.appointmentsKept ?? 0) / (kpis.appointmentsBooked ?? 1)) * 100)}%
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-ink-2 mt-4">
            Tracked from calendar webhooks. Booked includes rescheduled appointments.
          </p>
        </ChartCard>

        {/* Re-engagement */}
        <ChartCard title="Lead Re-engagement">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
              <div className="flex-1">
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Re-engaged Leads</div>
                <div className="text-3xl font-bold text-ink-1">{kpis.reEngaged ?? 0}</div>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-bg border border-surface-line">
              <div className="flex-1">
                <div className="text-xs font-semibold text-ink-2 uppercase tracking-wider mb-1">Re-engagement Rate</div>
                <div className="text-3xl font-bold text-ink-1">{kpis.reEngagementRate ?? 0}%</div>
              </div>
            </div>
          </div>
          <p className="text-xs text-ink-2 mt-4">
            Leads inactive 30+ days who replied or booked in this period.
          </p>
        </ChartCard>
      </div>

      {/* Funnel Visualization
          TODO: Add stage-by-stage percentages, add "booked" and "kept" stages
          TODO: Add heatmap (hour-of-day / day-of-week) for reply patterns
          TODO: Add cohort chart (reactivation rate by lead age: 0-30d, 31-90d, 91-180d, 180d+)
      */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <Funnel data={funnelData} />
        </div>
      </div>

      {/* Pricing Modal */}
      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        accountId={billing?.account_id || process.env.NEXT_PUBLIC_DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111'}
      />
    </section>
  );
}
