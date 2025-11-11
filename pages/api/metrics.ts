import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// NEW: Support 24h, 7d, 30d (1M), and 'all' ranges
function sinceISO(range: string | string[] | undefined): string | null {
  const r = (Array.isArray(range) ? range[0] : range) || '7d';
  const now = Date.now();
  
  if (r === 'all' || r === 'alltime') {
    return null; // null means no time filter (all time)
  }
  
  // 24h = last 24 hours
  if (r === '24h') {
    return new Date(now - 24 * 3600 * 1000).toISOString();
  }
  
  // 7d = last 7 days
  if (r === '7d') {
    return new Date(now - 7 * 24 * 3600 * 1000).toISOString();
  }
  
  // 30d or 1m = last 30 days (1 month)
  if (r === '30d' || r === '1m') {
    return new Date(now - 30 * 24 * 3600 * 1000).toISOString();
  }
  
  // Legacy: 1d = last 1 day
  if (r === '1d') {
    return new Date(now - 24 * 3600 * 1000).toISOString();
  }
  
  // Default to 7d
  return new Date(now - 7 * 24 * 3600 * 1000).toISOString();
}

// NEW: Get bucket size for time-series (hour for 24h, day for others)
function getBucketSize(range: string | string[] | undefined): 'hour' | 'day' {
  const r = (Array.isArray(range) ? range[0] : range) || '7d';
  return r === '24h' ? 'hour' : 'day';
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
  const bucketSize = getBucketSize(req.query.range);

  // Helper: build query strings with account_id and optional time filter
  const buildQS = (baseFilter: string, timeField = 'created_at') => {
    const parts = [baseFilter, `account_id=eq.${encodeURIComponent(accountId)}`];
    if (since) {
      parts.push(`${timeField}=gte.${encodeURIComponent(since)}`);
    }
    return parts.join('&');
  };

  // Compute KPIs from actual message tables for accuracy
  const qsNewLeads = buildQS('', 'created_at');
  const qsMessagesSent = buildQS('', 'created_at');
  const qsDelivered = buildQS('provider_status=eq.delivered', 'created_at');
  const qsSent = buildQS('provider_status=in.(sent,delivered)', 'created_at');
  const qsInbound = buildQS('', 'created_at');
  const qsBooked = buildQS('intent=eq.booked', 'created_at');
  const qsContacted = buildQS('', 'last_outbound_at');
  const qsOptedOut = buildQS('opted_out=eq.true', 'updated_at');
  const qsSegmentsIn = buildQS('segments=not.is.null', 'created_at');
  const qsSegmentsOut = buildQS('segments=not.is.null', 'created_at');

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

  // Contacted: unique lead_ids with at least one outbound message in range
  // (More accurate than using last_outbound_at which only counts if LAST message was in range)
  const contactedCount = await fetch(`${URL}/rest/v1/messages_out?select=lead_id&${qsMessagesSent}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' },
    signal: AbortSignal.timeout(5000),
  }).then(async r => {
    if (!r.ok) return 0;
    const data = await r.json().catch(() => []);
    const unique = new Set((data as Array<{ lead_id: string }>).map(x => x.lead_id).filter(Boolean));
    return unique.size;
  }).catch(() => 0);

  // Re-engagement: leads that were inactive (no inbound/outbound for 30+ days) and then replied/booked in range
  // We'll count leads who:
  // 1. Had their last activity (inbound or outbound) more than 30 days before the range start
  // 2. Then replied or booked in the current range
  const reEngagedCount = await (async () => {
    if (!since) return 0; // Can't calculate for "all time"
    
    const rangeStart = new Date(since);
    const inactiveThreshold = new Date(rangeStart.getTime() - 30 * 24 * 3600 * 1000).toISOString();
    
    try {
      // Get leads who replied in range
      const repliedInRange = await fetch(`${URL}/rest/v1/messages_in?select=lead_id&${qsInbound}`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
        signal: AbortSignal.timeout(5000),
      }).then(async r => {
        if (!r.ok) return [];
        return await r.json().catch(() => []);
      });
      
      const repliedLeadIds = [...new Set((repliedInRange as Array<{ lead_id: string }>).map(x => x.lead_id).filter(Boolean))];
      if (repliedLeadIds.length === 0) return 0;
      
      // For each lead, check if they were inactive before the range
      const { data: inactiveLeads } = await supabaseAdmin
        .from('leads')
        .select('id')
        .in('id', repliedLeadIds)
        .or(`last_inbound_at.lt.${inactiveThreshold},last_outbound_at.lt.${inactiveThreshold}`)
        .eq('account_id', accountId);
      
      return inactiveLeads?.length || 0;
    } catch (e) {
      console.warn('[metrics] re-engagement calculation failed', e);
      return 0;
    }
  })();

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

  // Appointment metrics: query appointments table for booking lifecycle
  const qsAppointmentsBase = buildQS('', 'created_at');
  const qsAppointmentsBooked = buildQS('status=in.(booked,rescheduled)', 'created_at');
  const qsAppointmentsKept = buildQS('status=eq.kept', 'created_at');
  const qsAppointmentsNoShow = buildQS('status=eq.no_show', 'created_at');

  const [newLeads, messagesSent, deliveredCount, sentCount, bookedCount, optedOutCount, appointmentsBooked, appointmentsKept, appointmentsNoShow] = await Promise.all([
    count('leads', qsNewLeads),
    count('messages_out', qsMessagesSent),
    count('messages_out', qsDelivered),
    count('messages_out', qsSent),
    count('messages_out', qsBooked),
    count('leads', qsOptedOut),
    count('appointments', qsAppointmentsBooked),
    count('appointments', qsAppointmentsKept),
    count('appointments', qsAppointmentsNoShow),
  ]);

  // Replies = unique leads with at least one inbound
  const replies = repliesCount;

  // Delivered% = delivered / sent (exclude queued)
  const deliveredPct = sentCount > 0 ? Math.round((deliveredCount / sentCount) * 100) : 0;
  // Reply Rate = unique replying leads / unique contacted leads (not message count)
  const replyRate = contactedCount > 0 ? Math.round((replies / contactedCount) * 100) : 0;
  const optOutRate = contactedCount > 0 ? Math.round((optedOutCount / contactedCount) * 100) : 0;

  // NEW: Generate time-series chart data (bucketed by hour or day)
  const chartData = await generateTimeSeries(accountId, since, bucketSize, URL, KEY);

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
      segments: segmentsTotal,
      // NEW: Appointment metrics
      appointmentsBooked,
      appointmentsKept,
      appointmentsNoShow,
      // NEW: Re-engagement metrics
      reEngaged: reEngagedCount,
      reEngagementRate: contactedCount > 0 ? Math.round((reEngagedCount / contactedCount) * 100) : 0,
    },
    charts: {
      deliveryOverTime: chartData.deliveryOverTime,
      repliesPerDay: chartData.repliesPerDay,
    },
  };

  res.status(200).json(payload);
}

// NEW: Generate time-series data bucketed by hour (24h) or day (7d, 30d, all)
async function generateTimeSeries(
  accountId: string,
  since: string | null,
  bucketSize: 'hour' | 'day',
  url: string,
  key: string
): Promise<{ deliveryOverTime: any[]; repliesPerDay: any[] }> {
  const now = new Date();
  const buckets: Map<string, { sent: number; delivered: number; replies: number }> = new Map();
  
  // Determine time range and bucket count
  let startTime: Date;
  let bucketCount: number;
  
  if (since) {
    startTime = new Date(since);
  } else {
    // All time: get earliest message for this account
    try {
      const earliestRes = await fetch(`${url}/rest/v1/messages_out?select=created_at&account_id=eq.${encodeURIComponent(accountId)}&order=created_at.asc&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(3000),
      });
      if (earliestRes.ok) {
        const earliest: any[] = await earliestRes.json().catch(() => []);
        if (earliest.length > 0 && earliest[0].created_at) {
          startTime = new Date(earliest[0].created_at);
        } else {
          startTime = new Date(now.getTime() - 30 * 24 * 3600 * 1000); // fallback to 30 days
        }
      } else {
        startTime = new Date(now.getTime() - 30 * 24 * 3600 * 1000); // fallback
      }
    } catch {
      startTime = new Date(now.getTime() - 30 * 24 * 3600 * 1000); // fallback
    }
  }
  
  // Calculate bucket count
  if (bucketSize === 'hour') {
    bucketCount = Math.ceil((now.getTime() - startTime.getTime()) / (3600 * 1000));
    bucketCount = Math.min(bucketCount, 24); // cap at 24 hours
  } else {
    bucketCount = Math.ceil((now.getTime() - startTime.getTime()) / (24 * 3600 * 1000));
    bucketCount = Math.min(bucketCount, 365); // cap at 365 days for all-time
  }
  
  // Initialize buckets
  for (let i = 0; i < bucketCount; i++) {
    const bucketTime = new Date(startTime.getTime() + i * (bucketSize === 'hour' ? 3600 : 24 * 3600) * 1000);
    const bucketKey = bucketSize === 'hour' 
      ? bucketTime.toISOString().slice(0, 13) + ':00:00.000Z' // YYYY-MM-DDTHH:00:00.000Z
      : bucketTime.toISOString().slice(0, 10); // YYYY-MM-DD
    buckets.set(bucketKey, { sent: 0, delivered: 0, replies: 0 });
  }
  
  // Fetch and bucket messages_out (sent/delivered)
  try {
    const timeFilter = since ? `&created_at=gte.${encodeURIComponent(since)}` : '';
    const outRes = await fetch(`${url}/rest/v1/messages_out?select=created_at,provider_status&account_id=eq.${encodeURIComponent(accountId)}${timeFilter}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (outRes.ok) {
      const outData: any[] = await outRes.json().catch(() => []);
      for (const msg of outData) {
        if (!msg.created_at) continue;
        const msgTime = new Date(msg.created_at);
        const bucketKey = bucketSize === 'hour'
          ? msgTime.toISOString().slice(0, 13) + ':00:00.000Z'
          : msgTime.toISOString().slice(0, 10);
        const bucket = buckets.get(bucketKey);
        if (bucket) {
          bucket.sent++;
          if (msg.provider_status === 'delivered') {
            bucket.delivered++;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[metrics] failed to fetch messages_out for chart', e);
  }
  
  // Fetch and bucket messages_in (replies)
  try {
    const timeFilter = since ? `&created_at=gte.${encodeURIComponent(since)}` : '';
    const inRes = await fetch(`${url}/rest/v1/messages_in?select=created_at,lead_id&account_id=eq.${encodeURIComponent(accountId)}${timeFilter}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (inRes.ok) {
      const inData: any[] = await inRes.json().catch(() => []);
      const uniqueReplies = new Set<string>(); // track unique lead_id per bucket
      for (const msg of inData) {
        if (!msg.created_at) continue;
        const msgTime = new Date(msg.created_at);
        const bucketKey = bucketSize === 'hour'
          ? msgTime.toISOString().slice(0, 13) + ':00:00.000Z'
          : msgTime.toISOString().slice(0, 10);
        const bucket = buckets.get(bucketKey);
        if (bucket) {
          const replyKey = `${bucketKey}-${msg.lead_id}`;
          if (!uniqueReplies.has(replyKey)) {
            uniqueReplies.add(replyKey);
            bucket.replies++;
          }
        }
      }
    }
  } catch (e) {
    console.warn('[metrics] failed to fetch messages_in for chart', e);
  }
  
  // Convert buckets to arrays, sorted by date
  const deliveryOverTime = Array.from(buckets.entries())
    .map(([date, data]) => ({
      date,
      sent: data.sent,
      delivered: data.delivered,
      failed: Math.max(0, data.sent - data.delivered),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  const repliesPerDay = Array.from(buckets.entries())
    .map(([date, data]) => ({
      date,
      replies: data.replies,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  
  return { deliveryOverTime, repliesPerDay };
}
