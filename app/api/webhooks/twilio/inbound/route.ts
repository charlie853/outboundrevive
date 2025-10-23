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
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

function escapeXml(s: string) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isQuietNow(tz: string, quietStart?: string | null, quietEnd?: string | null) {
  try {
    if (!quietStart || !quietEnd) return false;
    const now = new Date();
    // naive: compares local hour strings; your existing helper is fine if you have one
    const [qsH] = quietStart.split(':').map(Number);
    const [qeH] = quietEnd.split(':').map(Number);
    const hour = now.getUTCHours(); // replace with tz-aware if you have it
    // Interpret as: Do NOT send BETWEEN quietStart..quietEnd (overnight window)
    if (qsH > qeH) return hour >= qsH || hour < qeH;
    return hour >= qsH && hour < qeH;
  } catch { return false; }
}

export async function POST(req: Request) {
  // Twilio posts as x-www-form-urlencoded
  const form = await req.formData();
  const From = String(form.get('From') || '');
  const To   = String(form.get('To')   || '');
  const Body = String(form.get('Body') || '');

  // 1) Supabase client (service role recommended in server env)
  const supa = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // 2) Find account + lead by recipient/sender
  //    - Adjust to your schema as needed
  const { data: lead } = await supa
    .from('leads')
    .select('id, first_name, phone, account_id')
    .eq('phone', From)                 // change to phone_e164 if that’s your column
    .limit(1)
    .maybeSingle();

  // Fallback: try by incoming mapping table, if you have one
  const accountId = lead?.account_id ?? null;

  const { data: account } = await supa
    .from('account_settings')
    .select('id, brand, booking_link, timezone, quiet_start, quiet_end, prompt_system, prompt_examples')
    .eq('account_id', accountId ?? '')
    .maybeSingle();

  // 3) Insert inbound row (now that you have lead_id to satisfy NOT NULL)
  await supa.from('messages_in').insert({
    lead_id: lead?.id ?? null,  // if null, your table must allow it; you already patched during diagnostics
    from_phone: From,
    to_phone: To,
    body: Body
  });

  // 4) STOP/HELP compliance (don’t LLM on these)
  if (/\bstop\b/i.test(Body)) {
    // mark DNC if you have such a table/column
    await supa.from('messages_out').insert({
      lead_id: lead?.id ?? null,
      body: `You’re opted out and won’t get more texts. Reply START to re-subscribe.`,
      status: 'queued',
      provider: 'twilio'
    });
    // send via your pipeline
    await fetch(`${process.env.PUBLIC_BASE_URL}/api/admin/leads/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': process.env.ADMIN_API_KEY! },
      body: JSON.stringify({
        lead_id: lead?.id,
        body: `You’re opted out and won’t get more texts. Reply START to re-subscribe.`
      })
    }).catch(()=>{});
    return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
  }

  // 5) Quiet hours gate (optional)
  const inQuiet = isQuietNow(account?.timezone || process.env.TIMEZONE || 'America/New_York',
                             account?.quiet_start, account?.quiet_end);
  if (inQuiet) {
    return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
  }

  // 6) Build short conversation context (last N)
  const N = 8;
  const [recentIn, recentOut] = await Promise.all([
    supa.from('messages_in')
        .select('body, created_at')
        .eq('lead_id', lead?.id ?? '')
        .order('created_at', { ascending: false })
        .limit(N),
    supa.from('messages_out')
        .select('body, created_at')
        .eq('lead_id', lead?.id ?? '')
        .order('created_at', { ascending: false })
        .limit(N)
  ]);

  const history = [
    ...(recentIn.data || []).map(m => ({ role: 'user' as const, content: m.body })),
    ...(recentOut.data || []).map(m => ({ role: 'assistant' as const, content: m.body }))
  ].slice(-N).reverse();

  // 7) LLM call (OpenAI)
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // System prompt: brand, offering, tone, compliance, booking intent
  const brand = account?.brand || 'OutboundRevive';
  const booking = account?.booking_link || process.env.CAL_BOOKING_URL || 'https://cal.com/charlie-fregozo-v8sczt/secret';
  const systemPrompt = `
You are the SMS sales assistant for ${brand}. Objective: revive old leads and convert new ones.
Rules:
- Be friendly, concise (<= 2 sentences), and helpful.
- Always stay compliant: do not mislead, do not make medical/financial claims, no PHI/PII beyond what user provides.
- If user seems ready, include the booking link: ${booking}
- If user asks "who is this", briefly identify and value prop, then offer link.
- If the user objects on price, acknowledge and position ROI; offer link.
- If user texts STOP/UNSUBSCRIBE, do NOT reply (the server handles opt-out).
End each message with "Txt STOP to opt out" unless the user previously opted out.
Context from business owner:\n${(account?.prompt_system || '').slice(0, 1200)}
Examples:\n${JSON.stringify(account?.prompt_examples || [], null, 2).slice(0, 2000)}
  `.trim();

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...history,
    { role: 'user' as const, content: Body }
  ];

  let llmText = '';
  try {
    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.5,
      max_tokens: 140,
      messages
    });
    llmText = resp.choices?.[0]?.message?.content?.trim() || '';
  } catch (e) {
    console.error('[inbound] LLM error', e);
    llmText = ''; // fall back below
  }

  if (!llmText) {
    llmText = `Hey—it’s Charlie with ${brand}. Want a quick link to pick a time to chat? ${booking}`;
  }

  // Ensure opt-out tag
  if (!/opt out/i.test(llmText)) {
    llmText = `${llmText} Txt STOP to opt out`;
  }

  // 8) Send using your pipeline so it logs to messages_out and Twilio
  const sendRes = await fetch(`${process.env.PUBLIC_BASE_URL}/api/admin/leads/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': process.env.ADMIN_API_KEY!
    },
    body: JSON.stringify({ lead_id: lead?.id, body: llmText })
  });

  if (!sendRes.ok) {
    const t = await sendRes.text().catch(()=>'');
    console.error('[inbound] auto-send failed', sendRes.status, t);
  }

  // 9) IMPORTANT: return empty TwiML so Twilio DOES NOT send the canned message itself
  return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
}
