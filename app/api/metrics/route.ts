import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

type WindowKey = '24h' | '7d' | '30d';

const WINDOW_MS: Record<WindowKey, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const clampRange = (raw: string | null): WindowKey => {
  const normalized = (raw ?? '').toLowerCase();
  if (normalized === '24h') return '24h';
  if (normalized === '30d') return '30d';
  return '7d';
};

const statusOf = (row: any) => {
  const gate = row?.gate_log ?? {};
  return String(row?.delivery_status ?? row?.status ?? gate.status ?? '').toLowerCase();
};

const calcDeltaPct = (current: number, previous: number) => {
  if (!Number.isFinite(previous) || previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

export async function GET(req: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: 'missing Supabase env' },
        { status: 500, headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
      );
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
      },
    });

    const { searchParams } = new URL(req.url);
    if (searchParams.get('ping') === '1') {
      console.log('METRICS_PING');
      return NextResponse.json({ ok: true, pong: true });
    }

    const rangeKey = clampRange(searchParams.get('range'));
    const windowMs = WINDOW_MS[rangeKey];

    const now = new Date();
    const from = new Date(now.getTime() - windowMs);
    const prevFrom = new Date(from.getTime() - windowMs);

    const nowIso = now.toISOString();
    const fromIso = from.toISOString();
    const prevFromIso = prevFrom.toISOString();
    const prevToIso = fromIso;

    console.log('METRICS_START', { range: rangeKey });

    const [sentCurRes, sentPrevRes, deliveredCurRes, deliveredPrevRes, repliesCurRes, repliesPrevRes, leadsCurRes, leadsPrevRes] = await Promise.all([
      supabase
        .from('messages_out')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', fromIso)
        .lt('created_at', nowIso),
      supabase
        .from('messages_out')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', prevFromIso)
        .lt('created_at', prevToIso),
      supabase
        .from('messages_out')
        .select('id', { count: 'exact', head: true })
        .or('delivery_status.eq.delivered,status.eq.delivered')
        .gte('created_at', fromIso)
        .lt('created_at', nowIso),
      supabase
        .from('messages_out')
        .select('id', { count: 'exact', head: true })
        .or('delivery_status.eq.delivered,status.eq.delivered')
        .gte('created_at', prevFromIso)
        .lt('created_at', prevToIso),
      supabase
        .from('messages_in')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', fromIso)
        .lt('created_at', nowIso),
      supabase
        .from('messages_in')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', prevFromIso)
        .lt('created_at', prevToIso),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', fromIso)
        .lt('created_at', nowIso),
      supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', prevFromIso)
        .lt('created_at', prevToIso),
    ]);

    const errors = [
      sentCurRes.error,
      sentPrevRes.error,
      deliveredCurRes.error,
      deliveredPrevRes.error,
      repliesCurRes.error,
      repliesPrevRes.error,
      leadsCurRes.error,
      leadsPrevRes.error,
    ].filter(Boolean);

    if (errors.length) throw errors[0];

    const sentCurrent = sentCurRes.count ?? 0;
    const sentPrevious = sentPrevRes.count ?? 0;
    const deliveredCurrent = deliveredCurRes.count ?? 0;
    const deliveredPrevious = deliveredPrevRes.count ?? 0;
    const repliesCurrent = repliesCurRes.count ?? 0;
    const repliesPrevious = repliesPrevRes.count ?? 0;
    const leadsCurrent = leadsCurRes.count ?? 0;
    const leadsPrevious = leadsPrevRes.count ?? 0;

    const deliveredPctCurrent = sentCurrent > 0 ? (deliveredCurrent / sentCurrent) * 100 : 0;
    const deliveredPctPrevious = sentPrevious > 0 ? (deliveredPrevious / sentPrevious) * 100 : 0;

    const [messagesOutRes, messagesInRes] = await Promise.all([
      supabase
        .from('messages_out')
        .select('created_at, delivery_status, status, gate_log')
        .gte('created_at', fromIso)
        .lt('created_at', nowIso)
        .order('created_at', { ascending: true })
        .limit(5000),
      supabase
        .from('messages_in')
        .select('created_at')
        .gte('created_at', fromIso)
        .lt('created_at', nowIso)
        .order('created_at', { ascending: true })
        .limit(5000),
    ]);

    if (messagesOutRes.error) throw messagesOutRes.error;
    if (messagesInRes.error) throw messagesInRes.error;

    const deliveryMap = new Map<string, { sent: number; delivered: number; failed: number }>();
    (messagesOutRes.data ?? []).forEach((row) => {
      const date = row.created_at.slice(0, 10);
      const bucket = deliveryMap.get(date) ?? { sent: 0, delivered: 0, failed: 0 };
      bucket.sent += 1;
      const status = statusOf(row);
      if (status === 'delivered') bucket.delivered += 1;
      if (status === 'failed' || status === 'undelivered') bucket.failed += 1;
      deliveryMap.set(date, bucket);
    });

    let deliveryOverTime = Array.from(deliveryMap.entries())
      .map(([date, bucket]) => ({ date, ...bucket }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (deliveryOverTime.length === 0) {
      deliveryOverTime = [{ date: fromIso.slice(0, 10), sent: 0, delivered: 0, failed: 0 }];
    }

    const repliesMap = new Map<string, number>();
    (messagesInRes.data ?? []).forEach((row) => {
      const date = row.created_at.slice(0, 10);
      repliesMap.set(date, (repliesMap.get(date) ?? 0) + 1);
    });

    let repliesPerDay = Array.from(repliesMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (repliesPerDay.length === 0) {
      repliesPerDay = [{ date: fromIso.slice(0, 10), count: 0 }];
    }

    console.log('METRICS_DONE', {
      range: rangeKey,
      sent: sentCurrent,
      replies: repliesCurrent,
      leads: leadsCurrent,
      deliveredPct: deliveredPctCurrent,
    });

    return NextResponse.json(
      {
        ok: true,
        kpis: {
          newLeads: {
            value: leadsCurrent,
            deltaPct: calcDeltaPct(leadsCurrent, leadsPrevious),
          },
          messagesSent: {
            value: sentCurrent,
            deltaPct: calcDeltaPct(sentCurrent, sentPrevious),
          },
          deliveredPct: {
            value: deliveredPctCurrent,
            deltaPct: calcDeltaPct(deliveredPctCurrent, deliveredPctPrevious),
          },
          replies: {
            value: repliesCurrent,
            deltaPct: calcDeltaPct(repliesCurrent, repliesPrevious),
          },
        },
        charts: {
          deliveryOverTime,
          repliesPerDay,
        },
      },
      {
        headers: {
          'cache-control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (error) {
    console.error('METRICS_ERR', error);
    const message = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json(
      { ok: false, error: message },
      {
        status: 500,
        headers: {
          'cache-control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
