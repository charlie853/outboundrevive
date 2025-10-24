export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  const form = await req.formData();
  const From = String(form.get('From') || '');
  const To   = String(form.get('To')   || '');
  const Body = String(form.get('Body') || '');

  const supa = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Minimal: log inbound (adjust columns to your schema)
  try {
    await supa.from('messages_in').insert({
      from_phone: From,
      to_phone: To,
      body: Body
    });
  } catch (e) {
    console.error('[twilio/inbound] insert error', e);
  }

  // Skip AI worker on STOP/UNSUBSCRIBE/QUIT
  if (/\b(stop|unsubscribe|quit)\b/i.test(Body)) {
    return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
  }

  // Kick the AI reply worker (non-blocking)
  try {
    const PUBLIC_BASE = resolvePublicBase(req);
    const ADMIN_API_KEY = process.env.ADMIN_API_KEY!;
    fetch(`${PUBLIC_BASE}/api/admin/ai-reply`, {
      method: 'POST',
      headers: {
        'x-admin-key': ADMIN_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: From, to: To, body: Body })
    }).catch((e) => console.error('[twilio/inbound] ai-reply kick error', e));
  } catch (e) {
    console.error('[twilio/inbound] ai-reply kick threw', e);
  }

  // Ack Twilio immediately (empty TwiML)
  return new NextResponse('<Response/>', { headers: { 'Content-Type': 'text/xml' } });
}
// app/api/webhooks/twilio/inbound/route.ts
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

export async function POST(req: Request) {
  // Twilio sends x-www-form-urlencoded
  const form = await req.formData();
  const From = String(form.get('From') || '');
  const To   = String(form.get('To')   || '');
  const Body = String(form.get('Body') || '');

  // Fire your internal admin route (don’t await; reply fast to Twilio)
  try {
    const base = resolvePublicBase(req);
    // fire-and-forget; if it throws synchronously we catch, but we don't await the body
    fetch(`${base}/api/admin/ai-reply`, {
      method: 'POST',
      headers: {
        'x-admin-key': process.env.ADMIN_API_KEY || '',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ from: From, to: To, body: Body }),
      cache: 'no-store',
    }).catch(err => console.error('[twilio/inbound] forward error', err));
  } catch (e) {
    console.error('[twilio/inbound] error', e);
  }

  // Always ack Twilio immediately; we send the real reply via the admin route
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } });
}

export async function GET() {
  return NextResponse.json({ ok: true, ping: 'twilio inbound alive' });
}
