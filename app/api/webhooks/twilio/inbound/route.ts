import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';
import twilio from 'twilio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function detectIntent(body: string) {
  const t = (body || '').trim().toUpperCase();
  if (/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REMOVE)\b/.test(t)) return 'STOP';
  if (/^START\b/.test(t)) return 'START';
  if (/^HELP\b/.test(t)) return 'HELP';
  if (/\bYES\b/.test(t)) return 'YES';
  if (/\bNO\b/.test(t)) return 'NO';
  if (/RESCHED|RESLOT|RESCHEDULE/.test(t)) return 'RESCHEDULE';
  return 'OTHER';
}

const xml = (s: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${s}</Message></Response>`;

const stopConfirm = xml(
  'You have successfully been unsubscribed. You will not receive any more messages. Reply START to re-subscribe.'
);
const helpText =
  'Support: reply STOP to opt out, START to re-subscribe. Msg&data rates may apply.';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // Signature verification (hardened): validate against the exact URL Twilio hit
    const prodLike = process.env.TWILIO_DISABLE !== '1';
    if (prodLike) {
      const authToken = process.env.TWILIO_AUTH_TOKEN || '';
      const signature = req.headers.get('x-twilio-signature') ?? req.headers.get('X-Twilio-Signature');
      if (!signature) return new NextResponse('missing signature', { status: 403 });
      const paramsObj = Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)]));
      const url = req.url; // exact URL (includes path and query)
      const valid = twilio.validateRequest(authToken, signature as string, url, paramsObj);
      if (!valid) return new NextResponse('invalid signature', { status: 403 });
    }

    const from = String(form.get('From') ?? '');
    const body = String(form.get('Body') ?? '');
    const sid  = String(form.get('MessageSid') ?? '');
    if (!from) return new NextResponse(null, { status: 200 });

    // Capture `To` and any media for richer analytics
    const to = String(form.get('To') ?? '');
    const numMedia = Number(form.get('NumMedia') ?? '0') || 0;
    const media: Array<{ url: string; contentType: string }> = [];
    for (let i = 0; i < numMedia; i++) {
      const url = String(form.get(`MediaUrl${i}`) ?? '');
      const contentType = String(form.get(`MediaContentType${i}`) ?? '');
      if (url) media.push({ url, contentType });
    }
    const meta = {
      raw: Object.fromEntries(Array.from(form.entries()).map(([k, v]) => [k, String(v)])),
      media,
    };

    const { data: leads, error: selErr } = await supabaseAdmin
      .from('leads')
      .select('id,phone,opted_out,replied,intent')
      .eq('phone', from)
      .limit(1);

    if (selErr) {
      console.error('[INBOUND] select error:', selErr);
      return new NextResponse(null, { status: 200 });
    }
    let lead = leads?.[0] || null;

    const intent = detectIntent(body);

    // --- NEW: Always log inbound into messages_in (idempotent on provider_sid) ---
    await supabaseAdmin
      .from('messages_in')
      .upsert(
        {
          lead_id: lead?.id ?? null,
          body,
          provider_sid: sid || null,
          provider_from: from || null,
          provider_to: to || null,
          meta
        },
        { onConflict: 'provider_sid' }
      )
      .then(({ error }) => {
        if (error) console.error('[INBOUND] messages_in upsert error:', error);
      });

    // Best-effort: mark last inbound on the lead (if we have one)
    if (lead?.id) {
      await supabaseAdmin
        .from('leads')
        .update({ last_inbound_at: new Date().toISOString() })
        .eq('id', lead.id);
    }

    // Idempotency by MessageSid
    if (sid) {
      const { data: existing } = await supabaseAdmin
        .from('replies')
        .select('id,intent')
        .eq('message_sid', sid)
        .maybeSingle();

      if (existing) {
        if (intent === 'STOP') {
          return new NextResponse(stopConfirm, { status: 200, headers: { 'Content-Type': 'text/xml' } });
        }
        if (intent === 'START') {
          return new NextResponse(xml(helpText), { status: 200, headers: { 'Content-Type': 'text/xml' } });
        }
        return new NextResponse(null, { status: 200 });
      }
    }

    // Log inbound (idempotent on message_sid)
    await supabaseAdmin
      .from('replies')
      .upsert(
        { lead_id: lead?.id || null, phone: from, body, intent, message_sid: sid || null },
        { onConflict: 'message_sid' }
      );

    // No matching lead: try to upsert a lead mapped by incoming To number
    if (!lead && to) {
      try {
        const { data: map } = await supabaseAdmin
          .from('account_sms_config' as any)
          .select('account_id')
          .eq('from_number', to)
          .maybeSingle();
        if (map?.account_id) {
          const { data: ins } = await supabaseAdmin
            .from('leads')
            .insert({ account_id: map.account_id, phone: from, status: 'pending' } as any)
            .select('id,phone,opted_out,replied,intent')
            .maybeSingle();
          if (ins) lead = ins as any;
        }
      } catch {}
    }

    // Still no lead: honor STOP/START/HELP and exit
    if (!lead) {
      if (intent === 'STOP') {
        await supabaseAdmin.from('consent_events').insert({
          lead_id: null, phone: from, type: 'revoked', source: 'inbound_sms'
        }).then(({ error }) => { if (error) console.error('[INBOUND] consent STOP (no lead) error:', error); });
        return new NextResponse(stopConfirm, { status: 200, headers: { 'Content-Type': 'text/xml' } });
      }
      if (intent === 'START') {
        await supabaseAdmin.from('consent_events').insert({
          lead_id: null, phone: from, type: 'sms_marketing_granted', source: 'inbound_sms'
        }).then(({ error }) => { if (error) console.error('[INBOUND] consent START (no lead) error:', error); });
        return new NextResponse(xml(helpText), { status: 200, headers: { 'Content-Type': 'text/xml' } });
      }
      if (intent === 'HELP') {
        await supabaseAdmin.from('consent_events').insert({
          lead_id: null, phone: from, type: 'help', source: 'inbound_sms'
        }).then(({ error }) => { if (error) console.error('[INBOUND] consent HELP (no lead) error:', error); });
      }
      return new NextResponse(null, { status: 200 });
    }

    // Load settings (also used later for AI auto-reply gating)
    const { data: cfg } = await supabaseAdmin
      .from('app_settings')
      .select('booking_link,brand,managed_mode,autopilot_enabled')
      .eq('id', 'default')
      .maybeSingle();

    const brand = cfg?.brand || 'OutboundRevive';

    // STOP
    if (intent === 'STOP') {
      const now = new Date().toISOString();

      const { error: updErr } = await supabaseAdmin
        .from('leads')
        .update({
          opted_out: true,
          intent: 'STOP',
          last_reply_at: now,
          last_reply_body: body
        })
        .eq('id', lead.id);
      if (updErr) console.error('[INBOUND] STOP update error:', updErr);

      const { error: supErr } = await supabaseAdmin
        .from('global_suppressions')
        .upsert({ phone: from, reason: 'STOP reply' }, { onConflict: 'phone' });
      if (supErr) console.error('[INBOUND] STOP suppress error:', supErr);

      await supabaseAdmin.from('consent_events').insert({
        lead_id: lead.id, phone: from, type: 'revoked', source: 'inbound_sms'
      }).then(({ error }) => { if (error) console.error('[INBOUND] consent STOP error:', error); });

      return new NextResponse(stopConfirm, { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    // START
    if (intent === 'START') {
      const now = new Date().toISOString();

      const { error: startErr } = await supabaseAdmin
        .from('leads')
        .update({
          opted_out: false,
          intent: 'START',
          last_reply_at: now,
          last_reply_body: body
        })
        .eq('id', lead.id);
      if (startErr) console.error('[INBOUND] START update error:', startErr);

      const { error: delErr } = await supabaseAdmin
        .from('global_suppressions')
        .delete()
        .eq('phone', from);
      if (delErr) console.error('[INBOUND] unsuppress error:', delErr);

      await supabaseAdmin.from('consent_events').insert({
        lead_id: lead.id, phone: from, type: 'sms_marketing_granted', source: 'inbound_sms'
      }).then(({ error }) => { if (error) console.error('[INBOUND] consent START error:', error); });

      return new NextResponse(xml(helpText), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    // YES → tracked booking link
    if (intent === 'YES') {
      const now = new Date().toISOString();

      const { error: yesErr } = await supabaseAdmin
        .from('leads')
        .update({
          replied: true,
          intent: 'YES',
          last_reply_at: now,
          last_reply_body: body
        })
        .eq('id', lead.id);
      if (yesErr) console.error('[INBOUND] YES update error:', yesErr);

      const base = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
      const tracked = `${base}/r/book/${lead.id}`;
      const msg = `${brand}: awesome—book here: ${tracked}`;

      return new NextResponse(xml(msg), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    // HELP
    if (intent === 'HELP') {
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from('leads')
        .update({
          intent: 'HELP',
          last_reply_at: now,
          last_reply_body: body
        })
        .eq('id', lead.id);
      if (error) console.error('[INBOUND] HELP update error:', error);

      await supabaseAdmin.from('consent_events').insert({
        lead_id: lead.id, phone: from, type: 'help', source: 'inbound_sms'
      }).then(({ error }) => { if (error) console.error('[INBOUND] consent HELP error:', error); });

      return new NextResponse(xml(helpText), { status: 200, headers: { 'Content-Type': 'text/xml' } });
    }

    // OTHER / NO / RESCHEDULE etc. — record intent
    await supabaseAdmin
      .from('leads')
      .update({
        intent,
        last_reply_at: new Date().toISOString(),
        last_reply_body: body
      })
      .eq('id', lead.id);

    // ---------- OPTIONAL AI AUTO-REPLY (managed mode) ----------
    try {
      const shouldAuto =
        !!cfg?.managed_mode &&
        !!cfg?.autopilot_enabled &&
        !lead.opted_out;

      if (shouldAuto) {
        const origin = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');

        // Get a short AI draft (kept under 160 chars by the helper)
        const draftRes = await fetch(`${origin}/api/ai/draft`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id, lastInboundOverride: body })
        });

        if (draftRes.ok) {
          const draftJson = await draftRes.json().catch(() => ({} as any));
          const draft: string | undefined = draftJson?.draft;

          // NEW: capture provenance for analytics
          const aiMeta = {
            intent: draftJson?.intent ?? null,
            source: draftJson?.source ?? null, // 'template' | 'llm' | 'fallback'
            template_id: draftJson?.template_id ?? null,
            blueprint_version_id: draftJson?.blueprint_version_id ?? null,
            used_snippets: Array.isArray(draftJson?.used_snippets) ? draftJson.used_snippets : undefined
          };

          if (draft) {
            const adminToken = process.env.ADMIN_TOKEN || '';
            await fetch(`${origin}/api/sms/send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(adminToken ? { 'x-admin-token': adminToken } : {})
              },
              body: JSON.stringify({
                leadIds: [lead.id],
                message: draft,
                brand,
                replyMode: true,
                aiMeta // <-- NEW: persist AI provenance into messages_out
              })
            }).catch((e) => console.error('[INBOUND] auto-reply send error:', e));
          }
        } else {
          const errTxt = await draftRes.text().catch(() => '');
          console.error('[INBOUND] AI draft error:', draftRes.status, errTxt);
        }
      }
    } catch (e) {
      console.error('[INBOUND] AI auto-reply exception:', e);
    }
    // -----------------------------------------------------------

    // Optional TwiML echo so testers see an immediate reply while the pipeline runs
    return new NextResponse(xml('Got it — we’ll take it from here.'), { status: 200, headers: { 'Content-Type': 'text/xml' } });
  } catch (e) {
    console.error('[INBOUND] Handler exception:', e);
    return new NextResponse('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }
}
