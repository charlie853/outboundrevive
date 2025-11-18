'use client';

import useSWR from 'swr';
import type { DeliveryPoint, ReplyPoint, Kpis, FunnelData } from '@/lib/types/metrics';
import type { WindowKey } from './TimeRangeSelector';

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

export function useMetricsData(range: WindowKey) {
  const { data, error, isLoading, mutate } = useSWR(`/api/metrics?range=${range}`, fetcher, {
    refreshInterval: 30000,
    revalidateOnFocus: true,
    shouldRetryOnError: (err) => err?.status !== 401,
  });

  const { data: intents } = useSWR(`/api/analytics/intents?range=${range}`, fetcherNoThrow, { refreshInterval: 60000 });
  const { data: billing } = useSWR(`/api/billing/status`, fetcherNoThrow, { refreshInterval: 60000 });

  const isUnauthorized = (error as any)?.status === 401;
  const showBanner = (!error && data?.ok === false) || isUnauthorized;

  const kpiPayload = data?.kpis ?? { newLeads: 0, messagesSent: 0, deliveredPct: 0, replies: 0 };
  const charts = data?.charts ?? { deliveryOverTime: [], repliesOverTime: [], timezone: 'America/New_York' };
  const deliveryPoints: DeliveryPoint[] = Array.isArray(charts.deliveryOverTime) ? charts.deliveryOverTime : [];
  const replyPoints: ReplyPoint[] = Array.isArray(charts.repliesOverTime) ? charts.repliesOverTime : [];

  const kpis = buildKpis(kpiPayload);
  const funnelData: FunnelData | undefined = data?.funnel;

  return {
    kpis,
    deliveryPoints,
    replyPoints,
    funnelData,
    intents,
    billing,
    error,
    isLoading,
    showBanner,
    isUnauthorized,
    mutate,
  };
}


