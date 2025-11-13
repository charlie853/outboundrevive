import type { NextApiRequest, NextApiResponse } from 'next';
import { DateTime } from 'luxon';
import { supabaseAdmin } from '@/lib/supabaseServer';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type RangeBucket = 'hour' | 'day' | 'month';

type RawMessageOut = {
  id: string;
  lead_id: string | null;
  provider_sid: string | null;
  sid: string | null;
  sent_at: string | null;
  created_at: string | null;
  provider_status: string | null;
  status: string | null;
};

type NormalizedMessage = {
  key: string;
  leadId: string | null;
  status: 'delivered' | 'failed' | 'sent' | 'pending';
  sentAt: string;
};

type DeliveryBucket = {
  key: string;
  label: string;
  start: string;
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  deliveredPct: number;
};

type RawMessageIn = {
  id: string;
  lead_id: string | null;
  created_at: string | null;
};

type ReplyBucket = {
  key: string;
  label: string;
  start: string;
  replies: number;
};

type RawAppointment = {
  lead_id: string | null;
  status: string | null;
  scheduled_at: string | null;
  created_at: string | null;
};

type RangeInfo = {
  key: string;
  bucket: RangeBucket;
  since: DateTime | null;
  until: DateTime;
};

const STATUS_PRIORITY: Record<NormalizedMessage['status'], number> = {
  delivered: 3,
  failed: 2,
  sent: 1,
  pending: 0,
};

function normaliseStatus(status: string | null | undefined): NormalizedMessage['status'] {
  const s = (status ?? '').toLowerCase();
  if (s === 'delivered') return 'delivered';
  if (s === 'failed' || s === 'undelivered') return 'failed';
  if (s === 'sent' || s === 'queued' || s === 'accepted') return 'sent';
  return 'pending';
}

function resolveRange(rawRange: string | string[] | undefined, timezone: string): RangeInfo {
  const key = (Array.isArray(rawRange) ? rawRange[0] : rawRange || '7d').toLowerCase();
  const now = DateTime.now().setZone(timezone);

  if (key === 'all' || key === 'alltime') {
    return { key: 'all', bucket: 'month', since: null, until: now };
  }

  if (key === '24h') {
    return { key: '24h', bucket: 'hour', since: now.minus({ hours: 24 }), until: now };
  }

  if (key === '30d' || key === '1m') {
    return { key: '30d', bucket: 'day', since: now.minus({ days: 30 }), until: now };
  }

  return { key: '7d', bucket: 'day', since: now.minus({ days: 7 }), until: now };
}

async function getAccountTimezone(accountId: string): Promise<string> {
  try {
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('timezone')
      .eq('account_id', accountId)
      .maybeSingle();
    const tz = (data?.timezone || '').trim();
    return tz || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

function dedupeMessagesOut(rows: RawMessageOut[]): NormalizedMessage[] {
  const dedup = new Map<string, NormalizedMessage>();

  for (const row of rows) {
    const effectiveTime = row.sent_at || row.created_at;
    if (!effectiveTime) continue;
    const key = row.provider_sid || row.sid || row.id;
    const normalized: NormalizedMessage = {
      key,
      leadId: row.lead_id,
      status: normaliseStatus(row.provider_status ?? row.status),
      sentAt: effectiveTime,
    };

    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, normalized);
      continue;
    }

    const existingPriority = STATUS_PRIORITY[existing.status];
    const newPriority = STATUS_PRIORITY[normalized.status];
    if (
      newPriority > existingPriority ||
      (newPriority === existingPriority &&
        DateTime.fromISO(normalized.sentAt).valueOf() > DateTime.fromISO(existing.sentAt).valueOf())
    ) {
      dedup.set(key, normalized);
    }
  }

  return Array.from(dedup.values());
}

function formatBucketLabel(dt: DateTime, bucket: RangeBucket): string {
  if (bucket === 'hour') return dt.toFormat('MMM d ha');
  if (bucket === 'month') return dt.toFormat('MMM yyyy');
  return dt.toFormat('MMM d');
}

function buildDeliverySeries(
  messages: NormalizedMessage[],
  timezone: string,
  bucket: RangeBucket,
  since: DateTime | null
) {
  const buckets = new Map<string, DeliveryBucket>();
  const contacted = new Set<string>();
  const delivered = new Set<string>();

  for (const message of messages) {
    const sentDt = DateTime.fromISO(message.sentAt, { zone: 'utc' });
    if (!sentDt.isValid) continue;
    const local = sentDt.setZone(timezone);
    if (since && local < since) continue;

    const start = bucket === 'hour' ? local.startOf('hour') : bucket === 'day' ? local.startOf('day') : local.startOf('month');
    const key = start.toISO()!;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: formatBucketLabel(start, bucket),
        start: start.toISO()!,
        sent: 0,
        delivered: 0,
        failed: 0,
        pending: 0,
        deliveredPct: 0,
      });
    }
    const entry = buckets.get(key)!;
    entry.sent += 1;

    if (message.status === 'delivered') {
      entry.delivered += 1;
      if (message.leadId) delivered.add(message.leadId);
    } else if (message.status === 'failed') {
      entry.failed += 1;
    } else {
      entry.pending += 1;
    }

    if (message.leadId) contacted.add(message.leadId);
  }

  const series = Array.from(buckets.values())
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((bucketEntry) => ({
      ...bucketEntry,
      deliveredPct: bucketEntry.sent > 0 ? bucketEntry.delivered / bucketEntry.sent : 0,
    }));

  return { buckets: series, contacted, delivered };
}

function buildReplySeries(
  inbound: RawMessageIn[],
  timezone: string,
  bucket: RangeBucket,
  since: DateTime | null
) {
  const buckets = new Map<string, ReplyBucket>();
  const replied = new Set<string>();

  for (const row of inbound) {
    if (!row.created_at) continue;
    const createdDt = DateTime.fromISO(row.created_at, { zone: 'utc' });
    if (!createdDt.isValid) continue;
    const local = createdDt.setZone(timezone);
    if (since && local < since) continue;

    const start = bucket === 'hour' ? local.startOf('hour') : bucket === 'day' ? local.startOf('day') : local.startOf('month');
    const key = start.toISO()!;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: formatBucketLabel(start, bucket),
        start: start.toISO()!,
        replies: 0,
      });
    }
    const entry = buckets.get(key)!;
    entry.replies += 1;
    if (row.lead_id) replied.add(row.lead_id);
  }

  const series = Array.from(buckets.values()).sort((a, b) => a.start.localeCompare(b.start));
  return { buckets: series, replied };
}

function buildBookingSet(rows: RawAppointment[], timezone: string, since: DateTime | null) {
  const booked = new Set<string>();
  let bookedCount = 0;
  let keptCount = 0;
  let noShowCount = 0;

  for (const row of rows) {
    if (!row.lead_id) continue;
    const status = (row.status || '').toLowerCase();
    const effective = row.scheduled_at || row.created_at;
    if (!effective) continue;
    const dt = DateTime.fromISO(effective, { zone: 'utc' }).setZone(timezone);
    if (!dt.isValid) continue;
    if (since && dt < since) continue;

    if (['booked', 'rescheduled', 'kept'].includes(status)) {
      booked.add(row.lead_id);
      bookedCount += 1;
    }
    if (status === 'kept') keptCount += 1;
    if (status === 'no_show') noShowCount += 1;
  }

  return {
    booked,
    stats: {
      booked: bookedCount,
      kept: keptCount,
      noShow: noShowCount,
    },
  };
}

function buildFunnel(
  timezone: string,
  rangeKey: string,
  leads: Set<string>,
  contacted: Set<string>,
  delivered: Set<string>,
  replied: Set<string>,
  booked: Set<string>
) {
  const stages = [
    {
      key: 'leads',
      label: 'Leads touched',
      count: leads.size,
      definition: 'Distinct leads with any outbound, inbound reply, or booking within this range.',
    },
    {
      key: 'contacted',
      label: 'Contacted',
      count: contacted.size,
      definition: 'Distinct leads with ≥1 outbound message sent in this range.',
    },
    {
      key: 'delivered',
      label: 'Delivered',
      count: delivered.size,
      definition: 'Distinct leads with ≥1 delivered outbound message in this range.',
    },
    {
      key: 'replied',
      label: 'Replied',
      count: replied.size,
      definition: 'Distinct leads who replied in this range.',
    },
    {
      key: 'booked',
      label: 'Booked',
      count: booked.size,
      definition: 'Distinct leads with a booking scheduled in this range.',
    },
  ];

  const contactRate = leads.size > 0 ? contacted.size / leads.size : 0;
  const replyRate = delivered.size > 0 ? replied.size / delivered.size : 0;
  const bookingRate = contacted.size > 0 ? booked.size / contacted.size : 0;

  return {
    stages,
    rates: {
      contactRate,
      replyRate,
      bookingRate,
    },
    definitions: {
      contactRate: 'Contact Rate = Contacted ÷ Leads touched in this period.',
      replyRate: 'Reply Rate = Replied ÷ Delivered (unique leads).',
      bookingRate: 'Booking Rate = Booked ÷ Contacted (unique leads).',
    },
    meta: {
      timezone,
      range: rangeKey,
    },
  };
}

async function count(table: string, filterQS: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `${URL}/rest/v1/${table}?select=id&${filterQS}&limit=1`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Prefer: 'count=exact',
      },
    });
    if (!response.ok) return 0;
    const contentRange = response.headers.get('content-range');
    const total = contentRange?.split('/')?.[1];
    return total ? parseInt(total, 10) : 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timeout);
  }
}

export const __test__ = {
  normaliseStatus,
  dedupeMessagesOut,
  buildDeliverySeries,
  buildReplySeries,
  buildBookingSet,
  buildFunnel,
  resolveRange,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (!URL || !KEY) {
    res.status(500).json({ ok: false, error: 'Supabase env missing' });
    return;
  }

  const accountId =
    (Array.isArray(req.query.account_id) ? req.query.account_id[0] : req.query.account_id) ||
    process.env.DEFAULT_ACCOUNT_ID ||
    '11111111-1111-1111-1111-111111111111';

  const timezone = await getAccountTimezone(accountId);
  const rangeInfo = resolveRange(req.query.range, timezone);
  const sinceUtcIso = rangeInfo.since ? rangeInfo.since.toUTC().toISO() : null;

  const buildQS = (baseFilter?: string | string[], timeField = 'created_at') => {
    const parts: string[] = [];
    if (baseFilter) {
      if (Array.isArray(baseFilter)) {
        parts.push(...baseFilter.filter(Boolean));
      } else {
        parts.push(baseFilter);
      }
    }
    parts.push(`account_id=eq.${encodeURIComponent(accountId)}`);
    if (sinceUtcIso) {
      parts.push(`${timeField}=gte.${encodeURIComponent(sinceUtcIso)}`);
    }
    return parts.join('&');
  };

  const qsNewLeads = buildQS(undefined, 'created_at');
  const qsOptedOut = buildQS('opted_out=eq.true', 'updated_at');
  const qsSegmentsIn = buildQS('segments=not.is.null', 'created_at');
  const qsSegmentsOut = buildQS('segments=not.is.null', 'created_at');

  try {
    const [messagesOutRes, messagesInRes, appointmentsRes] = await Promise.all([
      (() => {
        let query = supabaseAdmin
          .from('messages_out')
          .select('id, lead_id, provider_sid, sid, sent_at, created_at, provider_status, status')
          .eq('account_id', accountId)
          .order('created_at', { ascending: true });
        if (sinceUtcIso) query = query.gte('created_at', sinceUtcIso);
        return query;
      })(),
      (() => {
        let query = supabaseAdmin
          .from('messages_in')
          .select('id, lead_id, created_at')
          .eq('account_id', accountId)
          .order('created_at', { ascending: true });
        if (sinceUtcIso) query = query.gte('created_at', sinceUtcIso);
        return query;
      })(),
      (() => {
        let query = supabaseAdmin
          .from('appointments')
          .select('lead_id, status, scheduled_at, created_at')
          .eq('account_id', accountId);
        if (sinceUtcIso) {
          query = query.or(
            `scheduled_at.gte.${encodeURIComponent(sinceUtcIso)},and(scheduled_at.is.null,created_at.gte.${encodeURIComponent(
              sinceUtcIso
            )})`
          );
        }
        return query;
      })(),
    ]);

    const rawMessagesOut = (messagesOutRes.data ?? []) as RawMessageOut[];
    const rawMessagesIn = (messagesInRes.data ?? []) as RawMessageIn[];
    const rawAppointments = (appointmentsRes.data ?? []) as RawAppointment[];

    const normalizedMessages = dedupeMessagesOut(rawMessagesOut);
    const deliverySeries = buildDeliverySeries(normalizedMessages, timezone, rangeInfo.bucket, rangeInfo.since);
    const replySeries = buildReplySeries(rawMessagesIn, timezone, rangeInfo.bucket, rangeInfo.since);
    const bookingData = buildBookingSet(rawAppointments, timezone, rangeInfo.since);

    const fallbackBookedRes = await (async () => {
      try {
        let query = supabaseAdmin
          .from('leads')
          .select('id, appointment_set_at, updated_at')
          .eq('account_id', accountId)
          .eq('booked', true);
        if (sinceUtcIso) {
          query = query.or(
            `appointment_set_at.gte.${sinceUtcIso},and(appointment_set_at.is.null,updated_at.gte.${sinceUtcIso})`
          );
        }
        return await query;
      } catch (error: any) {
        console.warn('[metrics] fallback booked query failed', { message: error?.message });
        return { data: [] } as { data: Array<{ id: string }> | null };
      }
    })();
    const fallbackBookedRows = (fallbackBookedRes.data ?? []) as Array<{ id: string }>;
    fallbackBookedRows.forEach((row) => bookingData.booked.add(row.id));

    const leadsSet = new Set<string>();
    deliverySeries.contacted.forEach((id) => leadsSet.add(id));
    deliverySeries.delivered.forEach((id) => leadsSet.add(id));
    replySeries.replied.forEach((id) => leadsSet.add(id));
    bookingData.booked.forEach((id) => leadsSet.add(id));

    const messagesSent = normalizedMessages.length;
    const deliveredMessagesCount = normalizedMessages.filter((m) => m.status === 'delivered').length;

    const [newLeads, optedOutCount, segmentsTotals] = await Promise.all([
      count('leads', qsNewLeads),
      count('leads', qsOptedOut),
      (async () => {
        const [segmentsIn, segmentsOut] = await Promise.all([
          fetch(`${URL}/rest/v1/messages_in?select=segments&${qsSegmentsIn}`, {
            headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
            signal: AbortSignal.timeout(5000),
          })
            .then((r) => (r.ok ? r.json() : []))
            .then((rows: Array<{ segments: number }>) => rows.reduce((acc, row) => acc + (row.segments || 0), 0))
            .catch(() => 0),
          fetch(`${URL}/rest/v1/messages_out?select=segments&${qsSegmentsOut}`, {
            headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
            signal: AbortSignal.timeout(5000),
          })
            .then((r) => (r.ok ? r.json() : []))
            .then((rows: Array<{ segments: number }>) => rows.reduce((acc, row) => acc + (row.segments || 0), 0))
            .catch(() => 0),
        ]);
        return segmentsIn + segmentsOut;
      })(),
    ]);

    const reEngagedCount = await (async () => {
      if (!sinceUtcIso) return 0;
      const rangeStart = DateTime.fromISO(sinceUtcIso, { zone: 'utc' });
      const inactiveThreshold = rangeStart.minus({ days: 30 }).toISO();
      if (!inactiveThreshold) return 0;
      try {
        const repliedRes = await fetch(`${URL}/rest/v1/messages_in?select=lead_id&${buildQS(undefined, 'created_at')}`, {
          headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
          signal: AbortSignal.timeout(5000),
        });
        if (!repliedRes.ok) return 0;
        const repliedRows: Array<{ lead_id: string }> = await repliedRes.json().catch(() => []);
        const repliedLeadIds = [...new Set(repliedRows.map((row) => row.lead_id).filter(Boolean))];
        if (repliedLeadIds.length === 0) return 0;
        const { data: inactiveLeads } = await supabaseAdmin
          .from('leads')
          .select('id')
          .in('id', repliedLeadIds)
          .or(`last_inbound_at.lt.${inactiveThreshold},last_outbound_at.lt.${inactiveThreshold}`)
          .eq('account_id', accountId);
        return inactiveLeads?.length || 0;
      } catch {
        return 0;
      }
    })();

    const deliveryOverTime = deliverySeries.buckets;
    const repliesOverTime = replySeries.buckets;


    const contactedCount = deliverySeries.contacted.size;
    const deliveredLeadCount = deliverySeries.delivered.size;
    const repliesLeadCount = replySeries.replied.size;
    const bookedLeadCount = bookingData.booked.size;

    const deliveredPct = messagesSent > 0 ? Math.round((deliveredMessagesCount / messagesSent) * 100) : 0;
    const replyRate = deliveredLeadCount > 0 ? Math.round((repliesLeadCount / deliveredLeadCount) * 100) : 0;
    const optOutRate = contactedCount > 0 ? Math.round((optedOutCount / contactedCount) * 100) : 0;
    const bookingRate = contactedCount > 0 ? Math.round((bookedLeadCount / contactedCount) * 100) : 0;

    const funnel = buildFunnel(
      timezone,
      rangeInfo.key,
      leadsSet,
      deliverySeries.contacted,
      deliverySeries.delivered,
      replySeries.replied,
      bookingData.booked
    );

    res.status(200).json({
      ok: true,
      kpis: {
        newLeads,
        messagesSent,
        deliveredPct,
        replies: repliesLeadCount,
        booked: bookedLeadCount,
        contacted: contactedCount,
        optedOut: optedOutCount,
        replyRate,
        optOutRate,
        segments: segmentsTotals,
        appointmentsBooked: bookingData.stats.booked,
        appointmentsKept: bookingData.stats.kept,
        appointmentsNoShow: bookingData.stats.noShow,
        reEngaged: reEngagedCount,
        reEngagementRate: contactedCount > 0 ? Math.round((reEngagedCount / contactedCount) * 100) : 0,
      },
      charts: {
        deliveryOverTime,
        repliesOverTime,
        timezone,
      },
      funnel,
    });
  } catch (error: any) {
    console.error('[metrics] handler failed', { message: error?.message });
    res.status(500).json({ ok: false, error: 'metrics_failed' });
  }
}
