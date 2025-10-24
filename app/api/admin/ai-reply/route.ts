// app/api/admin/ai-reply/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import twilio from 'twilio';

function resolvePublicBase(req: Request) {
  const envBase =
    (process.env.PUBLIC_BASE && process.env.PUBLIC_BASE.trim()) ||
    (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim()) ||
    (process.env.NEXT_PUBLIC_BASE && process.env.NEXT_PUBLIC_BASE.trim());
  if (envBase) return envBase;
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

export async function POST(req: Request) {
  try {
    // --- Admin auth ---
    const provided = req.headers.get('x-admin-key') || '';
    if (!process.env.ADMIN_API_KEY || provided !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ ok:false, error:'unauthorized' }, { status:401 });
    }

    // --- Parse ---
    const { from, to, body } = await req.json();
    if (!from || !to || !body) {
      return NextResponse.json({ ok:false, error:'from/to/body required' }, { status:400 });
    }

    const PUBLIC_BASE = resolvePublicBase(req);

    // --- Supabase ---
    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession:false } }
    );

    // lead/account lookup (swap 'phone' -> 'phone_e164' if needed)
    const { data: lead } = await supa
      .from('leads')
      .select('id,account_id,phone')
      .eq('phone', String(from).trim())
      .maybeSingle();

    const { data: acct } = lead?.account_id
      ? await supa.from('account_settings')
          .select('prompt_system,prompt_examples,booking_link,brand')
          .eq('account_id', lead.account_id)
          .maybeSingle()
      : { data: null as any };

    // prompts (no RAG)
    let system = acct?.prompt_system || 'You are a concise SMS assistant.';
    let examples: Array<{user:string;assistant:string}> = (acct?.prompt_examples as any[]) || [];
    if (acct?.booking_link) {
      system = system.replaceAll('{{BOOKING_LINK}}', String(acct.booking_link));
      examples = examples.map(e => ({
        user: e.user,
        assistant: String(e.assistant).replaceAll('{{BOOKING_LINK}}', String(acct!.booking_link))
      }));
    }
    if (acct?.brand) {
      system = system.replaceAll('{{BRAND}}', String(acct.brand));
      examples = examples.map(e => ({
        user: e.user,
        assistant: String(e.assistant).replaceAll('{{BRAND}}', String(acct!.brand))
      }));
    }

    // OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role:'system', content: system },
      ...examples.slice(0,10).flatMap(e => [
        { role:'user' as const, content: e.user },
        { role:'assistant' as const, content: e.assistant }
      ]),
      { role:'user', content: String(body) },
    ];
    const cmp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0.5,
      max_tokens: 180,
    });
    let reply = cmp.choices?.[0]?.message?.content?.trim() || 'Thanks for reaching out!';
    if (reply.length > 300) reply = reply.slice(0,300);

    // Twilio send
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const client = (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET)
      ? twilio(process.env.TWILIO_API_KEY_SID, process.env.TWILIO_API_KEY_SECRET, { accountSid })
      : twilio(accountSid, process.env.TWILIO_AUTH_TOKEN!);

    const sent = await client.messages.create({
      to: String(from).trim(),
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
      body: reply,
      statusCallback: `${PUBLIC_BASE}/api/webhooks/twilio/status`,
    });

    // Persist to messages_out
    await supa.from('messages_out').insert({
      lead_id: lead?.id,
      body: reply,
      status: sent.status || 'queued',
      provider: 'twilio',
      provider_sid: sent.sid,
    });

    return NextResponse.json({ ok:true, reply, send_result:{ sid: sent.sid, status: sent.status }, base_used: PUBLIC_BASE });
  } catch (e:any) {
    console.error('[admin/ai-reply] error', e);
    return NextResponse.json({ ok:false, error: e?.message || 'internal-error' }, { status:500 });
  }
}
