import { sendSms } from '@/lib/twilio';
// app/api/admin/ai-reply/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

function resolvePublicBase(req: Request) {
  const envBase =
    (process.env.PUBLIC_BASE && process.env.PUBLIC_BASE.trim()) ||
    (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim()) ||
    (process.env.NEXT_PUBLIC_BASE && process.env.NEXT_PUBLIC_BASE.trim());
  if (envBase) return envBase;
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

// Simple ping so we can see if the module loads without crashing
export async function GET() {
  return NextResponse.json({ ok: true, ping: 'admin/ai-reply alive' });
}

// Twilio send helper via fetch only (no SDK)
async function sendSmsViaTwilioFetch(args: {
  to: string;
  body: string;
  messagingServiceSid: string;
  statusCallback: string;
}) {
  const { to, body, messagingServiceSid, statusCallback } = args;

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const basic = (() => {
    if (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET) {
      return `${process.env.TWILIO_API_KEY_SID}:${process.env.TWILIO_API_KEY_SECRET}`;
    }
    return `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN!}`;
  })();

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(basic).toString('base64'),
      },
      body: new URLSearchParams({
        To: String(to).trim(),
        MessagingServiceSid: messagingServiceSid,
        Body: body,
        StatusCallback: statusCallback,
      }),
      cache: 'no-store',
    }
  );

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Twilio send failed: ${res.status} ${res.statusText} ${JSON.stringify(json)}`
    );
  }
  return { sid: String(json.sid), status: String(json.status || 'queued') };
}

export async function POST(req: Request) {
  try {
    console.log('[ai-reply] step1: auth');
    const provided = req.headers.get('x-admin-key') || '';
    if (!process.env.ADMIN_API_KEY || provided !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
    }

    console.log('[ai-reply] step2: parse');
    const { from, to, body } = await req.json();
    if (!from || !to || !body) {
      return NextResponse.json({ ok:false, error:'from/to/body required' }, { status:400 });
    }

    const PUBLIC_BASE = resolvePublicBase(req);

    console.log('[ai-reply] step3: imports');
    // Lazy imports to avoid load-time crashes
    const { createClient } = await import('@supabase/supabase-js');
    const { default: OpenAI } = await import('openai');

    console.log('[ai-reply] step4: supabase init');
    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession:false } }
    );

    console.log('[ai-reply] step5: lead lookup');
    const { data: lead } = await supa
      .from('leads')
      .select('id,account_id,phone')
      .eq('phone', String(from).trim())
      .maybeSingle();

    console.log('[ai-reply] step6: account prompts');
    let system = 'You are a concise SMS assistant.';
    let examples: Array<{user:string;assistant:string}> = [];
    let booking: string | null = null, brand: string | null = null;

    if (lead?.account_id) {
      const { data: acct } = await supa
        .from('account_settings')
        .select('prompt_system,prompt_examples,booking_link,brand')
        .eq('account_id', lead.account_id)
        .maybeSingle();

      if (acct?.prompt_system) system = String(acct.prompt_system);
      if (acct?.prompt_examples) examples = acct.prompt_examples as any[];
      if (acct?.booking_link) booking = String(acct.booking_link);
      if (acct?.brand) brand = String(acct.brand);

      if (booking) {
        system = system.replaceAll('{{BOOKING_LINK}}', booking);
        examples = examples.map(e => ({ user: e.user, assistant: String(e.assistant).replaceAll('{{BOOKING_LINK}}', booking!) }));
      }
      if (brand) {
        system = system.replaceAll('{{BRAND}}', brand);
        examples = examples.map(e => ({ user: e.user, assistant: String(e.assistant).replaceAll('{{BRAND}}', brand!) }));
      }
    }

    console.log('[ai-reply] step7: openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const messages: any[] = [
      { role:'system', content: system },
      ...examples.slice(0,10).flatMap(e => [{ role:'user', content:e.user }, { role:'assistant', content:e.assistant }]),
      { role:'user', content: String(body) },
    ];
    const cmp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages, temperature: 0.5, max_tokens: 180
    });
    let reply = cmp.choices?.[0]?.message?.content?.trim() || 'Thanks for reaching out!';
    if (reply.length > 300) reply = reply.slice(0,300);

    console.log('[ai-reply] step8: twilio send (fetch)');
    const send_result = await sendSmsViaTwilioFetch({
      to: String(from).trim(),
      body: reply,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
      statusCallback: `${PUBLIC_BASE}/api/webhooks/twilio/status`,
    });

    console.log('[ai-reply] step9: persist');
    await supa.from('messages_out').insert({
      lead_id: lead?.id,
      body: reply,
      status: send_result.status || 'queued',
      provider: 'twilio',
      provider_sid: send_result.sid,
    });

    console.log('[ai-reply] done');
    return NextResponse.json({ ok:true, reply, send_result, base_used: PUBLIC_BASE });
  } catch (e:any) {
    console.error('[admin/ai-reply] error', e);
    return NextResponse.json({ ok:false, error: e?.message || 'internal-error' }, { status:500 });
  }
}
