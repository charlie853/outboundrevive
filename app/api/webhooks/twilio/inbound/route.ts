export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

function xmlEscape(s: string) {
  return s.replace(/[<>&'"]/g, (c) => (
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '&' ? '&amp;' :
    c === '"' ? '&quot;' : '&apos;'
  ));
}

export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/webhooks/twilio/inbound', method: 'GET' });
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('application/x-www-form-urlencoded')) {
    // Twilio always sends x-www-form-urlencoded; still ACK to stop retries.
    return new NextResponse('<Response></Response>', { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }

  const form = await req.formData();
  const From = (form.get('From') ?? '').toString();
  const Body = (form.get('Body') ?? '').toString();

  // Simple auto-reply; you can replace with your real logic later.
  const twiml =
    `<Response><Message>Thanks! We received: ${xmlEscape(Body)} — we'll follow up shortly.</Message></Response>`;

  return new NextResponse(twiml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function formToObject(fd: FormData) {
  return Object.fromEntries(fd.entries()) as Record<string, string>;
}

export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/webhooks/twilio/inbound', method: 'GET' });
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('application/x-www-form-urlencoded')) {
    return NextResponse.json({ error: 'bad content-type' }, { status: 400 });
  }

  const form = await req.formData();
  const p = formToObject(form); // From, To, Body, MessageSid, etc.

  // Best-effort: write inbound to DB (won’t block the 200)
  try {
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    await sb.from('messages_in').insert({
      from_phone: p.From ?? null,
      to_phone: p.To ?? null,
      body: p.Body ?? null,
    });
  } catch {
    // swallow — webhook must still return 200
  }

  // Immediate ACK so Twilio doesn’t retry
  return new NextResponse('<Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

function normPhone(p: string) {
  if (!p) return '';
  const digits = p.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  // default to US if no + present
  return '+1' + digits.replace(/^1*/, '');
}

function withinHours(now = new Date()) {
  const tz = process.env.TIMEZONE || 'America/New_York';
  const start = process.env.QUIET_START || '09:00';
  const end = process.env.QUIET_END || '19:00';

  // Build local-time strings → minutes since midnight
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour12: false, timeZone: tz, hour: '2-digit', minute: '2-digit'
  });
  const [hh, mm] = fmt.format(now).split(':').map(Number);
  const cur = hh * 60 + mm;

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const s = sh * 60 + sm;
  const e = eh * 60 + em;

  // simple same-day window
  return cur >= s && cur < e;
}

function isStop(text: string) {
  return /\b(stop|unsubscribe|quit)\b/i.test(text || '');
}

function buildReply(body: string) {
  const b = (body || '').toLowerCase();
  const link = process.env.CAL_BOOKING_URL || 'https://cal.com/charlie-fregozo-v8sczt/secret';
  let msg =
    b.match(/\b(price|cost|expensive|how much)\b/)
      ? `Totally get it. We have a few options—want a quick rundown or just grab a time here? ${link}`
    : b.match(/\b(hours|open|close|when)\b/)
      ? `We’re typically available weekdays 9–5. Want to snag a time that works for you? ${link}`
    : b.match(/\b(book|schedule|time|link)\b/)
      ? `Perfect—here’s a direct link to book: ${link}`
    : b.match(/\b(who.*this|wrong number|not interested)\b/)
      ? `It’s OutboundRevive. We help revive cold/old leads via AI SMS. Want a 10-min demo? ${link}`
      : `Hey — it’s OutboundRevive. Want a quick link to pick a time? ${link}`;

  // Append compliance footer once
  if (!/Txt STOP to opt out/i.test(msg)) msg += ' Txt STOP to opt out';
  return msg;
}

export async function POST(req: NextRequest) {
  // Twilio posts form-encoded
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    // If something odd happens, still 200 so Twilio doesn’t retry
    return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
  }

  const From = normPhone(String(form.get('From') || ''));
  const To = normPhone(String(form.get('To') || ''));
  const Body = String(form.get('Body') || '').trim();

  // Init Supabase (service role)
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 1) Log inbound
    await supabase.from('messages_in').insert({
      from_phone: From || null,
      to_phone: To || null,
      body: Body || null,
    });

    // 2) STOP compliance
    if (isStop(Body)) {
      // Best practice is to send a one-time confirmation
      const client = twilio(
        process.env.TWILIO_API_KEY_SID!,
        process.env.TWILIO_API_KEY_SECRET!,
        { accountSid: process.env.TWILIO_ACCOUNT_SID! }
      );
      await client.messages.create({
        To: From,
        MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
        Body: `You’re opted out and won’t receive more messages.`,
      });
      // ACK Twilio
      return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
    }

    // 3) Find/Create lead by phone
    let leadId: string | null = null;
    if (From) {
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', From)
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        leadId = existing.id;
      } else {
        const { data: created } = await supabase
          .from('leads')
          .insert({ account_id: null, phone: From })
          .select('id')
          .single();
        leadId = created?.id ?? null;
      }
    }

    // 4) If outside hours → queue only, don’t SMS now
    if (!withinHours()) {
      const queuedBody = `(queued) ${buildReply(Body)}`;
      await supabase.from('messages_out').insert({
        lead_id: leadId,
        body: queuedBody,
        status: 'queued',
        provider: 'twilio',
        provider_sid: null,
      });
      return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
    }

    // 5) Send live reply via Twilio Messaging Service
    const client = twilio(
      process.env.TWILIO_API_KEY_SID!,
      process.env.TWILIO_API_KEY_SECRET!,
      { accountSid: process.env.TWILIO_ACCOUNT_SID! }
    );

    const reply = buildReply(Body);
    const sm = await client.messages.create({
      To: From,
      MessagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
      Body: reply,
    });

    // 6) Log outbound
    await supabase.from('messages_out').insert({
      lead_id: leadId,
      body: reply,
      status: 'queued',
      provider: 'twilio',
      provider_sid: sm.sid,
    });

  } catch (err) {
    console.error('[twilio/inbound] error', err);
    // Always ack Twilio so it doesn’t retry
  }

  // Final TwiML ack (empty)
  return new NextResponse('<Response></Response>', { headers: { 'Content-Type': 'text/xml' } });
}
