import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';

export const runtime = 'nodejs';

type DayPoint = { d: string; sent: number; delivered: number; failed: number; inbound: number };

function parseRangeParam(v?: string | null): 7 | 30 | 90 {
  const s = String(v || '7d').toLowerCase();
  if (s.startsWith('90')) return 90;
  if (s.startsWith('30')) return 30;
  return 7;
}

function dayKey(iso: string) {
  return iso.slice(0, 10);
}

function dateAddDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function buildDaysArray(start: Date, days: number): string[] {
  const arr: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = dateAddDays(start, i).toISOString().slice(0, 10);
    arr.push(d);
  }
  return arr;
}

function pctDelta(cur: number, prev: number) {
  if (!isFinite(prev) || prev === 0) return cur > 0 ? 1 : 0;
  return (cur - prev) / prev;
}

export async function GET(req: NextRequest) {
  try {
    // Determine time window
    const url = new URL(req.url);
    const rangeDays = parseRangeParam(url.searchParams.get('range'));
    const now = new Date();
    const start = new Date(now.getTime() - rangeDays * 24 * 3600 * 1000);
    const prevStart = new Date(start.getTime() - rangeDays * 24 * 3600 * 1000);
    const startISO = start.toISOString();
    const endISO = now.toISOString();
    const prevStartISO = prevStart.toISOString();
    const prevEndISO = start.toISOString();

    const accountId = await requireAccountAccess();
    if (!accountId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Fetch minimal columns and aggregate in API (keeps UI thin)
    const [outs, dev, ins, leads] = await Promise.all([
      db.from('messages_out').select('created_at').eq('account_id', accountId).gte('created_at', startISO).lt('created_at', endISO),
      db.from('deliverability_events').select('created_at,type').eq('account_id', accountId).gte('created_at', startISO).lt('created_at', endISO),
      db.from('messages_in').select('created_at,lead_id').eq('account_id', accountId).gte('created_at', startISO).lt('created_at', endISO),
      db.from('leads').select('created_at').eq('account_id', accountId).gte('created_at', startISO).lt('created_at', endISO)
    ]);

    const [outsPrev, devPrev, insPrev, leadsPrev] = await Promise.all([
      db.from('messages_out').select('created_at').eq('account_id', accountId).gte('created_at', prevStartISO).lt('created_at', prevEndISO),
      db.from('deliverability_events').select('created_at,type').eq('account_id', accountId).gte('created_at', prevStartISO).lt('created_at', prevEndISO),
      db.from('messages_in').select('created_at,lead_id').eq('account_id', accountId).gte('created_at', prevStartISO).lt('created_at', prevEndISO),
      db.from('leads').select('created_at').eq('account_id', accountId).gte('created_at', prevStartISO).lt('created_at', prevEndISO)
    ]);

    const daysKeys = buildDaysArray(new Date(startISO), rangeDays);
    const dayMap: Record<string, DayPoint> = Object.fromEntries(daysKeys.map(d => [d, { d, sent: 0, delivered: 0, failed: 0, inbound: 0 }]));

    (outs.data || []).forEach(r => { const k = dayKey(r.created_at as string); if (dayMap[k]) dayMap[k].sent++; });
    (dev.data || []).forEach((r: any) => { const k = dayKey(r.created_at as string); const t = String(r.type || '').toLowerCase(); if (!dayMap[k]) return; if (t === 'delivered') dayMap[k].delivered++; else if (t === 'failed') dayMap[k].failed++; });
    (ins.data || []).forEach(r => { const k = dayKey(r.created_at as string); if (dayMap[k]) dayMap[k].inbound++; });

    const days: DayPoint[] = daysKeys.map(k => dayMap[k]);

    // KPIs
    const sent = (outs.data || []).length;
    const delivered = (dev.data || []).filter((r: any) => String(r.type).toLowerCase() === 'delivered').length;
    const repliesUnique = new Set((ins.data || []).map((r: any) => r.lead_id)).size;
    const newLeads = (leads.data || []).length;
    const deliveredRate = sent > 0 ? delivered / sent : 0;

    const sentPrev = (outsPrev.data || []).length;
    const deliveredPrev = (devPrev.data || []).filter((r: any) => String(r.type).toLowerCase() === 'delivered').length;
    const ratePrev = sentPrev > 0 ? deliveredPrev / sentPrev : 0;
    const repliesPrev = new Set((insPrev.data || []).map((r: any) => r.lead_id)).size;
    const newLeadsPrev = (leadsPrev.data || []).length;

    const kpis = {
      leadsNew: newLeads,
      sent,
      delivered,
      deliveredRate,
      replies: repliesUnique,
      deltas: {
        leadsNew: pctDelta(newLeads, newLeadsPrev),
        sent: pctDelta(sent, sentPrev),
        deliveredRate: pctDelta(deliveredRate, ratePrev),
        replies: pctDelta(repliesUnique, repliesPrev)
      }
    };

    const funnel = {
      leads: newLeads,
      sent,
      delivered,
      replied: repliesUnique
    };

    return NextResponse.json({ range: `${rangeDays}d`, days, kpis, funnel });
  } catch (e: any) {
    console.error('[METRICS] rollup error:', e?.message || e);
    return NextResponse.json({ error: 'metrics error' }, { status: 500 });
  }
}
