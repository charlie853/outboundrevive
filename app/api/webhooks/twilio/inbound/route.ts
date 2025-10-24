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
  // Twilio posts x-www-form-urlencoded
  const form = await req.formData();
  const From = String(form.get('From') || '');
  const To   = String(form.get('To')   || '');
  const Body = String(form.get('Body') || '');

  try {
    const base = resolvePublicBase(req);
    // fire-and-forget call to your admin route
    fetch(`${base}/api/admin/ai-reply`, {
      method: 'POST',
      headers: {
        'x-admin-key': process.env.ADMIN_API_KEY || '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: From, to: To, body: Body }),
      cache: 'no-store',
    }).catch(err => console.error('[twilio/inbound] forward error', err));
  } catch (e) {
    console.error('[twilio/inbound] error', e);
  }

  // Acknowledge Twilio immediately
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } });
}

export async function GET() {
  return NextResponse.json({ ok: true, ping: 'twilio inbound alive' });
}
