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

const buildKpis = (k: any): Kpis & { booked?: number; contacted?: number; optedOut?: number; replyRate?: number; optOutRate?: number } => {
  const newLeads = toNumber(k?.newLeads);
  const messagesSent = toNumber(k?.messagesSent);
  const deliveredPct = normalisePct(k?.deliveredPct) ?? 0;
  const replies = toNumber(k?.replies);
  
  // NEW KPIs
  const booked = toNumber(k?.booked);
  const contacted = toNumber(k?.contacted);
  const optedOut = toNumber(k?.optedOut);
  const replyRate = normalisePct(k?.replyRate) ?? 0;
  const optOutRate = normalisePct(k?.optOutRate) ?? 0;

  return {
    leadsNew: newLeads,
    sent: messagesSent,
    delivered: 0,
    deliveredRate: deliveredPct,
    replies,
    booked, // NEW
    contacted, // NEW
    optedOut, // NEW
    replyRate, // NEW
    optOutRate, // NEW
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

  // Feature flags (caps/cadences/new_charts)
  const { data: status } = useSWR('/api/ui/account/status', fetcherNoThrow, {
    refreshInterval: 60000,
    revalidateOnFocus: true,
  });
  const newChartsEnabled: boolean = !!status?.new_charts_enabled;

  // Analytics panels
  const { data: heatmap } = useSWR(`/api/analytics/heatmap?range=${range}`, fetcherNoThrow, { refreshInterval: 60000 });
  const { data: carriers } = useSWR(`/api/analytics/carriers?range=${range}`, fetcherNoThrow, { refreshInterval: 60000 });
  const { data: intents } = useSWR(`/api/analytics/intents?range=${range}`, fetcherNoThrow, { refreshInterval: 60000 });
  const { data: quiet } = useSWR(`/api/analytics/quiet?range=${range}`, fetcherNoThrow, { refreshInterval: 60000 });
  const { data: billing } = useSWR(`/api/billing/status`, fetcherNoThrow, { refreshInterval: 60000 });

  // Simple canvas heatmap (PNG exportable without extra deps)
  const heatmapRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const buckets: number[][] = Array.isArray(heatmap?.heatmap) ? heatmap.heatmap : [];
    const canvas = heatmapRef.current;
    if (!canvas || !buckets.length) return;
    const rows = buckets.length; const cols = buckets[0].length || 24;
    const cell = 16; const pad = 24; // px
    canvas.width = cols * cell + pad * 2;
    canvas.height = rows * cell + pad * 2 + 16;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
    const max = Math.max(1, ...buckets.flat());
    // axes labels
    const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    ctx.fillStyle = '#111'; ctx.font = '12px sans-serif';
    dows.forEach((d, r) => ctx.fillText(d, 4, pad + r*cell + 12));
    for (let h = 0; h < cols; h += 3) ctx.fillText(String(h).padStart(2,'0'), pad + h*cell, 14);
    // cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = buckets[r][c] || 0;
        const t = v / max;
        const col = Math.floor(255 - t * 180);
        ctx.fillStyle = `rgb(${col}, ${col}, 255)`;
        ctx.fillRect(pad + c*cell, pad + r*cell, cell-1, cell-1);
      }
    }
  }, [heatmap]);

  const exportHeatmapPng = () => {
    const canvas = heatmapRef.current; if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = `replies-heatmap-${range}.png`; a.click();
  };

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
      {/* Dashboard Header - Match homepage theme (indigo gradient) */}
      <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 p-6 shadow-xl">
        <h2 className="text-xl font-bold text-white mb-2">Live Performance Dashboard</h2>
        <p className="text-sm text-indigo-100">
          Track your AI texter's outreach performance and conversation health in real-time. 
          Metrics update as messages are sent and leads respond.
        </p>
      </div>

      {/* Time Range Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-indigo-200 bg-white p-1 shadow-md">
          {WINDOW_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => handleSetRange(value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                range === value 
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md' 
                  : 'text-slate-700 hover:bg-indigo-50'
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
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all shadow-md"
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

      {/* Time Series Charts (feature-flagged modern theming) */}
      <div className={newChartsEnabled ? 'grid gap-6 md:grid-cols-2 [&>*]:ring-1 [&>*]:ring-indigo-200 [&>*]:rounded-2xl [&>*]:shadow-lg' : 'grid gap-6 md:grid-cols-2'}>
        {delivery.length >= 1 ? (
          <DeliveryChart days={deliveryPoints} /* modern={newChartsEnabled} */ />
        ) : (
          <div className="rounded-2xl border border-surface-line bg-surface-card p-4 text-sm text-ink-2 shadow-soft">
            No delivery data yet. Send your first campaign to see stats here.
          </div>
        )}
        {repliesS.length >= 1 ? (
          <RepliesChart days={replyPoints} /* modern={newChartsEnabled} */ />
        ) : (
          <div className="rounded-2xl border border-surface-line bg-surface-card p-4 text-sm text-ink-2 shadow-soft">
            No replies yet. Once leads respond, you'll see engagement trends here.
          </div>
        )}
      </div>

      {/* Caps progress + quiet hours widget */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-surface-line bg-surface-card p-4">
          <h3 className="text-sm font-semibold text-ink-1 mb-2">Monthly SMS Cap</h3>
          {billing?.monthly_cap_segments ? (
            <div>
              <div className="text-xs text-ink-2 mb-1">Plan: {billing?.plan_tier || 'unknown'}</div>
              {(() => {
                const used = Number(billing?.segments_used || 0);
                const cap = Number(billing?.monthly_cap_segments || 0);
                const pct = cap > 0 ? Math.min(1, used / cap) : 0;
                const pc100 = Math.round(pct * 100);
                const bar = (
                  <div className="w-full h-2 bg-surface-bg rounded">
                    <div className={`h-2 rounded ${pc100 >= 100 ? 'bg-rose-500' : pc100 >= 80 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${pc100}%` }} />
                  </div>
                );
                return (
            <div className="space-y-2">
                    {bar}
                    <div className="text-xs text-ink-2">{used} / {cap} segments ({pc100}%)</div>
                    {pc100 >= 100 && (
                      <div className="text-xs text-rose-600">Cap reached — outbound paused. <button onClick={async ()=>{
                        const pr = await fetch('/api/billing/upgrade/preview').then(r=>r.json()).catch(()=>({plans:[]}));
                        const plan = (Array.isArray(pr?.plans)?pr.plans:[])[1];
                        if (!plan) return;
                        const stripe = await fetch('/api/billing/stripe/checkout', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ plan_id: plan.id, account_id: status?.account_id })}).then(r=>r.json()).catch(()=>({}));
                        if (stripe?.url) window.location.href = stripe.url; else if (stripe?.error) alert('Upgrade unavailable: ' + stripe.error);
                      }} className="underline">Upgrade</button></div>
                    )}
                    {pc100 >= 80 && pc100 < 100 && (
                      <div className="text-xs text-amber-600">Approaching cap — consider upgrading. <button onClick={async ()=>{
                        const pr = await fetch('/api/billing/upgrade/preview').then(r=>r.json()).catch(()=>({plans:[]}));
                        const plan = (Array.isArray(pr?.plans)?pr.plans:[])[1];
                        if (!plan) return;
                        const stripe = await fetch('/api/billing/stripe/checkout', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ plan_id: plan.id, account_id: status?.account_id })}).then(r=>r.json()).catch(()=>({}));
                        if (stripe?.url) window.location.href = stripe.url; else if (stripe?.error) alert('Upgrade unavailable: ' + stripe.error);
                      }} className="underline">Upgrade</button></div>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="text-sm text-ink-2">Billing info unavailable.</div>
          )}
        </div>
        <div className="rounded-2xl border border-surface-line bg-surface-card p-4">
          <h3 className="text-sm font-semibold text-ink-1 mb-2">Quiet Hours</h3>
          <div className="text-xs text-ink-2 mb-2">Blocked sends in range: {Number(quiet?.count || 0)}</div>
          <a className="text-xs underline" href="/followups">Edit quiet hours & windows</a>
        </div>
        <div className="rounded-2xl border border-surface-line bg-surface-card p-4">
          <h3 className="text-sm font-semibold text-ink-1 mb-2">Top Intents</h3>
          <div className="text-xs text-ink-2 border rounded p-2 max-h-48 overflow-auto">
          {(Array.isArray(intents?.intents) ? intents.intents : []).map((row: any) => (
            <div key={row.intent} className="flex justify-between"><span>{row.intent}</span><span>{row.count}</span></div>
          ))}
          </div>
        </div>
      </div>

      {/* Analytics Panels: Heatmap and Carrier/Error breakdown */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-surface-line bg-surface-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-ink-1">Reply Heatmap (hour × day)</h3>
            <button onClick={exportHeatmapPng} className="text-xs px-2 py-1 rounded bg-indigo-600 text-white">Export PNG</button>
          </div>
          {Array.isArray(heatmap?.heatmap) && heatmap.heatmap.length ? (
            <canvas ref={heatmapRef} style={{ width: '100%', maxWidth: 560 }} />
          ) : (
            <div className="text-sm text-ink-2">No data yet.</div>
          )}
        </div>
        <div className="rounded-2xl border border-surface-line bg-surface-card p-4">
          <h3 className="text-sm font-semibold text-ink-1 mb-2">Carrier/Error Breakdown</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-medium text-ink-2 mb-1">Regions</div>
              <div className="text-xs text-ink-2 border rounded p-2 max-h-48 overflow-auto">
              {(Array.isArray(carriers?.breakdown) ? carriers.breakdown : []).map((row: any) => (
                <div key={row.region} className="flex justify-between">
                  <span>{row.region}</span>
                  <span>{row.delivered}/{row.sent + row.delivered + row.failed} (failed {row.failed})</span>
                </div>
              ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-ink-2 mb-1">Top Error Codes</div>
              <div className="text-xs text-ink-2 border rounded p-2 max-h-48 overflow-auto">
              {(Array.isArray(carriers?.errors) ? carriers.errors : []).map((row: any) => (
                <div key={row.code} className="flex justify-between"><span>{row.code}</span><span>{row.count}</span></div>
              ))}
              </div>
            </div>
          </div>
        </div>
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
