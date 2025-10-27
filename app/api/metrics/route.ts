import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type WindowKey = '24h' | '7d' | '30d';

const WINDOW_MS: Record<WindowKey, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const VALID_WINDOWS = new Set<WindowKey>(['24h', '7d', '30d']);

function resolveWindow(value: string | null): WindowKey {
  const lower = (value ?? '').toLowerCase() as WindowKey;
  return VALID_WINDOWS.has(lower) ? lower : '7d';
}

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function calcDelta(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return current > 0 ? 1 : 0;
  return (current - previous) / previous;
}

function safeStatus(row: any): string {
  const gate = (row?.gate_log ?? {}) as Record<string, any>;
  return String(row?.delivery_status ?? row?.status ?? gate?.status ?? '').toLowerCase();
}

function safeCategory(row: any): string {
  const gate = (row?.gate_log ?? {}) as Record<string, any>;
  return String(gate?.category ?? '').toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const windowKey = resolveWindow(url.searchParams.get('window'));
    const now = new Date();
    const endIso = now.toISOString();
    const start = new Date(now.getTime() - WINDOW_MS[windowKey]);
    const startIso = start.toISOString();
    const prevEndIso = startIso;
    const prevStartIso = new Date(start.getTime() - WINDOW_MS[windowKey]).toISOString();

    const accountId = await requireAccountAccess();
    if (!accountId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const [outs, ins, leads, prevOuts, prevIns, prevLeads, remindersRes, pausedRes] = await Promise.all([
      db
        .from('messages_out')
        .select('created_at, gate_log, to_phone, delivery_status, status')
        .eq('account_id', accountId)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: true })
        .limit(10000),
      db
        .from('messages_in')
        .select('created_at, from_phone')
        .eq('account_id', accountId)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: true })
        .limit(10000),
      db
        .from('leads')
        .select('created_at')
        .eq('account_id', accountId)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: true })
        .limit(10000),
      db
        .from('messages_out')
        .select('created_at, gate_log, to_phone, delivery_status, status')
        .eq('account_id', accountId)
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso)
        .order('created_at', { ascending: true })
        .limit(10000),
      db
        .from('messages_in')
        .select('created_at, from_phone')
        .eq('account_id', accountId)
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso)
        .order('created_at', { ascending: true })
        .limit(10000),
      db
        .from('leads')
        .select('created_at')
        .eq('account_id', accountId)
        .gte('created_at', prevStartIso)
        .lt('created_at', prevEndIso)
        .order('created_at', { ascending: true })
        .limit(10000),
      db
        .from('messages_out')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .contains('gate_log', { category: 'reminder' }),
      db
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', accountId)
        .gt('reminder_pause_until', endIso),
    ]);

    if (outs.error || ins.error || leads.error || prevOuts.error || prevIns.error || prevLeads.error || remindersRes.error || pausedRes.error) {
      console.error('[metrics] query errors', outs.error, ins.error, leads.error, prevOuts.error, prevIns.error, prevLeads.error, remindersRes.error, pausedRes.error);
      return NextResponse.json({ ok: false, error: 'metrics_failed' }, { status: 500 });
    }

    const outsData = outs.data ?? [];
    const insData = ins.data ?? [];
    const leadsData = leads.data ?? [];
    const prevOutsData = prevOuts.data ?? [];
    const prevInsData = prevIns.data ?? [];
    const prevLeadsData = prevLeads.data ?? [];

    const messagesSent = outsData.length;
    const deliveredCount = outsData.filter((row) => safeStatus(row) === 'delivered').length;
    const failedCount = outsData.filter((row) => {
      const status = safeStatus(row);
      return status === 'failed' || status === 'undelivered';
    }).length;
    const repliesCount = insData.length;
    const deliveredRate = messagesSent > 0 ? deliveredCount / messagesSent : 0;

    const contactedSet = new Set<string>();
    const deliveredSet = new Set<string>();
    const remindersInWindow = remindersRes.count ?? outsData.filter((row) => safeCategory(row) === 'reminder').length;

    const deliveryMap = new Map<string, { sent: number; delivered: number; failed: number; inbound: number }>();

    const ensureDay = (date: string) => {
      if (!deliveryMap.has(date)) {
        deliveryMap.set(date, { sent: 0, delivered: 0, failed: 0, inbound: 0 });
      }
      return deliveryMap.get(date)!;
    };

    outsData.forEach((row) => {
      const date = dayKey(row.created_at);
      const bucket = ensureDay(date);
      bucket.sent += 1;
      const status = safeStatus(row);
      if (status === 'delivered') {
        bucket.delivered += 1;
        if (row.to_phone) deliveredSet.add(row.to_phone);
      }
      if (status === 'failed' || status === 'undelivered') {
        bucket.failed += 1;
      }
      if (row.to_phone) contactedSet.add(row.to_phone);
    });

    const repliesMap = new Map<string, number>();
    const repliedSet = new Set<string>();
    insData.forEach((row) => {
      const date = dayKey(row.created_at);
      repliesMap.set(date, (repliesMap.get(date) ?? 0) + 1);
      ensureDay(date).inbound += 1;
      if (row.from_phone) repliedSet.add(row.from_phone);
    });

    const deliveryOverTime = Array.from(deliveryMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, counts]) => ({ date, ...counts }));

    const repliesPerDay = Array.from(repliesMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, replies]) => ({ date, replies }));

    const seriesOut = deliveryOverTime.map(({ date, sent }) => ({ date, count: sent }));
    const seriesIn = repliesPerDay.map(({ date, replies }) => ({ date, count: replies }));

    const prevMessagesSent = prevOutsData.length;
    const prevDeliveredCount = prevOutsData.filter((row) => safeStatus(row) === 'delivered').length;
    const prevDeliveredRate = prevMessagesSent > 0 ? prevDeliveredCount / prevMessagesSent : 0;
    const prevReplies = prevInsData.length;
    const prevLeads = prevLeadsData.length;

    const leadsCurrent = leadsData.length;
    const deltaLeads = calcDelta(leadsCurrent, prevLeads);
    const deltaSent = calcDelta(messagesSent, prevMessagesSent);
    const deltaDeliveredRate = calcDelta(deliveredRate, prevDeliveredRate);
    const deltaReplies = calcDelta(repliesCount, prevReplies);

    const funnel = {
      leads: leadsData.length,
      contacted: contactedSet.size,
      delivered: deliveredSet.size,
      replied: repliedSet.size,
    };

    const pausedTotal = pausedRes.count ?? 0;

    return NextResponse.json(
      {
        ok: true,
        window: windowKey,
        out24: messagesSent,
        in24: repliesCount,
        reminders24: remindersInWindow,
        paused: pausedTotal,
        newLeads24: leadsData.length,
        deliveredPct24: Math.round(deliveredRate * 100),
        series: {
          out: seriesOut,
          in: seriesIn,
        },
       kpis: {
          leadsNew: leadsCurrent,
          sent: messagesSent,
          delivered: deliveredCount,
          deliveredRate,
          replies: repliesCount,
          deltas: {
            leadsNew: deltaLeads,
            sent: deltaSent,
            deliveredRate: deltaDeliveredRate,
            replies: deltaReplies,
          },
        },
        charts: {
          deliveryOverTime,
          repliesPerDay,
        },
        funnel,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    console.error('[metrics] unexpected error', error);
    return NextResponse.json({ ok: false, error: 'metrics_failed' }, { status: 500 });
  }
}
