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
  return { sid: "SM_TEST", status: "accepted" };
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

