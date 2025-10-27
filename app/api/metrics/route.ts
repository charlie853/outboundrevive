import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const WINDOW_MS: Record<'24h' | '7d' | '30d', number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const clampRange = (range: string | null): '24h' | '7d' | '30d' => {
  const normalized = (range ?? '').toLowerCase();
  if (normalized === '24h') return '24h';
  if (normalized === '30d') return '30d';
  return '7d';
};

const toIso = (date: Date) => date.toISOString();

const statusOf = (row: any) => {
  if (!row) return '';
  const gate = row.gate_log ?? {};
  const status = row.delivery_status ?? row.status ?? gate.status ?? '';
  return String(status).toLowerCase();
};

const categoryOf = (row: any) => {
  if (!row) return '';
  const gate = row.gate_log ?? {};
  return String(gate.category ?? '').toLowerCase();
};

const deltaPct = (current: number, previous: number) => {
  if (!Number.isFinite(previous) || previous === 0) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
};

export async function GET(req: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    },
  });

  try {
    const { searchParams } = new URL(req.url);
    const rangeKey = clampRange(searchParams.get('range'));

    const now = new Date();
    const windowMs = WINDOW_MS[rangeKey];
    const start = new Date(now.getTime() - windowMs);
    const prevStart = new Date(start.getTime() - windowMs);

    const nowIso = toIso(now);
    const startIso = toIso(start);
    const prevStartIso = toIso(prevStart);
    const prevEndIso = startIso;

    console.log('METRICS_START', { range: rangeKey });

    const [messagesCurrent, messagesPrev, repliesCurrent, repliesPrev, leadsCurrentRows, leadsPrevRows] = await Promise.all([
      supabase
        .from('messages_out')
        .select('created_at, gate_log, delivery_status, status', { count: 'exact' })
        .gte('created_at', startIso)
        .lt('created_at', nowIso)
        .limit(5000),
      supabase
        .from('messages_out')
        .select('created_at, gate_log, delivery_status, status', { count: 'exact' })
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso)
        .limit(5000),
      supabase
        .from('messages_in')
        .select('created_at', { count: 'exact' })
        .gte('created_at', startIso)
        .lt('created_at', nowIso)
        .limit(5000),
      supabase
        .from('messages_in')
        .select('created_at', { count: 'exact' })
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso)
        .limit(5000),
      supabase
        .from('leads')
        .select('created_at')
        .gte('created_at', startIso)
        .lt('created_at', nowIso)
        .limit(1000),
      supabase
        .from('leads')
        .select('created_at')
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso)
        .limit(1000),
    ]);

    const errors = [
      messagesCurrent.error,
      messagesPrev.error,
      repliesCurrent.error,
      repliesPrev.error,
      leadsCurrentRows.error,
      leadsPrevRows.error,
    ].filter(Boolean);

    if (errors.length) {
      throw errors[0];
    }

    const currentOutRows = messagesCurrent.data ?? [];
    const prevOutRows = messagesPrev.data ?? [];
    const currentInRows = repliesCurrent.data ?? [];
    const prevInRows = repliesPrev.data ?? [];
    const currentLeadRows = leadsCurrentRows.data ?? [];
    const prevLeadRows = leadsPrevRows.data ?? [];

    const messagesSentCurrent = currentOutRows.length;
    const messagesSentPrev = prevOutRows.length;

    const repliesCountCurrent = currentInRows.length;
    const repliesCountPrev = prevInRows.length;

    const leadsCountCurrent = currentLeadRows.length;
    const leadsCountPrev = prevLeadRows.length;

    const deliveredCurrent = currentOutRows.filter((row) => statusOf(row) === 'delivered').length;
    const deliveredPrev = prevOutRows.filter((row) => statusOf(row) === 'delivered').length;

    const remindersCurrent = currentOutRows.filter((row) => categoryOf(row) === 'reminder').length;

    const deliveredRateCurrent = messagesSentCurrent > 0 ? deliveredCurrent / messagesSentCurrent : 0;
    const deliveredRatePrev = messagesSentPrev > 0 ? deliveredPrev / messagesSentPrev : 0;

    const deliveryBuckets = new Map<string, { sent: number; delivered: number; failed: number }>();
    const repliesBuckets = new Map<string, number>();

    currentOutRows.forEach((row) => {
      const day = row.created_at.slice(0, 10);
      const bucket = deliveryBuckets.get(day) ?? { sent: 0, delivered: 0, failed: 0 };
      bucket.sent += 1;
      const status = statusOf(row);
      if (status === 'delivered') bucket.delivered += 1;
      if (status === 'failed' || status === 'undelivered') bucket.failed += 1;
      deliveryBuckets.set(day, bucket);
    });

    currentInRows.forEach((row) => {
      const day = row.created_at.slice(0, 10);
      repliesBuckets.set(day, (repliesBuckets.get(day) ?? 0) + 1);
    });

    const deliveryOverTime = Array.from(deliveryBuckets.entries())
      .map(([date, bucket]) => ({ date, ...bucket }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const repliesPerDay = Array.from(repliesBuckets.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const response = {
      ok: true,
      range: rangeKey,
      out24: messagesSentCurrent,
      in24: repliesCountCurrent,
      reminders24: remindersCurrent,
      paused: 0,
      kpis: {
        leadsCurrent: leadsCountCurrent,
        leadsPrevious: leadsCountPrev,
        deltaLeadsPct: deltaPct(leadsCountCurrent, leadsCountPrev),
        messagesSentCurrent,
        messagesSentPrevious: messagesSentPrev,
        deltaMessagesSentPct: deltaPct(messagesSentCurrent, messagesSentPrev),
        deliveredRateCurrent,
        deliveredRatePrevious: deliveredRatePrev,
        deltaDeliveredRatePct: deltaPct(deliveredRateCurrent, deliveredRatePrev),
        repliesCurrent: repliesCountCurrent,
        repliesPrevious: repliesCountPrev,
        deltaRepliesPct: deltaPct(repliesCountCurrent, repliesCountPrev),
      },
      charts: {
        deliveryOverTime,
        repliesPerDay,
      },
      series: {
        out: deliveryOverTime.map((row) => ({ date: row.date, count: row.sent })),
        in: repliesPerDay.map((row) => ({ date: row.date, count: row.count })),
      },
      funnel: {
        leads: leadsCountCurrent,
        contacted: messagesSentCurrent,
        delivered: deliveredCurrent,
        replied: repliesCountCurrent,
      },
    };

    console.log('METRICS_DONE', {
      range: rangeKey,
      out24: messagesSentCurrent,
      in24: repliesCountCurrent,
      reminders24: remindersCurrent,
    });

    return NextResponse.json(response, {
      headers: {
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error('[metrics] error', error);
    const message = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json({ ok: false, error: message }, {
      status: 500,
      headers: {
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}
