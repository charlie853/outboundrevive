import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { isWithinQuietHours } from '@/lib/ai-followups';

export const runtime = 'nodejs';

type TriggerPhase = 'pre' | 'ro' | 'post';

function isAdmin(req: NextRequest) {
  const token = (req.headers.get('x-admin-token') || '').trim();
  const adminKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  return !!adminKey && token === adminKey;
}

function firstName(name?: string | null) {
  if (!name) return 'there';
  return name.split(' ')[0] || 'there';
}

function buildMessage(offer: any, lead: any, phase: TriggerPhase) {
  const intro = phase === 'pre'
    ? 'Before you come in'
    : phase === 'ro'
      ? 'While the team has your vehicle'
      : 'After today\'s visit';
  const leadName = firstName(lead?.name);
  const teaser = offer?.title || 'an offer';
  const range = offer?.est_price_low && offer?.est_price_high
    ? `$${offer.est_price_low}-${offer.est_price_high}`
    : offer?.est_price_low
      ? `$${offer.est_price_low}+`
      : '';
  const summary = offer?.rule_json?.copy || offer?.compliance_note || '';
  return `Hi ${leadName}, ${intro} we lined up ${teaser}${range ? ` (${range})` : ''}. ${summary || 'Want me to hold a spot?'} Reply YES to add it.`;
}

async function sendSmsViaApi(leadId: string, accountId: string, text: string) {
  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
  const admin = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  const resp = await fetch(`${base}/api/sms/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': admin },
    body: JSON.stringify({
      leadIds: [leadId],
      message: text,
      replyMode: true,
      account_id: accountId,
      gate_context: 'offer',
    }),
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, json };
}

async function ensureExperiment(accountId: string) {
  const key = 'service_upsell_default';
  const { data } = await db.from('experiments').select('*').eq('account_id', accountId).eq('key', key).maybeSingle();
  if (data) return data;
  const { data: created } = await db
    .from('experiments')
    .insert({
      account_id: accountId,
      key,
      name: 'Service Upsell Holdout',
      holdout_pct: 0.1,
    })
    .select('*')
    .single();
  return created;
}

async function getAssignment(accountId: string, experimentId: string, leadId: string, holdoutPct = 0.1) {
  const { data } = await db
    .from('experiment_assignments')
    .select('id, variant, experiment_id')
    .eq('account_id', accountId)
    .eq('experiment_id', experimentId)
    .eq('lead_id', leadId)
    .maybeSingle();
  if (data) return data;
  const variant = Math.random() < holdoutPct ? 'control' : 'treatment';
  const { data: created } = await db
    .from('experiment_assignments')
    .insert({
      experiment_id: experimentId,
      account_id: accountId,
      lead_id: leadId,
      variant,
    })
    .select('id, variant, experiment_id')
    .single();
  return created;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.service_event_ids)
      ? body.service_event_ids
      : body.service_event_id
        ? [body.service_event_id]
        : [];
    if (!ids.length) return NextResponse.json({ error: 'missing_service_event_id' }, { status: 400 });
    const trigger: TriggerPhase = (body.trigger || 'pre').toLowerCase();
    const offerIdOverride: string | undefined = body.offer_id;

    const results: any[] = [];
    for (const serviceEventId of ids) {
      const { data: svc, error: svcErr } = await db
        .from('service_events')
        .select('id, account_id, lead_id, vehicle_id, appt_time, ro_opened_at, ro_closed_at, upsell_pre_sent_at, upsell_ro_sent_at, upsell_post_sent_at')
        .eq('id', serviceEventId)
        .maybeSingle();
      if (svcErr || !svc) {
        results.push({ service_event_id: serviceEventId, ok: false, reason: svcErr?.message || 'not_found' });
        continue;
      }

      const { data: lead } = await db.from('leads').select('id, phone, name').eq('id', svc.lead_id).maybeSingle();
      if (!lead?.phone) {
        results.push({ service_event_id: serviceEventId, ok: false, reason: 'missing_phone' });
        continue;
      }

      const withinQuiet = await isWithinQuietHours(lead.phone, svc.account_id);
      if (!withinQuiet) {
        results.push({ service_event_id: serviceEventId, ok: false, reason: 'quiet_hours' });
        continue;
      }

      const experiment = await ensureExperiment(svc.account_id);
      let experimentId = experiment?.id || null;
      let variant = typeof body.variant === 'string' ? body.variant : 'treatment';

      if (!body.variant && experimentId) {
        const assignment = await getAssignment(svc.account_id, experimentId, svc.lead_id, experiment?.holdout_pct ?? 0.1);
        variant = assignment?.variant || 'treatment';
      }

      if (variant === 'control') {
        results.push({ service_event_id: serviceEventId, ok: false, reason: 'control_holdout' });
        continue;
      }

      let offer = null;
      if (offerIdOverride) {
        const { data } = await db.from('offers').select('*').eq('id', offerIdOverride).maybeSingle();
        offer = data;
      } else {
        const { data } = await db
          .from('offers')
          .select('*')
          .eq('account_id', svc.account_id)
          .eq('active', true)
          .order('created_at', { ascending: true })
          .limit(1);
        if (data && data.length) offer = data[0];
      }

      if (!offer) {
        results.push({ service_event_id: serviceEventId, ok: false, reason: 'no_offer' });
        continue;
      }

      const message = typeof body.message === 'string' && body.message.trim().length > 5
        ? body.message.trim()
        : buildMessage(offer, lead, trigger);

      const send = await sendSmsViaApi(lead.id, svc.account_id, message);
      const sendResult = Array.isArray(send.json?.results) ? send.json.results[0] : null;
      const sid = sendResult?.sid || null;
      const sendOk = !!sid;

      await db.from('offer_sends').insert({
        account_id: svc.account_id,
        service_event_id: svc.id,
        offer_id: offer.id,
        message_id: sid,
        sent_at: new Date().toISOString(),
        variant,
        experiment_id: experimentId,
        metadata: { phase: trigger, send_json: send.json },
      });

      const phaseField =
        trigger === 'pre'
          ? 'upsell_pre_sent_at'
          : trigger === 'ro'
            ? 'upsell_ro_sent_at'
            : 'upsell_post_sent_at';

      await db.from('service_events').update({ [phaseField]: new Date().toISOString() }).eq('id', svc.id);

      results.push({ service_event_id: serviceEventId, ok: sendOk, sid, trigger, offer_id: offer.id });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err: any) {
    console.error('[internal/offers/send] crash', err);
    return NextResponse.json({ error: 'server_error', detail: err?.message || String(err) }, { status: 500 });
  }
}


