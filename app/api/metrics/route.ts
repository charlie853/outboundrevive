import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout:${label}`)), ms),
    ),
  ]);
};

const calcDeltaPct = (current: number, previous: number) => {
  if (!Number.isFinite(previous) || previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

const statusOf = (row: any) => {
  const gate = row?.gate_log ?? {};
  return String(row?.delivery_status ?? row?.status ?? gate.status ?? '').toLowerCase();
};

const bucketDays = (start: Date, end: Date) => {
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
};

const ensureSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
};

export async function GET(req: Request) {
  const controller = new AbortController();
  const totalTimeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        global: {
          fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
        },
      },
    );

    const { searchParams } = new URL(req.url);
    if (searchParams.get('ping') === '1') {
      console.log('METRICS_PING');
      return NextResponse.json({ ok: true, pong: true });
    }

    const rangeKey = clampRange(searchParams.get('range'));
    const windowMs = WINDOW_MS[rangeKey];

    const now = new Date();
    const start = new Date(now.getTime() - windowMs);
    const prevStart = new Date(start.getTime() - windowMs);

    const nowIso = now.toISOString();
    const startIso = start.toISOString();
    const prevStartIso = prevStart.toISOString();

    console.log('METRICS_START', { range: rangeKey });

    const countInRange = async (client: SupabaseClient, table: string, filters: (query: any) => any) => {
      const query = filters(client.from(table).select('id', { head: true, count: 'exact' }));
      const result = await withTimeout(query, 9_000, `${table}-count`);
      if (result.error) throw result.error;
      return result.count ?? 0;
    };

    const sentCurrent = await countInRange(supabase, 'messages_out', (q) =>
      q.gte('created_at', startIso).lt('created_at', nowIso),
    );
    const sentPrev = await countInRange(supabase, 'messages_out', (q) =>
      q.gte('created_at', prevStartIso).lt('created_at', startIso),
    );

    const deliveredCurrent = await countInRange(supabase, 'messages_out', (q) =>
      q.or('delivery_status.eq.delivered,status.eq.delivered')
        .gte('created_at', startIso)
        .lt('created_at', nowIso),
    );
    const deliveredPrev = await countInRange(supabase, 'messages_out', (q) =>
      q.or('delivery_status.eq.delivered,status.eq.delivered')
        .gte('created_at', prevStartIso)
        .lt('created_at', startIso),
    );

    const repliesCurrent = await countInRange(supabase, 'messages_in', (q) =>
      q.gte('created_at', startIso).lt('created_at', nowIso),
    );
    const repliesPrev = await countInRange(supabase, 'messages_in', (q) =>
      q.gte('created_at', prevStartIso).lt('created_at', startIso),
    );

    const leadsCurrent = await countInRange(supabase, 'leads', (q) =>
      q.gte('created_at', startIso).lt('created_at', nowIso),
    );
    const leadsPrev = await countInRange(supabase, 'leads', (q) =>
      q.gte('created_at', prevStartIso).lt('created_at', startIso),
    );

    const deliveredPctCurrent = sentCurrent > 0 ? (deliveredCurrent / sentCurrent) * 100 : 0;
    const deliveredPctPrev = sentPrev > 0 ? (deliveredPrev / sentPrev) * 100 : 0;

    const [messagesOutRes, messagesInRes] = await Promise.all([
      withTimeout(
        supabase
          .from('messages_out')
          .select('created_at, delivery_status, status, gate_log')
          .gte('created_at', startIso)
          .lt('created_at', nowIso)
          .order('created_at', { ascending: true })
          .limit(5000),
        9_000,
        'messages_out-series',
      ),
      withTimeout(
        supabase
          .from('messages_in')
          .select('created_at')
          .gte('created_at', startIso)
          .lt('created_at', nowIso)
          .order('created_at', { ascending: true })
          .limit(5000),
        9_000,
        'messages_in-series',
      ),
    ]);

    if (messagesOutRes.error) throw messagesOutRes.error;
    if (messagesInRes.error) throw messagesInRes.error;

    const deliveryBuckets = new Map<string, { sent: number; delivered: number; failed: number }>();
    (messagesOutRes.data ?? []).forEach((row) => {
      const day = row.created_at.slice(0, 10);
      const bucket = deliveryBuckets.get(day) ?? { sent: 0, delivered: 0, failed: 0 };
      bucket.sent += 1;
      const status = statusOf(row);
      if (status === 'delivered') bucket.delivered += 1;
      if (status === 'failed' || status === 'undelivered') bucket.failed += 1;
      deliveryBuckets.set(day, bucket);
    });

    const repliesBuckets = new Map<string, number>();
    (messagesInRes.data ?? []).forEach((row) => {
      const day = row.created_at.slice(0, 10);
      repliesBuckets.set(day, (repliesBuckets.get(day) ?? 0) + 1);
    });

    const dayList = bucketDays(start, now);

    const deliveryOverTime = dayList.map((day) => ({
      date: day,
      sent: deliveryBuckets.get(day)?.sent ?? 0,
      delivered: deliveryBuckets.get(day)?.delivered ?? 0,
      failed: deliveryBuckets.get(day)?.failed ?? 0,
    }));

    const repliesPerDay = dayList.map((day) => ({
      date: day,
      count: repliesBuckets.get(day) ?? 0,
    }));

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
          newLeads: { value: leadsCurrent, deltaPct: calcDeltaPct(leadsCurrent, leadsPrev) },
          messagesSent: { value: sentCurrent, deltaPct: calcDeltaPct(sentCurrent, sentPrev) },
          deliveredPct: { value: deliveredPctCurrent, deltaPct: calcDeltaPct(deliveredPctCurrent, deliveredPctPrev) },
          replies: { value: repliesCurrent, deltaPct: calcDeltaPct(repliesCurrent, repliesPrev) },
        },
        charts: {
          deliveryOverTime,
          repliesPerDay,
        },
      },
      { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    console.error('METRICS_ERR', error);
    const message = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json(
      { ok: false, error: message },
      { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
