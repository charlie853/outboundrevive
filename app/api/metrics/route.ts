export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE = process.env.SUPABASE_URL!;

function sinceISO(range: string) {
  const now = Date.now();
  const ms =
    range === '24h' ? 24 * 3600e3 :
    range === '30d' ? 30 * 24 * 3600e3 :
    7 * 24 * 3600e3; // default 7d
  return new Date(now - ms).toISOString();
}

function encDate(iso: string) { return encodeURIComponent(iso); }

async function count(table: string, qs: string, signal: AbortSignal) {
  const url = `${BASE}/rest/v1/${table}?select=id&limit=1${qs ? `&${qs}` : ''}`;
  const r = await fetch(url, {
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      Prefer: 'count=exact'
    },
    cache: 'no-store',
    signal
  });
  const cr = r.headers.get('content-range') || '0-0/0';
  const total = parseInt(cr.split('/').pop() || '0', 10) || 0;
  return total;
}

export async function GET(req: Request) {
  if (!SRK || !BASE) return Response.json({ ok: false, error: 'Missing SUPABASE env' }, { status: 500 });

  const url = new URL(req.url);
  const range = url.searchParams.get('range') || '7d';
  const since = sinceISO(range);
  const encSince = encDate(since);

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 5000);

  try {
    console.log('METRICS_START', { range, since });
    // KPIs (using leads columns you already have)
    const sent = await count('leads', `last_sent_at=gte.${encSince}`, ctrl.signal);
    const delivered = await count('leads', `last_sent_at=gte.${encSince}&delivery_status=eq.delivered`, ctrl.signal);
    const replies = await count('leads', `last_reply_at=gte.${encSince}`, ctrl.signal);
    const newLeads = await count('leads', `created_at=gte.${encSince}`, ctrl.signal);
    const deliveredPct = sent > 0 ? Math.round((delivered * 1000) / sent) / 10 : 0;

    // Minimal charts: single bucket so your UI renders something
    const deliveryOverTime = [{
      date: since.slice(0, 10),
      sent,
      delivered,
      failed: Math.max(sent - delivered, 0)
    }];
    const repliesPerDay = [{
      date: since.slice(0, 10),
      replies
    }];

    return Response.json({
      ok: true,
      kpis: {
        newLeads,
        messagesSent: sent,
        deliveredPct,
        replies
      },
      charts: {
        deliveryOverTime,
        repliesPerDay
      }
    });
  } catch (e: any) {
    console.error('METRICS_ERR', e?.message || e);
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  } finally {
    console.log('METRICS_DONE', { range, since });
    clearTimeout(timeout);
  }
}
