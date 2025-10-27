'use client';

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
  const kpiPayload = data?.kpis ?? { newLeads: 0, messagesSent: 0, deliveredPct: 0, replies: 0 };
  const charts = data?.charts ?? { deliveryOverTime: [], repliesPerDay: [] };

  const kpis = buildKpis(kpiPayload);

  const chartDays: DayPoint[] = useMemo(() => {
    const map = new Map<string, DayPoint>();
    (charts.deliveryOverTime ?? []).forEach((row: any) => {
      if (!row?.date) return;
      map.set(row.date.slice(0, 10), {
        d: row.date.slice(0, 10),
        sent: toNumber(row.sent),
        delivered: toNumber(row.delivered),
        failed: toNumber(row.failed),
        inbound: 0,
      });
    });
    (charts.repliesPerDay ?? []).forEach((row: any) => {
      if (!row?.date) return;
      const key = row.date.slice(0, 10);
      const existing = map.get(key) ?? { d: key, sent: 0, delivered: 0, failed: 0, inbound: 0 };
      existing.inbound = toNumber(row.replies);
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.d.localeCompare(b.d));
  }, [charts]);

  const funnel = {
    leads: kpiPayload.newLeads ?? 0,
    sent: kpiPayload.messagesSent ?? 0,
    delivered: Math.round((toNumber(kpiPayload.deliveredPct) / 100) * toNumber(kpiPayload.messagesSent)),
    replied: kpiPayload.replies ?? 0,
  };

  return (
    <section className="space-y-8">
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
      </div>

      {(!data?.ok && !error) && (
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

      {error && (
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

      {isLoading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl bg-surface-bg" />
          ))}
        </div>
      ) : (
        <KpiCards data={kpis} className="mt-4" />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {chartDays.length ? (
          <DeliveryChart days={chartDays} />
        ) : (
          <div className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft text-sm text-ink-2">No delivery data yet.</div>
        )}
        {chartDays.length ? (
          <RepliesChart days={chartDays} />
        ) : (
          <div className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft text-sm text-ink-2">No replies yet.</div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <Funnel data={funnel} />
        </div>
      </div>
    </section>
  );
}
