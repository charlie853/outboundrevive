import { NextResponse } from 'next/server';

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

function toISOStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
  return x.toISOString();
}
function toISOEnd(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
  return x.toISOString();
}
function rangeStart(range: string) {
  const now = new Date();
  const start = new Date(now);
  if (range === '90d') start.setUTCDate(start.getUTCDate() - 90);
  else if (range === '30d') start.setUTCDate(start.getUTCDate() - 30);
  else start.setUTCDate(start.getUTCDate() - 7);
  return { start: toISOStart(start), end: toISOEnd(now) };
}

type MsgOut = { created_at: string; status?: string|null; delivery_status?: string|null; to_phone?: string|null };
type MsgIn  = { created_at: string; from_phone?: string|null };

function dayKey(iso: string) {
  const d = new Date(iso);
  return d.toISOString().slice(0,10);
}

export const revalidate = 0;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || '7d').toLowerCase();
    const { start, end } = rangeStart(range);

    const leadsRes = await fetch(
      `${SB_URL}/rest/v1/leads?select=id&created_at=gte.${start}&created_at=lt.${end}`,
      { headers: { ...H, Prefer: 'count=exact' } }
    );
    const leadsCtr = leadsRes.headers.get('content-range') || '0/0';
    const newLeads = Number(leadsCtr.split('/')[1] || 0);

    const outRes = await fetch(
      `${SB_URL}/rest/v1/messages_out?select=created_at,delivery_status,status,to_phone&created_at=gte.${start}&created_at=lt.${end}&order=created_at.asc`,
      { headers: H }
    );
    const outRows = (await outRes.json()) as MsgOut[];

    const inRes = await fetch(
      `${SB_URL}/rest/v1/messages_in?select=created_at,from_phone&created_at=gte.${start}&created_at=lt.${end}&order=created_at.asc`,
      { headers: H }
    );
    const inRows = (await inRes.json()) as MsgIn[];

    const messagesSent = outRows.length;
    const deliveredCount = outRows.filter(r => (r.delivery_status ?? r.status)?.toLowerCase() === 'delivered').length;
    const failedCount = outRows.filter(r => {
      const s = (r.delivery_status ?? r.status)?.toLowerCase();
      return s === 'failed' || s === 'undelivered';
    }).length;
    const replies = inRows.length;
    const deliveredPct = messagesSent ? Math.round((deliveredCount / messagesSent) * 100) : 0;

    const tsMap: Record<string, { sent: number; delivered: number; failed: number }> = {};
    for (const r of outRows) {
      const k = dayKey(r.created_at);
      if (!tsMap[k]) tsMap[k] = { sent: 0, delivered: 0, failed: 0 };
      tsMap[k].sent += 1;
      const s = (r.delivery_status ?? r.status)?.toLowerCase();
      if (s === 'delivered') tsMap[k].delivered += 1;
      if (s === 'failed' || s === 'undelivered') tsMap[k].failed += 1;
    }
    const deliveryOverTime = Object.keys(tsMap).sort().map(k => ({
      date: k,
      sent: tsMap[k].sent,
      delivered: tsMap[k].delivered,
      failed: tsMap[k].failed,
    }));

    const rpMap: Record<string, number> = {};
    for (const r of inRows) {
      const k = dayKey(r.created_at);
      rpMap[k] = (rpMap[k] || 0) + 1;
    }
    const repliesPerDay = Object.keys(rpMap).sort().map(k => ({ date: k, replies: rpMap[k] }));

    const contacted = new Set(outRows.map(r => r.to_phone).filter(Boolean)).size;
    const deliveredLeads = new Set(
      outRows.filter(r => (r.delivery_status ?? r.status)?.toLowerCase() === 'delivered')
             .map(r => r.to_phone).filter(Boolean)
    ).size;
    const repliedLeads = new Set(inRows.map(r => r.from_phone).filter(Boolean)).size;

    return NextResponse.json({
      ok: true,
      range,
      kpis: {
        newLeads,
        messagesSent,
        deliveredPct,
        replies
      },
      charts: {
        deliveryOverTime,
        repliesPerDay
      },
      funnel: {
        leads: newLeads,
        contacted,
        delivered: deliveredLeads,
        replied: repliedLeads
      }
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'metrics_failed' }, { status: 500 });
  }
}
