'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import KpiCards from '@/app/(app)/dashboard/components/KpiCards';
import DeliveryChart from '@/app/(app)/dashboard/components/DeliveryChart';
import RepliesChart from '@/app/(app)/dashboard/components/RepliesChart';
import Funnel from '@/app/(app)/dashboard/components/Funnel';
import type { DayPoint, Kpis } from '@/lib/types/metrics';
import ConnectCrmButton from '@/app/components/ConnectCrmButton';

const WINDOWS = ['24h', '7d', '30d'] as const;
type WindowKey = typeof WINDOWS[number];

type SeriesPoint = { date: string; count: number };

type MetricsApi = {
  ok?: boolean;
  out24?: number;
  in24?: number;
  reminders24?: number;
  paused?: number;
  series?: {
    out?: SeriesPoint[];
    in?: SeriesPoint[];
  };
  charts?: {
    deliveryOverTime?: Array<{ date: string; sent?: number; delivered?: number; failed?: number }>;
    repliesPerDay?: Array<{ date: string; replies?: number }>;
  };
  kpis?: {
    leadsNew?: number;
    sent?: number;
    delivered?: number;
    deliveredRate?: number;
    deliveredPct?: number;
    replies?: number;
    deltas?: {
      leadsNew?: number;
      sent?: number;
      deliveredRate?: number;
      deliveredPct?: number;
      replies?: number;
    };
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
  days: DayPoint[];
  funnel: { leads: number; contacted: number; delivered: number; replied: number };
};

const emptyModel: AdaptedModel = {
  kpis: {
    leadsNew: 0,
    sent: 0,
    delivered: 0,
    deliveredRate: 0,
    replies: 0,
    deltas: { leadsNew: 0, sent: 0, deliveredRate: 0, replies: 0 },
  },
  days: [],
  funnel: { leads: 0, contacted: 0, delivered: 0, replied: 0 },
};

const fetchJson = async (url: string) => {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'x-requested-with': 'dashboard' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error('Fetch failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

function toNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function adaptToUiModel(api: MetricsApi | null | undefined): AdaptedModel {
  if (!api) return emptyModel;

  const deliverySeries = api.charts?.deliveryOverTime ?? [];
  const repliesSeries = api.charts?.repliesPerDay ?? [];
  const outSeries = api.series?.out ?? [];
  const inSeries = api.series?.in ?? [];

  const dayMap = new Map<string, DayPoint>();

  deliverySeries.forEach((row) => {
    const date = row?.date ?? '';
    if (!date) return;
    dayMap.set(date, {
      d: date,
      sent: toNumber(row.sent),
      delivered: toNumber(row.delivered),
      failed: toNumber(row.failed),
      inbound: 0,
    });
  });

  if (dayMap.size === 0 && outSeries.length > 0) {
    outSeries.forEach((row) => {
      if (!row?.date) return;
      const existing = dayMap.get(row.date);
      if (existing) existing.sent += toNumber(row.count);
      else {
        dayMap.set(row.date, {
          d: row.date,
          sent: toNumber(row.count),
          delivered: 0,
          failed: 0,
          inbound: 0,
        });
      }
    });
  }

  repliesSeries.forEach((row) => {
    const date = row?.date ?? '';
    if (!date) return;
    const existing = dayMap.get(date);
    if (existing) existing.inbound = toNumber(row.replies);
    else {
      dayMap.set(date, {
        d: date,
        sent: 0,
        delivered: 0,
        failed: 0,
        inbound: toNumber(row.replies),
      });
    }
  });

  if (dayMap.size === 0 && inSeries.length > 0) {
    inSeries.forEach((row) => {
      if (!row?.date) return;
      const existing = dayMap.get(row.date);
      if (existing) existing.inbound += toNumber(row.count);
      else {
        dayMap.set(row.date, {
          d: row.date,
          sent: 0,
          delivered: 0,
          failed: 0,
          inbound: toNumber(row.count),
        });
      }
    });
  }

  const days = Array.from(dayMap.values()).sort((a, b) => a.d.localeCompare(b.d));

  const kpiSource = api.kpis ?? {};
  const deltaSource = kpiSource.deltas ?? {};

  const leadsNew = toNumber(kpiSource.leadsNew, toNumber(api.newLeads24));
  const messagesSent = toNumber(kpiSource.sent, toNumber(api.out24));
  const delivered = toNumber(kpiSource.delivered);
  const deliveredRateRaw =
    typeof kpiSource.deliveredRate === 'number'
      ? kpiSource.deliveredRate
      : toNumber(kpiSource.deliveredPct, toNumber(api.deliveredPct24)) / 100;
  const deliveredRate = Number.isFinite(deliveredRateRaw) ? deliveredRateRaw : 0;
  const replies = toNumber(kpiSource.replies, toNumber(api.in24));

  const deltas = {
    leadsNew: toNumber(deltaSource.leadsNew),
    sent: toNumber(deltaSource.sent),
    deliveredRate: toNumber(deltaSource.deliveredRate, toNumber(deltaSource.deliveredPct) / 100),
    replies: toNumber(deltaSource.replies),
  };

  const fallbackMessagesSent = messagesSent || outSeries.reduce((sum, row) => sum + toNumber(row.count), 0);
  const fallbackReplies = replies || inSeries.reduce((sum, row) => sum + toNumber(row.count), 0);

  const kpis: Kpis = {
    leadsNew,
    sent: fallbackMessagesSent,
    delivered,
    deliveredRate,
    replies: fallbackReplies,
    deltas,
  };

  const funnel = {
    leads: toNumber(api.funnel?.leads, leadsNew),
    sent: toNumber(api.funnel?.sent, toNumber(api.funnel?.contacted)),
    delivered: toNumber(api.funnel?.delivered, delivered),
    replied: toNumber(api.funnel?.replied, fallbackReplies),
  };

  return { kpis, days, funnel };
}

export default function MetricsPanel() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const searchWindow = (searchParams?.get('window') ?? '7d').toLowerCase();
  const initialWindow: WindowKey = WINDOWS.includes(searchWindow as WindowKey)
    ? (searchWindow as WindowKey)
    : '7d';

  const [windowKey, setWindowKey] = useState<WindowKey>(initialWindow);

  useEffect(() => {
    if (WINDOWS.includes(searchWindow as WindowKey) && searchWindow !== windowKey) {
      setWindowKey(searchWindow as WindowKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchWindow]);

  const { data, error, isLoading } = useSWR(`/api/metrics?window=${windowKey}`, fetchJson, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  const isAuthError = error && (error.status === 401 || error.status === 403);
  const isNetworkError = error && typeof error.status === 'undefined';
  const model = data ? adaptToUiModel(data) : emptyModel;

  const handleWindowChange = (next: WindowKey) => {
    if (next === windowKey) return;
    setWindowKey(next);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('window', next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const skeleton = isLoading && !data;

  const banner = (isAuthError || isNetworkError) ? (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Metrics temporarily unavailable. If you’re not signed in, please sign in and refresh.
    </div>
  ) : null;

  const days = useMemo(() => (model.days.length ? model.days : []), [model.days]);

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-1">Dashboard</h1>
          <p className="text-sm text-ink-3">Track outreach performance in real time.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border border-surface-line bg-white p-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => handleWindowChange(w)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  windowKey === w ? 'bg-ink-1 text-white' : 'text-ink-1 hover:bg-surface-bg'
                }`}
                aria-pressed={windowKey === w}
              >
                {w === '24h' ? '24H' : w.toUpperCase()}
              </button>
            ))}
          </div>
          <ConnectCrmButton />
        </div>
      </div>

      {banner}

      {skeleton ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl bg-surface-bg" />
          ))}
        </div>
      ) : (
        <KpiCards data={model.kpis} className="mt-4" />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <DeliveryChart days={days} />
        <RepliesChart days={days} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <Funnel data={model.funnel} />
        </div>
      </div>
    </section>
  );
}
