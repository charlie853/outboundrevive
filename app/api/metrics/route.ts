import { NextResponse } from 'next/server';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SURL = process.env.SUPABASE_URL!;
const SRK  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const json = (obj: any, init?: ResponseInit) =>
  new NextResponse(JSON.stringify(obj), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const q = (path: string, init?: RequestInit) =>
  fetch(`${SURL}${path}`, {
    ...init,
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

function isoMinus(days = 0, minutes = 0) {
  const d = new Date(Date.now() - (days*86400000 + minutes*60000));
  return d.toISOString();
}

async function headCount(path: string) {
  const res = await q(path, { method: 'HEAD', headers: { Prefer: 'count=exact' } });
  const cr = res.headers.get('content-range') || res.headers.get('Content-Range');
  if (!cr) return 0;
  const total = Number(cr.split('/').pop());
  return Number.isFinite(total) ? total : 0;
}

async function seriesByDay(table: string, filters: string) {
  const select = encodeURIComponent(`date:date_trunc('day',created_at),count:count()`);
  const url = `/rest/v1/${table}?select=${select}&group=date&order=date.asc${filters}`;
  const res = await q(url);
  if (!res.ok) return [];
  const rows = await res.json();
  return rows.map((r: any) => ({ date: new Date(r.date).toISOString().slice(0,10), count: Number(r.count)||0 }));
}

export async function GET() {
  try {
    const since30d = `&created_at=gte.${isoMinus(30)}`;
    const since24h = `&created_at=gte.${isoMinus(1)}`;

    // Card metrics
    const [out24, in24, reminders24, paused, newLeads24] = await Promise.all([
      headCount(`/rest/v1/messages_out?select=id${since24h}`),
      headCount(`/rest/v1/messages_in?select=id${since24h}`),
      headCount(`/rest/v1/messages_out?select=id&gate_log->>category=eq.reminder${since24h}`),
      headCount(`/rest/v1/leads?select=id&reminder_pause_until=gt.${new Date().toISOString()}`),
      headCount(`/rest/v1/leads?select=id${since24h}`),
    ]);

    // Series
    const sent30      = await seriesByDay('messages_out', since30d);
    const replies30   = await seriesByDay('messages_in',  since30d);
    const delivered30 = await seriesByDay('messages_out', `${since30d}&gate_log->>status=eq.delivered`);
    const failed30    = await seriesByDay('messages_out', `${since30d}&gate_log->>status=eq.failed`);

    // 24h delivery %
    const delivered24 = await headCount(`/rest/v1/messages_out?select=id&gate_log->>status=eq.delivered${since24h}`);
    const failed24    = await headCount(`/rest/v1/messages_out?select=id&gate_log->>status=eq.failed${since24h}`);
    const denom24     = delivered24 + failed24 || out24 || 1;
    const deliveredPct24 = Math.round((delivered24 / denom24) * 100);

    // Funnel 30d
    const [fLeads, fContacted, fDelivered, fReplied] = await Promise.all([
      headCount(`/rest/v1/leads?select=id${since30d}`),
      headCount(`/rest/v1/messages_out?select=id${since30d}`),
      headCount(`/rest/v1/messages_out?select=id&gate_log->>status=eq.delivered${since30d}`),
      headCount(`/rest/v1/messages_in?select=id${since30d}`),
    ]);

    // Return **old keys** (for any old UI) AND **new keys** (for the new dashboard)
    return json({
      ok: true,

      // old shape (your curl currently shows these)
      out24, in24, reminders24, paused,
      series: { out: sent30, in: replies30 },

      // new cards
      newLeads24,
      deliveredPct24,

      // new charts
      charts: {
        deliveryOverTime: {
          sent: sent30,
          delivered: delivered30,
          failed: failed30,
        },
        repliesPerDay: replies30,
      },

      // new funnel
      funnel: {
        leads: fLeads,
        contacted: fContacted,
        delivered: fDelivered,
        replied: fReplied,
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || 'metrics_error' }, { status: 500 });
  }
}
