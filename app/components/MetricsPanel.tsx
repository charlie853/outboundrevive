'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import KpiCards from '@/app/(app)/dashboard/components/KpiCards';
import DeliveryChart from '@/app/(app)/dashboard/components/DeliveryChart';
import RepliesChart from '@/app/(app)/dashboard/components/RepliesChart';
import Funnel from '@/app/(app)/dashboard/components/Funnel';
import type { DayPoint, Kpis } from '@/lib/types/metrics';

const WINDOWS = ['24h', '7d', '30d'] as const;
type WindowKey = typeof WINDOWS[number];

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    const error: any = new Error('unauthorized');
    error.status = 401;
    error.data = data;
    throw error;
  }
  if (!res.ok) {
    const error: any = new Error(`http ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
};

const toNumber = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalisePct = (value: unknown) => {
  const num = toNumber(value, NaN);
  if (!Number.isFinite(num)) return undefined;
  return Math.abs(num) > 1 ? num / 100 : num;
};

const buildKpis = (data: any): Kpis => {
  const leadsCurrent = toNumber(data?.kpis?.leadsCurrent, toNumber(data?.kpis?.leads?.current, data?.leadsCurrent ?? data?.newLeads24));
  const leadsPrev = toNumber(data?.kpis?.leadsPrevious, toNumber(data?.kpis?.leads?.previous));
  const leadsDeltaSource = normalisePct(data?.kpis?.deltaLeadsPct ?? data?.kpis?.leads?.deltaPct);

  const messagesCurrent = toNumber(
    data?.kpis?.messagesSentCurrent,
    toNumber(data?.kpis?.messages?.current, data?.messagesSentCurrent ?? data?.out24),
  );
  const messagesPrev = toNumber(data?.kpis?.messagesSentPrevious, toNumber(data?.kpis?.messages?.previous));
  const messagesDeltaSource = normalisePct(data?.kpis?.deltaMessagesSentPct ?? data?.kpis?.messages?.deltaPct);

  const deliveredRateCurrent = normalisePct(data?.kpis?.deliveredRateCurrent ?? data?.kpis?.delivered?.pct) ?? 0;
  const deliveredRatePrev = normalisePct(data?.kpis?.deliveredRatePrevious ?? data?.kpis?.delivered?.prevPct) ?? 0;
  const deliveredDeltaSource = normalisePct(data?.kpis?.deltaDeliveredRatePct ?? data?.kpis?.delivered?.deltaPct);

  const repliesCurrent = toNumber(data?.kpis?.repliesCurrent, toNumber(data?.kpis?.replies?.current, data?.repliesCurrent ?? data?.in24));
  const repliesPrev = toNumber(data?.kpis?.repliesPrevious, toNumber(data?.kpis?.replies?.previous));
  const repliesDeltaSource = normalisePct(data?.kpis?.deltaRepliesPct ?? data?.kpis?.replies?.deltaPct);

  const calcDelta = (current: number, prev: number, explicit?: number) => {
    if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
    if (!Number.isFinite(prev) || prev === 0) return current > 0 ? 1 : 0;
    return (current - prev) / prev;
  };

  return {
    leadsNew: leadsCurrent,
    sent: messagesCurrent,
    delivered: 0,
    deliveredRate: deliveredRateCurrent,
    replies: repliesCurrent,
    deltas: {
      leadsNew: calcDelta(leadsCurrent, leadsPrev, leadsDeltaSource),
      sent: calcDelta(messagesCurrent, messagesPrev, messagesDeltaSource),
      deliveredRate: calcDelta(deliveredRateCurrent, deliveredRatePrev, deliveredDeltaSource),
      replies: calcDelta(repliesCurrent, repliesPrev, repliesDeltaSource),
    },
  };
};

const buildDeliverySeries = (data: any) => {
  const provided = Array.isArray(data?.charts?.deliveryOverTime) ? data.charts.deliveryOverTime : [];
  if (provided.length) {
    return provided.map((row: any) => ({
      date: row.date,
      sent: toNumber(row.sent),
      delivered: toNumber(row.delivered),
      failed: toNumber(row.failed),
    }));
  }
  const series = data?.series?.out ?? [];
  return series.map((row: any) => ({
    date: row.date,
    sent: toNumber(row.count),
    delivered: 0,
    failed: 0,
  }));
};

const buildRepliesSeries = (data: any) => {
  const provided = Array.isArray(data?.charts?.repliesPerDay) ? data.charts.repliesPerDay : [];
  if (provided.length) return provided.map((row: any) => ({ date: row.date, replies: toNumber(row.replies ?? row.count) }));
  const series = data?.series?.in ?? [];
  return series.map((row: any) => ({ date: row.date, replies: toNumber(row.count) }));
};

const buildFunnel = (data: any, kpis: Kpis) => ({
  leads: toNumber(data?.funnel?.leads, kpis.leadsNew),
  sent: toNumber(data?.funnel?.contacted ?? data?.funnel?.sent, kpis.sent),
  delivered: toNumber(data?.funnel?.delivered, Math.round(kpis.deliveredRate * kpis.sent)),
  replied: toNumber(data?.funnel?.replied, kpis.replies),
});

export default function MetricsPanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialRange = (() => {
    const fromQuery = (searchParams?.get('range') ?? searchParams?.get('window') ?? '7d').toLowerCase();
    return WINDOWS.includes(fromQuery as WindowKey) ? (fromQuery as WindowKey) : '7d';
  })();

  const [range, setRange] = useState<WindowKey>(initialRange);

  const { data, error, isLoading, mutate } = useSWR(`/api/metrics?range=${range}`, fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    shouldRetryOnError: (err) => err?.status !== 401,
  });

  const handleSetRange = (value: WindowKey) => {
    if (value === range) return;
    setRange(value);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('range', value);
    params.set('window', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (error) {
    console.warn('[METRICS_PANEL] error', error);
  }

  const isUnauthorized = (error as any)?.status === 401;
  const isHardFailure = !!error && !isUnauthorized;
  const kpis = data ? buildKpis(data) : buildKpis({});
  const deliverySeries = data ? buildDeliverySeries(data) : [];
  const repliesSeries = data ? buildRepliesSeries(data) : [];
  const funnel = data ? buildFunnel(data, kpis) : buildFunnel({}, kpis);

  const chartDays: DayPoint[] = useMemo(() => {
    const keys = new Set<string>();
    deliverySeries.forEach((row: any) => keys.add(row.date));
    repliesSeries.forEach((row: any) => keys.add(row.date));
    return Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map((date) => {
        const deliveryRow = deliverySeries.find((row: any) => row.date === date);
        const repliesRow = repliesSeries.find((row: any) => row.date === date);
        return {
          d: date,
          sent: deliveryRow?.sent ?? 0,
          delivered: deliveryRow?.delivered ?? 0,
          failed: deliveryRow?.failed ?? 0,
          inbound: repliesRow?.replies ?? 0,
        };
      });
  }, [deliverySeries, repliesSeries]);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-surface-line bg-white p-1">
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSetRange(option)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                range === option ? 'bg-ink-1 text-white' : 'text-ink-1 hover:bg-surface-bg'
              }`}
              aria-pressed={range === option}
            >
              {option === '24h' ? '24H' : option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {isUnauthorized && (
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

      {isHardFailure && !isUnauthorized && (
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
        <DeliveryChart days={chartDays} />
        <RepliesChart days={chartDays} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <Funnel data={funnel} />
        </div>
      </div>
    </section>
  );
}
