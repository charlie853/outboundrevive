import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

type ROUpdate = {
  account_id: string;
  external_id: string;
  service_event_id?: string;
  status?: 'open' | 'closed' | 'in_progress' | 'canceled';
  ro_opened_at?: string | null;
  ro_closed_at?: string | null;
  advisor?: string | null;
  services?: Record<string, any> | null;
  revenue_attributed?: number | null;
  offer_send_id?: string | null;
  accepted_offer?: boolean;
};

function isAuthorized(req: NextRequest) {
  const header = (req.headers.get('x-admin-token') || '').trim();
  const adminKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  return !!adminKey && header === adminKey;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => null)) as ROUpdate | null;
    if (!body?.account_id || !(body.external_id || body.service_event_id)) {
      return NextResponse.json({ error: 'missing_keys' }, { status: 400 });
    }

    const accountId = body.account_id;
    const match = body.service_event_id
      ? { id: body.service_event_id }
      : { account_id: accountId, external_id: body.external_id };

    const patch: Record<string, any> = {};
    if (body.status) patch.status = body.status;
    if ('ro_opened_at' in body) patch.ro_opened_at = body.ro_opened_at;
    if ('ro_closed_at' in body) patch.ro_closed_at = body.ro_closed_at;
    if ('advisor' in body) patch.advisor = body.advisor;
    if ('services' in body) patch.services = body.services;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'no_updates' }, { status: 400 });
    }

    const { data, error } = await db
      .from('service_events')
      .update(patch)
      .match(match)
      .select('id, account_id, lead_id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.id) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    const offerUpdates: any[] = [];
    if (body.offer_send_id) {
      offerUpdates.push(
        db
          .from('offer_sends')
          .update({
            accepted: body.accepted_offer ?? true,
            accepted_at: new Date().toISOString(),
            revenue_attributed: body.revenue_attributed ?? null,
          })
          .eq('id', body.offer_send_id)
      );
    }

    if (offerUpdates.length) {
      await Promise.all(offerUpdates).catch((err) => console.warn('[ro/update] offer update warning', err.message));
    }

    return NextResponse.json({ ok: true, service_event_id: data.id });
  } catch (err: any) {
    console.error('[ro/update] crash', err);
    return NextResponse.json({ error: 'server_error', detail: err?.message || String(err) }, { status: 500 });
  }
}


