import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';
import crypto from 'crypto';

export const runtime = 'nodejs';

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

    // Signature verification (skipped if TWILIO_DISABLE=1)
    const prodLike = process.env.TWILIO_DISABLE !== '1';
    if (prodLike) {
      const authToken = process.env.TWILIO_AUTH_TOKEN || '';
      const header =
        req.headers.get('x-twilio-signature') ||
        req.headers.get('X-Twilio-Signature') ||
        '';
      const inferred = `${req.nextUrl.origin}${req.nextUrl.pathname}`;
      const baseUrl = process.env.PUBLIC_BASE_URL
        ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/webhooks/twilio/inbound`
        : inferred;
      const keys = Array.from(form.keys()).sort();
      let data = baseUrl;
      for (const k of keys) data += k + String(form.get(k) ?? '');

      const expected = crypto
        .createHmac('sha1', authToken)
        .update(Buffer.from(data, 'utf-8'))
        .digest('base64');

      const a = Buffer.from(header);
      const b = Buffer.from(expected);
      const ok = !!authToken && !!header && a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!ok) return new NextResponse(null, { status: 403 });
    }

    const from = String(form.get('From') ?? '');
    const body = String(form.get('Body') ?? '');
    const sid  = String(form.get('MessageSid') ?? '');
    if (!from) return new NextResponse(null, { status: 200 });

    const { data: leads, error: selErr } = await supabaseAdmin
      .from('leads')
      .select('id,phone,opted_out,replied,intent')
      .eq('phone', from)
      .limit(1);

    if (selErr) {
      console.error('[INBOUND] select error:', selErr);
      return new NextResponse(null, { status: 200 });
    }
    const lead = leads?.[0] || null;

    const intent = detectIntent(body);

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

    // No matching lead: still honor STOP/START/HELP with consent ledger
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

    return new NextResponse(null, { status: 200 });
  } catch (e) {
    console.error('[INBOUND] Handler exception:', e);
    return new NextResponse(null, { status: 200 });
  }
}