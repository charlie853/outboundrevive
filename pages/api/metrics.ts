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

  const since = sinceISO(req.query.range);

  // Compute KPIs from actual message tables for accuracy
  // messagesSent = count of messages_out sent since date
  // deliveredPct = messages_out with provider_status=delivered / messagesSent
  // replies = count of messages_in since date
  // newLeads = leads created since date
  // NEW: bookings, contacted, optOuts

  const qsNewLeads = `created_at=gte.${encodeURIComponent(since)}`;
  const qsMessagesSent = `created_at=gte.${encodeURIComponent(since)}`;
  const qsDelivered = `provider_status=eq.delivered&created_at=gte.${encodeURIComponent(since)}`;
  const qsInbound = `created_at=gte.${encodeURIComponent(since)}`;
  const qsBooked = `intent=eq.booked&created_at=gte.${encodeURIComponent(since)}`; // NEW: Messages with "booked" intent
  const qsContacted = `last_outbound_at=gte.${encodeURIComponent(since)}`; // NEW: Leads with at least one outbound
  const qsOptedOut = `opted_out=eq.true&updated_at=gte.${encodeURIComponent(since)}`; // NEW: Leads who opted out in this period

  const [newLeads, messagesSent, deliveredCount, inboundCount, bookedCount, contactedCount, optedOutCount] = await Promise.all([
    count('leads', qsNewLeads),
    count('messages_out', qsMessagesSent),
    count('messages_out', qsDelivered),
    count('messages_in', qsInbound),
    count('messages_out', qsBooked), // NEW
    count('leads', qsContacted), // NEW
    count('leads', qsOptedOut), // NEW
  ]);

  // Replies = inbound message count
  const replies = inboundCount;

  const deliveredPct = messagesSent > 0 ? Math.round((deliveredCount / messagesSent) * 100) : 0;
  const replyRate = deliveredCount > 0 ? Math.round((replies / deliveredCount) * 100) : 0; // NEW
  const optOutRate = contactedCount > 0 ? Math.round((optedOutCount / contactedCount) * 100) : 0; // NEW

  // Full KPI payload
  const payload = {
    ok: true,
    kpis: {
      newLeads,
      messagesSent,
      deliveredPct,
      replies,
      // NEW KPIs
      booked: bookedCount,
      contacted: contactedCount,
      optedOut: optedOutCount,
      replyRate,
      optOutRate,
    },
    charts: {
      deliveryOverTime: [], // keep arrays present for your components
      repliesPerDay: [],
    },
  };

  const nowISO = new Date().toISOString();
  const failed = Math.max(0, messagesSent - deliveredCount);
  payload.charts.deliveryOverTime = [
    {
      date: nowISO,
      delivered: deliveredCount,
      sent: messagesSent,
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
