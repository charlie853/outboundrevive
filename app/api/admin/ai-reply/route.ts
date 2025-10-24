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

// TODO: replace these with your real helpers
async function generateReply(_accountId: string, _body: string): Promise<string> {
  // Call OpenAI with your system/examples from account_settings here
  return "Hi — it’s OutboundRevive. We re-engage your leads with friendly SMS. Want a quick link to book a 10-min call?";
}
async function sendSmsViaTwilio(_args: {
  from: string; to: string; body: string; statusCallback: string
}): Promise<{ sid: string; status: string }> {
  // Your existing Twilio sending logic here; return { sid, status }
  return await client.messages.create({ to: String(from).trim(), messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!, body: reply, statusCallback: `${PUBLIC_BASE}/api/webhooks/twilio/status`, });
}
async function insertMessageOut(_args: {
  lead_id?: string; body: string; provider: string; provider_sid?: string; status?: string
}) { /* upsert in messages_out */ }

export async function POST(req: Request) {
  // 1) Admin auth FIRST
  const provided = req.headers.get('x-admin-key') || '';
  if (!process.env.ADMIN_API_KEY || provided !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // 2) Parse body
  const { from, to, body } = await req.json();
  if (!from || !to || !body) {
    return NextResponse.json({ ok: false, error: 'from/to/body required' }, { status: 400 });
  }

  // 3) Compute base (NO hard fail)
  const PUBLIC_BASE = resolvePublicBase(req);

  // 4) Generate reply from your per-account prompt
  // (Look up account by lead.phone == from, etc.)
  const accountId = 'your-account-id-here'; // replace with lookup
  const reply = await generateReply(accountId, body);

  // 5) Send via Twilio (status callback uses PUBLIC_BASE safely)
  const send_result = await sendSmsViaTwilio({
    from: to,                 // reply from your Twilio number
    to: from,                 // back to the user
    body: reply,
    statusCallback: `${PUBLIC_BASE}/api/webhooks/twilio/status`,
  });

  // 6) Persist messages_out
  await insertMessageOut({
    body: reply,
    provider: 'twilio',
    provider_sid: send_result.sid,
    status: send_result.status,
  });

  return NextResponse.json({ ok: true, reply, send_result, base_used: PUBLIC_BASE });
}
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import twilio from 'twilio';

// ---------- helpers ----------
function resolvePublicBase(req: Request) {
  const envBase =
    (process.env.PUBLIC_BASE && process.env.PUBLIC_BASE.trim()) ||
    (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim()) ||
    (process.env.NEXT_PUBLIC_BASE && process.env.NEXT_PUBLIC_BASE.trim());
  if (envBase) return envBase;
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

// ---------- main ----------
export async function POST(req: Request) {
  // --- Admin auth ---
  const provided = req.headers.get('x-admin-key') || '';
  if (!process.env.ADMIN_API_KEY || provided !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ ok:false, error:'unauthorized' }, { status: 401 });
  }

  // --- Parse body ---
  const { from, to, body } = await req.json();
  if (!from || !to || !body) {
    return NextResponse.json({ ok:false, error:'from/to/body required' }, { status: 400 });
  }

  const PUBLIC_BASE = resolvePublicBase(req);

  // --- Supabase (service role) ---
  const supa = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession:false } }
  );

  // --- Lead + account lookup (swap 'phone' -> 'phone_e164' if that’s your column) ---
  const { data: lead } = await supa
    .from('leads')
    .select('id, account_id, phone')
    .eq('phone', String(from).trim())
    .maybeSingle();

  const lead_id = (lead?.id as string) || undefined;
  const account_id = (lead?.account_id as string) || undefined;

  // --- Pull account prompts ---
  let prompt_system = 'You are a concise SMS assistant.';
  let prompt_examples: Array<{user:string;assistant:string}> = [];
  let booking_link: string | null = null;
  let brand: string | null = null;

  if (account_id) {
    const { data: acct } = await supa
      .from('account_settings')
      .select('prompt_system, prompt_examples, booking_link, brand')
      .eq('account_id', account_id)
      .maybeSingle();

    if (acct?.prompt_system) prompt_system = String(acct.prompt_system);
    if (acct?.prompt_examples) prompt_examples = acct.prompt_examples as any[];
    if (acct?.booking_link) booking_link = String(acct.booking_link);
    if (acct?.brand) brand = String(acct.brand);

    if (booking_link) {
      prompt_system = prompt_system.replaceAll('{{BOOKING_LINK}}', booking_link);
      prompt_examples = (prompt_examples||[]).map(ex => ({
        user: ex.user,
        assistant: String(ex.assistant).replaceAll('{{BOOKING_LINK}}', booking_link!)
      }));
    }
    if (brand) {
      prompt_system = prompt_system.replaceAll('{{BRAND}}', brand);
      prompt_examples = (prompt_examples||[]).map(ex => ({
        user: ex.user,
        assistant: String(ex.assistant).replaceAll('{{BRAND}}', brand!)
      }));
    }
  }

  // --- Build messages for OpenAI ---
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role:'system', content: prompt_system },
    ...(prompt_examples||[]).slice(0,10).flatMap(ex => [
      { role:'user' as const, content: ex.user },
      { role:'assistant' as const, content: ex.assistant },
    ]),
    { role:'user', content: String(body) },
  ];

  // --- OpenAI call (no RAG) ---
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
    temperature: 0.5,
    max_tokens: 180,
  });
  let reply = completion.choices?.[0]?.message?.content?.trim() || 'Thanks for reaching out!';
  if (reply.length > 300) reply = reply.slice(0,300);

  // --- Twilio real send (Messaging Service) ---
  const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID!;
  const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID!;

  const client = (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET)
    ? twilio(process.env.TWILIO_API_KEY_SID, process.env.TWILIO_API_KEY_SECRET, { accountSid: TWILIO_ACCOUNT_SID })
    : twilio(TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN!);

  const sent = await client.messages.create({
    to: String(from).trim(),
    messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID,
    body: reply,
    statusCallback: `${PUBLIC_BASE}/api/webhooks/twilio/status`,
  });

  // --- Insert messages_out (so UI shows it immediately) ---
  await supa.from('messages_out').insert({
    lead_id,
    body: reply,
    status: sent.status || 'queued',
    provider: 'twilio',
    provider_sid: sent.sid,
  });

  return NextResponse.json({
    ok: true,
    reply,
    send_result: { sid: sent.sid, status: sent.status },
    base_used: PUBLIC_BASE,
  });
}
