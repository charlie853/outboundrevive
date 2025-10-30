import type { NextApiRequest, NextApiResponse } from 'next';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function sinceISO(range: string | string[] | undefined) {
  const r = (Array.isArray(range) ? range[0] : range) || '7d';
  const now = Date.now();
  const days = r === '1d' ? 1 : r === '30d' ? 30 : 7;
  return new Date(now - days * 24 * 3600 * 1000).toISOString();
}

async function count(table: string, filterQS: string) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  try {
    const u = `${URL}/rest/v1/${table}?select=id&${filterQS}&limit=1`;
    const res = await fetch(u, {
      signal: ac.signal,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Prefer: 'count=exact',
      },
    });
    if (!res.ok) return 0;
    const cr = res.headers.get('content-range'); // e.g. "0-0/12"
    const total = cr?.split('/')?.[1];
    return total ? parseInt(total, 10) : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Always no-store so UI sees fresh data
  res.setHeader('Cache-Control', 'no-store');

  // Guard env
  if (!URL || !KEY) {
    res.status(500).json({ ok: false, error: 'Supabase env missing' });
    return;
  }

  // Extract account_id from query or use default for backward compat
  const accountId = (Array.isArray(req.query.account_id) ? req.query.account_id[0] : req.query.account_id) || process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';
  const since = sinceISO(req.query.range);

  // Helper: append account_id to query strings
  const withAccount = (qs: string) => `${qs}&account_id=eq.${encodeURIComponent(accountId)}`;

  // Compute KPIs from actual message tables for accuracy
  const qsNewLeads = withAccount(`created_at=gte.${encodeURIComponent(since)}`);
  const qsMessagesSent = withAccount(`created_at=gte.${encodeURIComponent(since)}`);
  const qsDelivered = withAccount(`provider_status=eq.delivered&created_at=gte.${encodeURIComponent(since)}`);
  const qsSent = withAccount(`provider_status=in.(sent,delivered)&created_at=gte.${encodeURIComponent(since)}`);
  const qsInbound = withAccount(`created_at=gte.${encodeURIComponent(since)}`);
  const qsBooked = withAccount(`intent=eq.booked&created_at=gte.${encodeURIComponent(since)}`);
  const qsContacted = withAccount(`last_outbound_at=gte.${encodeURIComponent(since)}`);
  const qsOptedOut = withAccount(`opted_out=eq.true&updated_at=gte.${encodeURIComponent(since)}`);
  const qsSegmentsIn = withAccount(`created_at=gte.${encodeURIComponent(since)}&segments=not.is.null`);
  const qsSegmentsOut = withAccount(`created_at=gte.${encodeURIComponent(since)}&segments=not.is.null`);

  // Replies: unique lead_ids with at least one inbound
  const repliesCount = await fetch(`${URL}/rest/v1/messages_in?select=lead_id&${qsInbound}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' },
    signal: AbortSignal.timeout(5000),
  }).then(async r => {
    if (!r.ok) return 0;
    const data = await r.json().catch(() => []);
    const unique = new Set((data as Array<{ lead_id: string }>).map(x => x.lead_id));
    return unique.size;
  }).catch(() => 0);

  // Segments: sum from both tables
  const [segmentsIn, segmentsOut] = await Promise.all([
    fetch(`${URL}/rest/v1/messages_in?select=segments&${qsSegmentsIn}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(5000),
    }).then(async r => {
      if (!r.ok) return 0;
      const data = await r.json().catch(() => []);
      return (data as Array<{ segments: number }>).reduce((acc, row) => acc + (row.segments || 0), 0);
    }).catch(() => 0),
    fetch(`${URL}/rest/v1/messages_out?select=segments&${qsSegmentsOut}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(5000),
    }).then(async r => {
      if (!r.ok) return 0;
      const data = await r.json().catch(() => []);
      return (data as Array<{ segments: number }>).reduce((acc, row) => acc + (row.segments || 0), 0);
    }).catch(() => 0),
  ]);
  const segmentsTotal = segmentsIn + segmentsOut;

  const [newLeads, messagesSent, deliveredCount, sentCount, bookedCount, contactedCount, optedOutCount] = await Promise.all([
    count('leads', qsNewLeads),
    count('messages_out', qsMessagesSent),
    count('messages_out', qsDelivered),
    count('messages_out', qsSent),
    count('messages_out', qsBooked),
    count('leads', qsContacted),
    count('leads', qsOptedOut),
  ]);

  // Replies = unique leads with at least one inbound
  const replies = repliesCount;

  // Delivered% = delivered / sent (exclude queued)
  const deliveredPct = sentCount > 0 ? Math.round((deliveredCount / sentCount) * 100) : 0;
  const replyRate = deliveredCount > 0 ? Math.round((replies / deliveredCount) * 100) : 0;
  const optOutRate = contactedCount > 0 ? Math.round((optedOutCount / contactedCount) * 100) : 0;

  // Full KPI payload
  const payload = {
    ok: true,
    kpis: {
      newLeads,
      messagesSent,
      deliveredPct,
      replies,
      booked: bookedCount,
      contacted: contactedCount,
      optedOut: optedOutCount,
      replyRate,
      optOutRate,
      segments: segmentsTotal, // NEW: Segments KPI (in+out)
    },
    charts: {
      deliveryOverTime: [],
      repliesPerDay: [],
    },
  };

  const nowISO = new Date().toISOString();
  const failed = Math.max(0, sentCount - deliveredCount);
  payload.charts.deliveryOverTime = [
    {
      date: nowISO,
      delivered: deliveredCount,
      sent: sentCount,
      failed,
    },
  ];
  payload.charts.repliesPerDay = [
    {
      date: nowISO,
      replies,
    },
  ];

  res.status(200).json(payload);
}
