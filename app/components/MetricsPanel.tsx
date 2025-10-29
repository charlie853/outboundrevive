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

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import KpiCards from '@/app/(app)/dashboard/components/KpiCards';
import DeliveryChart from '@/app/(app)/dashboard/components/DeliveryChart';
import RepliesChart from '@/app/(app)/dashboard/components/RepliesChart';
import Funnel from '@/app/(app)/dashboard/components/Funnel';
import type { DayPoint, Kpis } from '@/lib/types/metrics';

const WINDOW_OPTIONS = [
  { label: '7D', value: '7d' as const },
  { label: '24H', value: '24h' as const },
  { label: '1M', value: '30d' as const },
  // TODO: Add custom range option with date picker
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

const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalisePct = (value: unknown) => {
  const num = toNumber(value, NaN);
  if (!Number.isFinite(num)) return undefined;
  return Math.abs(num) > 1 ? num / 100 : num;
};

const buildKpis = (k: any): Kpis => {
  const newLeads = toNumber(k?.newLeads);
  const messagesSent = toNumber(k?.messagesSent);
  const deliveredPct = normalisePct(k?.deliveredPct) ?? 0;
  const replies = toNumber(k?.replies);

  return {
    leadsNew: newLeads,
    sent: messagesSent,
    delivered: 0,
    deliveredRate: deliveredPct,
    replies,
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

  const { data, error, isLoading, mutate } = useSWR(`/api/metrics?range=${range}`, fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    shouldRetryOnError: (err) => err?.status !== 401,
  });

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
  const charts = data?.charts ?? { deliveryOverTime: [], repliesPerDay: [] };
  const delivery = charts.deliveryOverTime ?? [];
  const repliesS = charts.repliesPerDay ?? [];

  const kpis = buildKpis(kpiPayload);
  const deliveryPoints: DayPoint[] = useMemo(() => {
    if (!Array.isArray(delivery) || delivery.length === 0) return [];
    const repliesMap = new Map<string, number>();
    repliesS.forEach((row: any) => {
      const src = row?.date;
      if (!src) return;
      const date = (() => {
        try {
          return new Date(src).toISOString().slice(0, 10);
        } catch {
          return typeof src === 'string' ? src.slice(0, 10) : '';
        }
      })();
      if (!date) return;
      repliesMap.set(date, toNumber(row?.replies));
    });

    return delivery
      .map((row: any) => {
        const src = row?.date;
        const iso = (() => {
          try {
            return new Date(src).toISOString().slice(0, 10);
          } catch {
            return typeof src === 'string' ? src.slice(0, 10) : '';
          }
        })();

        return {
          d: iso,
          sent: toNumber(row?.sent),
          delivered: toNumber(row?.delivered),
          failed: toNumber(row?.failed),
          inbound: repliesMap.get(iso) ?? 0,
        } as DayPoint;
      })
      .sort((a, b) => a.d.localeCompare(b.d));
  }, [delivery, repliesS]);

  const replyPoints: DayPoint[] = useMemo(() => {
    if (!Array.isArray(repliesS) || repliesS.length === 0) return [];
    return repliesS
      .map((row: any) => {
        const src = row?.date;
        const iso = (() => {
          try {
            return new Date(src).toISOString().slice(0, 10);
          } catch {
            return typeof src === 'string' ? src.slice(0, 10) : '';
          }
        })();

        return {
          d: iso,
          sent: 0,
          delivered: 0,
          failed: 0,
          inbound: toNumber(row?.replies),
        } as DayPoint;
      })
      .sort((a, b) => a.d.localeCompare(b.d));
  }, [repliesS]);

  /**
   * Funnel Data Structure
   * Shows progression: Delivered → Replied → Booked → Kept
   * 
   * TODO - FUTURE ENHANCEMENTS:
   * - Add "booked" count from leads.booked=true
   * - Add "kept" count from leads.kept=true
   * - Add "opt_out" count to show drop-off
   * - Show percentages at each stage (e.g., "24% reply rate")
   */
  const funnel = {
    leads: kpiPayload.newLeads ?? 0,
    sent: kpiPayload.messagesSent ?? 0,
    delivered: Math.round((toNumber(kpiPayload.deliveredPct) / 100) * toNumber(kpiPayload.messagesSent)),
    replied: kpiPayload.replies ?? 0,
    // TODO: Add booked and kept once backend provides them
    // booked: kpiPayload.booked ?? 0,
    // kept: kpiPayload.kept ?? 0,
  };

  return (
    <section className="space-y-8">
      {/* Time Range Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-surface-line bg-white p-1">
          {WINDOW_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleSetRange(value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                range === value ? 'bg-ink-1 text-white' : 'text-ink-1 hover:bg-surface-bg'
              }`}
              aria-pressed={range === value}
            >
              {label}
            </button>
          ))}
        </div>
        {/* TODO: Add export button here */}
        {/* <button className="...">Export CSV</button> */}
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

      {/* Time Series Charts
          TODO: Make interactive with hover tooltips, add 7-day rolling average overlay
      */}
      <div className="grid gap-6 md:grid-cols-2">
        {delivery.length >= 1 ? (
          <DeliveryChart days={deliveryPoints} />
        ) : (
          <div className="rounded-2xl border border-surface-line bg-surface-card p-4 text-sm text-ink-2 shadow-soft">
            No delivery data yet. Send your first campaign to see stats here.
          </div>
        )}
        {repliesS.length >= 1 ? (
          <RepliesChart days={replyPoints} />
        ) : (
          <div className="rounded-2xl border border-surface-line bg-surface-card p-4 text-sm text-ink-2 shadow-soft">
            No replies yet. Once leads respond, you'll see engagement trends here.
          </div>
        )}
      </div>

      {/* Funnel Visualization
          TODO: Add stage-by-stage percentages, add "booked" and "kept" stages
          TODO: Add heatmap (hour-of-day / day-of-week) for reply patterns
          TODO: Add cohort chart (reactivation rate by lead age: 0-30d, 31-90d, 91-180d, 180d+)
      */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <Funnel data={funnel} />
        </div>
      </div>
    </section>
  );
}
