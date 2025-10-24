// app/api/internal/inbox/reply/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    // auth
    const adminToken = req.headers.get('x-admin-token') || '';
    if (!adminToken || adminToken !== (process.env.ADMIN_TOKEN || '')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { lead_id, message, operator_id } = await req.json();

    if (!lead_id || !message) {
      return NextResponse.json({ error: 'missing_params' }, { status: 400 });
    }

    // load lead & quick safety checks
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('id, phone, opted_out')
      .eq('id', lead_id)
      .maybeSingle();

    if (leadErr) {
      return NextResponse.json({ error: 'lead_lookup_failed', details: leadErr.message }, { status: 500 });
    }
    if (!lead) {
      return NextResponse.json({ error: 'lead_not_found' }, { status: 404 });
    }
    if (lead.opted_out) {
      return NextResponse.json({ error: 'opted_out' }, { status: 409 });
    }

    // call your existing send endpoint in replyMode
    const origin = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const sendRes = await fetch(`${origin}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken,
      },
      body: JSON.stringify({
        leadIds: [lead_id],
        message,
        replyMode: true,
        // pass through operator metadata so /api/sms/send can persist it directly
        operator_id,
        sentBy: 'operator',
        aiMeta: { source: 'operator', operator_id },
      }),
    });

    const sendJson = await sendRes.json().catch(() => ({} as any));
    const results = Array.isArray(sendJson?.results) ? sendJson.results : [];
    if (!sendRes.ok) {
      return NextResponse.json({ error: 'send_failed', details: sendJson?.error || sendRes.status }, { status: 500 });
    }

    // tag the just-created messages_out row(s) as operator-sent
    const sids = results.map((r: any) => r.sid).filter(Boolean);
    if (sids.length) {
      const { error: updErr } = await supabaseAdmin
        .from('messages_out')
        .update({ sent_by: 'operator', operator_id: operator_id || 'unknown' })
        .in('sid', sids);
      if (updErr) {
        console.error('[inbox/reply] tagging error:', updErr);
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      took_ms: Date.now() - t0,
    });
  } catch (e: any) {
    console.error('[inbox/reply] exception', e);
    return NextResponse.json({ error: 'exception', details: String(e?.message || e) }, { status: 500 });
  }
}
