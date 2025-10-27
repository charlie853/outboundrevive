'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ConnectCrmButton from '@/app/components/ConnectCrmButton';
import KpiCards from '@/app/(app)/dashboard/components/KpiCards';
import DeliveryChart from '@/app/(app)/dashboard/components/DeliveryChart';
import RepliesChart from '@/app/(app)/dashboard/components/RepliesChart';
import Funnel from '@/app/(app)/dashboard/components/Funnel';
import type { DayPoint, Kpis } from '@/lib/types/metrics';

const WINDOWS = ['24h', '7d', '30d'] as const;
type WindowKey = typeof WINDOWS[number];

type SeriesPoint = { date: string; count: number };

type MetricsApi = {
  ok?: boolean;
  out24?: number;
  in24?: number;
  deliveredPct24?: number;
  newLeads24?: number;
  series?: {
    out?: SeriesPoint[];
    in?: SeriesPoint[];
  };
  charts?: {
    deliveryOverTime?: Array<{ date: string; sent?: number; delivered?: number; failed?: number }>;
    repliesPerDay?: Array<{ date: string; replies?: number }>;
  };
  kpis?: {
    leads?: { current?: number; previous?: number; deltaPct?: number };
    messages?: { current?: number; previous?: number; deltaPct?: number };
    delivered?: { pct?: number; prevPct?: number; deltaPct?: number };
    replies?: { current?: number; previous?: number; deltaPct?: number };
  };
  funnel?: {
    leads?: number;
    contacted?: number;
    delivered?: number;
    replied?: number;
  };
};

type AdaptedModel = {
  kpis: Kpis;
  delivery: Array<{ date: string; sent: number; delivered: number; failed: number }>;
  replies: Array<{ date: string; replies: number }>;
  funnel: { leads: number; sent: number; delivered: number; replied: number };
};

const EMPTY_MODEL: AdaptedModel = {
  kpis: {
    leadsNew: 0,
    sent: 0,
    delivered: 0,
    deliveredRate: 0,
    replies: 0,
    deltas: { leadsNew: 0, sent: 0, deliveredRate: 0, replies: 0 },
  },
  delivery: [],
  replies: [],
  funnel: { leads: 0, sent: 0, delivered: 0, replied: 0 },
};

const fetchJson = async (url: string) => {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'x-requested-with': 'dashboard' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error('Fetch failed');
    err.status = res.status;
    err.data = json;
    throw err;
  }
  return json;
};

const toNumber = (input: unknown, fallback = 0) => {
  const num = Number(input);
  return Number.isFinite(num) ? num : fallback;
};

function adaptToUiModel(api?: MetricsApi | null): AdaptedModel {
  if (!api) return EMPTY_MODEL;

  const outSeries = api.series?.out ?? [];
  const inSeries = api.series?.in ?? [];

  const deliverySeries = api.charts?.deliveryOverTime ?? [];
  const repliesSeries = api.charts?.repliesPerDay ?? [];

  const deliveryMap = new Map<string, { sent: number; delivered: number; failed: number }>();

  deliverySeries.forEach((row) => {
    const date = row?.date;
    if (!date) return;
    deliveryMap.set(date, {
      sent: toNumber(row.sent),
      delivered: toNumber(row.delivered),
      failed: toNumber(row.failed),
    });
  });

  if (deliveryMap.size === 0 && outSeries.length) {
    outSeries.forEach((point) => {
      if (!point?.date) return;
      const existing = deliveryMap.get(point.date) ?? { sent: 0, delivered: 0, failed: 0 };
      existing.sent += toNumber(point.count);
      deliveryMap.set(point.date, existing);
    });
  }

  const delivery = Array.from(deliveryMap.entries())
    .map(([date, counts]) => ({ date, ...counts }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const repliesMap = new Map<string, number>();
  repliesSeries.forEach((row) => {
    if (!row?.date) return;
    repliesMap.set(row.date, toNumber(row.replies));
  });
  if (repliesMap.size === 0 && inSeries.length) {
    inSeries.forEach((point) => {
      if (!point?.date) return;
      repliesMap.set(point.date, toNumber(point.count) + (repliesMap.get(point.date) ?? 0));
    });
  }
  const replies = Array.from(repliesMap.entries())
    .map(([date, replies]) => ({ date, replies }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const leadsCurrent = toNumber(api.kpis?.leads?.current, toNumber(api.newLeads24));
  const leadsPrevious = toNumber(api.kpis?.leads?.previous);

  const messagesCurrent = toNumber(
    api.kpis?.messages?.current,
    toNumber(api.out24 ?? 0, outSeries.reduce((sum, p) => sum + toNumber(p.count), 0)),
  );
  const messagesPrevious = toNumber(api.kpis?.messages?.previous);

  const repliesCurrent = toNumber(
    api.kpis?.replies?.current,
    toNumber(api.in24 ?? 0, inSeries.reduce((sum, p) => sum + toNumber(p.count), 0)),
  );
  const repliesPrevious = toNumber(api.kpis?.replies?.previous);

  const deliveredPctRaw = toNumber(api.kpis?.delivered?.pct, toNumber(api.deliveredPct24));
  const deliveredPrevPctRaw = toNumber(api.kpis?.delivered?.prevPct);
  const deliveredRate = deliveredPctRaw > 1 ? deliveredPctRaw / 100 : deliveredPctRaw;
  const deliveredPrevRate = deliveredPrevPctRaw > 1 ? deliveredPrevPctRaw / 100 : deliveredPrevPctRaw;

  const normaliseDelta = (raw?: number) => {
    if (!Number.isFinite(raw)) return undefined;
    const value = raw as number;
    return Math.abs(value) > 1 ? value / 100 : value;
  };

  const calcDelta = (current: number, prev: number, explicit?: number) => {
    const normalised = normaliseDelta(explicit);
    if (Number.isFinite(normalised)) return normalised!;
    if (!Number.isFinite(prev) || prev === 0) return current > 0 ? 1 : 0;
    return (current - prev) / prev;
  };

  const kpis: Kpis = {
    leadsNew: leadsCurrent,
    sent: messagesCurrent,
    delivered: 0,
    deliveredRate: Number.isFinite(deliveredRate) ? deliveredRate : 0,
    replies: repliesCurrent,
    deltas: {
      leadsNew: calcDelta(leadsCurrent, leadsPrevious, api.kpis?.leads?.deltaPct),
      sent: calcDelta(messagesCurrent, messagesPrevious, api.kpis?.messages?.deltaPct),
      deliveredRate: calcDelta(deliveredRate, deliveredPrevRate, api.kpis?.delivered?.deltaPct),
      replies: calcDelta(repliesCurrent, repliesPrevious, api.kpis?.replies?.deltaPct),
    },
  };

  const funnel = {
    leads: toNumber(api.funnel?.leads, leadsCurrent),
    sent: toNumber(api.funnel?.contacted, messagesCurrent),
    delivered: toNumber(api.funnel?.delivered, Math.round(kpis.deliveredRate * messagesCurrent)),
    replied: toNumber(api.funnel?.replied, repliesCurrent),
  };

  return { kpis, delivery, replies, funnel };
}

export default function MetricsPanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const searchRange = (searchParams?.get('range') ?? searchParams?.get('window') ?? '7d').toLowerCase();
  const initialRange: WindowKey = WINDOWS.includes(searchRange as WindowKey)
    ? (searchRange as WindowKey)
    : '7d';

  const [range, setRange] = useState<WindowKey>(initialRange);

  useEffect(() => {
    if (WINDOWS.includes(searchRange as WindowKey) && searchRange !== range) {
      setRange(searchRange as WindowKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchRange]);

  const { data, error, isLoading, mutate } = useSWR(`/api/metrics?range=${range}`, fetchJson, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  if (error) {
    console.warn('[METRICS_PANEL] error', error);
  }

  const isUnavailable = !!error || data?.ok === false;
  const model = adaptToUiModel(data);

  const handleRangeChange = (next: WindowKey) => {
    if (next === range) return;
    setRange(next);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('range', next);
    params.set('window', next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const repliesMap = useMemo(() => {
    const map = new Map<string, number>();
    model.replies.forEach((row) => map.set(row.date, row.replies));
    return map;
  }, [model.replies]);

  const dayPoints: DayPoint[] = useMemo(() => {
    const keys = new Set<string>();
    model.delivery.forEach((row) => keys.add(row.date));
    repliesMap.forEach((_, key) => keys.add(key));
    return Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map((date) => {
        const deliveryRow = model.delivery.find((row) => row.date === date);
        return {
          d: date,
          sent: deliveryRow?.sent ?? 0,
          delivered: deliveryRow?.delivered ?? 0,
          failed: deliveryRow?.failed ?? 0,
          inbound: repliesMap.get(date) ?? 0,
        };
      });
  }, [model.delivery, repliesMap]);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-1">Dashboard</h1>
          <p className="text-sm text-ink-3">Track outreach performance in real time.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-surface-line bg-white p-1">
            {WINDOWS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleRangeChange(option)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  range === option ? 'bg-ink-1 text-white' : 'text-ink-1 hover:bg-surface-bg'
                }`}
                aria-pressed={range === option}
              >
                {option === '24h' ? '24H' : option.toUpperCase()}
              </button>
            ))}
          </div>
          <ConnectCrmButton />
        </div>
      </div>

      {isUnavailable && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Metrics temporarily unavailable. If you’re not signed in, please sign in and refresh.
          <button
            type="button"
            className="rounded-lg border border-amber-400 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
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
        <KpiCards data={model.kpis} className="mt-4" />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <DeliveryChart days={dayPoints} />
        <RepliesChart days={dayPoints} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <Funnel data={model.funnel} />
        </div>
      </div>
    </section>
  );
}
