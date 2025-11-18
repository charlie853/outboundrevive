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

async function fetchIds(query: ReturnType<typeof db.from>) {
  const { data, error } = await query.select('id').limit(100);
  if (error) {
    console.warn('[service-upsells] query error', error.message);
    return [];
  }
  return (data || []).map((row: any) => row.id);
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

    const preIds = await fetchIds(
      db
        .from('service_events')
        .is('upsell_pre_sent_at', null)
        .lt('appt_time', soon)
        .gt('appt_time', later)
    );

    const roIds = await fetchIds(
      db
        .from('service_events')
        .is('upsell_ro_sent_at', null)
        .not('ro_opened_at', 'is', null)
        .gt('ro_opened_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString())
    );

    const postIds = await fetchIds(
      db
        .from('service_events')
        .is('upsell_post_sent_at', null)
        .not('ro_closed_at', 'is', null)
        .gt('ro_closed_at', new Date(now.getTime() - 24 * 3600 * 1000).toISOString())
    );

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

