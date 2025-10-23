export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function normPhone(p: string) {
  if (!p) return '';
  const d = p.replace(/[^\d+]/g, '');
  return d.startsWith('+') ? d : '+1' + d.replace(/^1*/, '');
}

function escapeXml(s: string) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const From = normPhone(String(form.get('From') || ''));
  const To   = normPhone(String(form.get('To')   || ''));
  const Body = String(form.get('Body') || '').trim();

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    // 1) resolve lead by phone
    let leadId: string | null = null;
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, phone')
      .eq('phone', From)
      .maybeSingle();
    if (!leadErr && lead?.id) leadId = lead.id;

    // 2) insert inbound with lead_id (or null)
    const { data, error } = await supabase
      .from('messages_in')
      .insert({
        lead_id: leadId,
        from_phone: From || null,
        to_phone: To || null,
        body: Body || null
      })
      .select()
      .single();

    if (error) {
      console.error('[twilio/inbound] insert error', error);
    } else {
      console.log('[twilio/inbound] insert ok', data);
    }

    // ---- v1 auto-responder (deterministic) ------------------------------
    function normalize(s: string) { return (s || '').toLowerCase().trim(); }
    function buildAutoReply(opts: {
      body: string;
      leadFirst?: string | null;
      brand?: string | null;
      booking?: string | null;
    }): string {
      const { body, leadFirst, brand, booking } = opts;
      const msg = normalize(body);

      const who = leadFirst || 'there';
      const b = brand || 'OutboundRevive';
      const cal = booking || process.env.CAL_BOOKING_URL || 'https://cal.com/charlie-fregozo-v8sczt/secret';

      if (/\bstop\b/i.test(msg)) {
        return `You’re opted out and won’t receive more texts. Reply START to re-subscribe.`;
      }
      if (/\bhelp\b/i.test(msg)) {
        return `${b} support: you can book a quick call here: ${cal}`;
      }
      if (/(who|what).*this|what company|who is this/.test(msg)) {
        return `Hey ${who}—it’s Charlie with ${b}. We help businesses revive old leads and convert new ones using AI-driven SMS + booking. Want me to send a link to pick a time?`;
      }
      if (/(book|schedule|link|call|time|calendar)/.test(msg)) {
        return `Great! Here’s a link to grab a time that works for you: ${cal}`;
      }
      if (/(price|cost|how much|expensive|budget)/.test(msg)) {
        return `Totally fair question. Pricing is simple: a flat monthly fee based on volume, plus pass-through SMS. Happy to tailor a plan—want to chat for 10 minutes? ${cal}`;
      }
      if (/(old lead|re-engage|revive|reactivate)/.test(msg)) {
        return `That’s our jam. We warm up old leads with compliant, conversational SMS and route replies to booked calls. Want me to show you a 2-min demo? ${cal}`;
      }
      if (/too\s+expensive|can.t afford|not in budget/.test(msg)) {
        return `I hear you. Most clients offset our fee with 1–2 revived deals per month. If we don’t create clear ROI, we shouldn’t work together. Still open to a quick call? ${cal}`;
      }
      return `Hey ${who}—Charlie with ${b}. We help you convert more leads with AI SMS + instant booking. Want a quick link to schedule? ${cal}`;
    }
    // ---------------------------------------------------------------------

    if (leadId) {
      const replyText = buildAutoReply({ body: Body, leadFirst: null, brand: 'OutboundRevive', booking: process.env.CAL_BOOKING_URL });
      try {
        const res = await fetch(`${process.env.PUBLIC_BASE_URL}/api/admin/leads/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-key': process.env.ADMIN_API_KEY!,
          },
          body: JSON.stringify({ lead_id: leadId, body: replyText }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error('[inbound] auto-send failed', res.status, text);
        } else {
          const j = await res.json().catch(() => ({}));
          console.log('[inbound] auto-send ok', j);
        }
      } catch (e) {
        console.error('[inbound] auto-send error', e);
      }
    }

  } catch (e) {
    console.error('[twilio/inbound] insert threw', e);
  }

  // Always return empty TwiML so Twilio doesn’t auto-text on your behalf
  return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
}
