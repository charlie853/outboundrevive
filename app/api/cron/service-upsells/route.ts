import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

function isAuthorized(req: NextRequest) {
  const adminKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const authHeader = (req.headers.get('authorization') || '').trim();
  const cronHeader = (req.headers.get('x-cron-secret') || '').trim();
  const adminHeader = (req.headers.get('x-admin-token') || '').trim();
  if (adminKey && adminHeader === adminKey) return true;
  if (cronSecret && (authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret)) return true;
  return false;
}

async function fetchIds(query: ReturnType<typeof db.from>, nullFilter?: { field: string; mustBeNull: boolean }) {
  const { data, error } = await query.select('id,upsell_pre_sent_at,upsell_ro_sent_at,upsell_post_sent_at').limit(100);
  if (error) {
    console.warn('[service-upsells] query error', error.message);
    return [];
  }
  let rows = data || [];
  if (nullFilter) {
    rows = rows.filter((row: any) => {
      const value = row[nullFilter.field];
      return nullFilter.mustBeNull ? (value === null || value === undefined) : (value !== null && value !== undefined);
    });
  }
  return rows.map((row: any) => row.id);
}

async function triggerSend(ids: string[], trigger: 'pre' | 'ro' | 'post', req: NextRequest) {
  if (!ids.length) return null;
  const adminKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  const base = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
  const res = await fetch(`${base}/api/internal/offers/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': adminKey,
    },
    body: JSON.stringify({ service_event_ids: ids, trigger }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[service-upsells] send error', trigger, json);
  }
  return json;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
    const later = new Date(now.getTime() + 36 * 3600 * 1000).toISOString(); // avoid double hitting same window

    // PRE trigger: appointments 36-48h from now, upsell_pre_sent_at must be null
    const preQuery = db
      .from('service_events')
      .select('id,upsell_pre_sent_at,appt_time')
      .lt('appt_time', soon)
      .gt('appt_time', later)
      .limit(100);
    const { data: preData } = await preQuery;
    const preIds = (preData || [])
      .filter((row: any) => !row.upsell_pre_sent_at)
      .map((row: any) => row.id);

    // RO trigger: RO opened in last hour, upsell_ro_sent_at must be null
    const roQuery = db
      .from('service_events')
      .select('id,upsell_ro_sent_at,ro_opened_at')
      .not('ro_opened_at', 'is', null)
      .gt('ro_opened_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString())
      .limit(100);
    const { data: roData } = await roQuery;
    const roIds = (roData || [])
      .filter((row: any) => !row.upsell_ro_sent_at)
      .map((row: any) => row.id);

    // POST trigger: RO closed in last 24h, upsell_post_sent_at must be null
    const postQuery = db
      .from('service_events')
      .select('id,upsell_post_sent_at,ro_closed_at')
      .not('ro_closed_at', 'is', null)
      .gt('ro_closed_at', new Date(now.getTime() - 24 * 3600 * 1000).toISOString())
      .limit(100);
    const { data: postData } = await postQuery;
    const postIds = (postData || [])
      .filter((row: any) => !row.upsell_post_sent_at)
      .map((row: any) => row.id);

    const [preRes, roRes, postRes] = await Promise.all([
      triggerSend(preIds, 'pre', req),
      triggerSend(roIds, 'ro', req),
      triggerSend(postIds, 'post', req),
    ]);

    return NextResponse.json({
      ok: true,
      counts: {
        pre: preIds.length,
        ro: roIds.length,
        post: postIds.length,
      },
      responses: { pre: preRes, ro: roRes, post: postRes },
    });
  } catch (err: any) {
    console.error('[service-upsells] crash', err);
    return NextResponse.json({ error: 'server_error', detail: err?.message || String(err) }, { status: 500 });
  }
}

