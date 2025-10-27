import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const headers: Record<string, string> = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Accept: 'application/json',
  Prefer: 'count=exact',
};

async function pgrest(path: string, signal?: AbortSignal) {
  const url = `${BASE}/rest/v1/${path}`;
  const res = await fetch(url, { headers, signal, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`REST ${res.status}: ${text}`);
  }
  const data = await res.json().catch(() => ({}));
  const range = res.headers.get('content-range');
  const totalMatch = range && /\d+\/(\d+)$/.exec(range);
  const total = totalMatch ? Number(totalMatch[1]) : Array.isArray(data) ? data.length : 0;
  return { data, total };
}

function withTimeout<T>(promise: Promise<T>, ms = 5000, label = 'op'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT_${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function sinceISO(range: string) {
  const now = new Date();
  const d = new Date(now);
  if (range === '24h') d.setDate(now.getDate() - 1);
  else if (range === '30d') d.setDate(now.getDate() - 30);
  else if (range === '90d') d.setDate(now.getDate() - 90);
  else d.setDate(now.getDate() - 7);
  return d.toISOString();
}

function bucketDays(startIso: string, endIso: string) {
  const days: string[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

const clampRange = (range: string | null): '24h' | '7d' | '30d' | '90d' => {
  const r = (range ?? '').toLowerCase();
  if (r === '24h') return '24h';
  if (r === '30d') return '30d';
  if (r === '90d') return '90d';
  return '7d';
};

export async function GET(req: Request) {
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), 10_000);

  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.get('ping') === '1') {
      console.log('METRICS_PING');
      return NextResponse.json({ ok: true, pong: true });
    }

    const rangeKey = clampRange(searchParams.get('range'));
    const since = sinceISO(rangeKey);
    const nowIso = new Date().toISOString();

    console.log('METRICS_START', { range: rangeKey, since });

    const callWithTimeout = async (path: string, label: string) => {
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      controller.signal.addEventListener('abort', onAbort, { once: true });
      try {
        return await withTimeout(pgrest(path, ac.signal), 5000, label);
      } catch (err) {
        ac.abort();
        throw err;
      } finally {
        controller.signal.removeEventListener('abort', onAbort);
      }
    };

    const [sentRes, deliveredRes, repliesRes, leadsRes] = await Promise.all([
      callWithTimeout(`messages_out?created_at=gte.${encodeURIComponent(since)}&select=id`, 'METRICS_SENT'),
      callWithTimeout(
        `messages_out?created_at=gte.${encodeURIComponent(since)}&status=in.(delivered,sent)&select=id`,
        'METRICS_DELIVERED',
      ),
      callWithTimeout(`messages_in?created_at=gte.${encodeURIComponent(since)}&select=id`, 'METRICS_REPLIES'),
      callWithTimeout(`leads?created_at=gte.${encodeURIComponent(since)}&select=id`, 'METRICS_LEADS'),
    ]);

    const sentCount = sentRes.total;
    const deliveredCount = deliveredRes.total;
    const repliesCount = repliesRes.total;
    const leadsCount = leadsRes.total;

    const seriesParams = (extra: string) => {
      const params = new URLSearchParams();
      params.set('created_at', `gte.${since}`);
      params.set('select', "date:date_trunc('day',created_at),count:count(id)");
      params.set('group', 'date');
      params.set('order', 'date.asc');
      if (extra) params.append('status', extra);
      return params.toString();
    };

    const repliesSeriesParams = new URLSearchParams();
    repliesSeriesParams.set('created_at', `gte.${since}`);
    repliesSeriesParams.set('select', "date:date_trunc('day',created_at),replies:count(id)");
    repliesSeriesParams.set('group', 'date');
    repliesSeriesParams.set('order', 'date.asc');

    const [sentSeriesRes, deliveredSeriesRes, failedSeriesRes, repliesSeriesRes] = await Promise.all([
      callWithTimeout(`messages_out?${seriesParams('')}`, 'METRICS_SERIES_SENT'),
      callWithTimeout(`messages_out?${seriesParams('eq.delivered')}`, 'METRICS_SERIES_DELIVERED'),
      callWithTimeout(`messages_out?${seriesParams('eq.failed')}`, 'METRICS_SERIES_FAILED'),
      callWithTimeout(`messages_in?${repliesSeriesParams.toString()}`, 'METRICS_SERIES_REPLIES'),
    ]);

    const dayList = bucketDays(since, nowIso);

    const sentMap = new Map<string, number>();
    const deliveredMap = new Map<string, number>();
    const failedMap = new Map<string, number>();
    const repliesMap = new Map<string, number>();

    (sentSeriesRes.data as any[] ?? []).forEach((row) => {
      if (!row?.date) return;
      sentMap.set(row.date.slice(0, 10), Number(row.count) || 0);
    });
    (deliveredSeriesRes.data as any[] ?? []).forEach((row) => {
      if (!row?.date) return;
      deliveredMap.set(row.date.slice(0, 10), Number(row.count) || 0);
    });
    (failedSeriesRes.data as any[] ?? []).forEach((row) => {
      if (!row?.date) return;
      failedMap.set(row.date.slice(0, 10), Number(row.count) || 0);
    });
    (repliesSeriesRes.data as any[] ?? []).forEach((row) => {
      if (!row?.date) return;
      repliesMap.set(row.date.slice(0, 10), Number(row.replies) || 0);
    });

    const deliveryOverTime = dayList.map((day) => ({
      date: day,
      sent: sentMap.get(day) ?? 0,
      delivered: deliveredMap.get(day) ?? 0,
      failed: failedMap.get(day) ?? 0,
    }));

    const repliesPerDay = dayList.map((day) => ({
      date: day,
      replies: repliesMap.get(day) ?? 0,
    }));

    const deliveredPct = sentCount > 0 ? (deliveredCount / sentCount) * 100 : 0;

    console.log('METRICS_DONE', { range: rangeKey, sent: sentCount, replies: repliesCount, leads: leadsCount });

    return NextResponse.json(
      {
        ok: true,
        kpis: {
          newLeads: leadsCount,
          messagesSent: sentCount,
          deliveredPct,
          replies: repliesCount,
        },
        charts: {
          deliveryOverTime,
          repliesPerDay,
        },
      },
      { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    console.error('METRICS_ERR', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } finally {
    clearTimeout(totalTimer);
  }
}
