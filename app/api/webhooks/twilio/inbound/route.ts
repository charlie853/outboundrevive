import { supabaseAdmin } from '@/lib/supabaseServer';
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
  const form = await req.formData();
  const from = String(form.get('From') || '').trim();
  const to = String(form.get('To') || '').trim();
  const text = String(form.get('Body') || '').trim();

  const cleaned = text.replace(/\W/g,"").toUpperCase();
  const isStop = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REMOVE)$/.test(cleaned);
  const isHelp = /^HELP$/.test(cleaned);
  if (isStop) {
    try { await supabaseAdmin.from("global_suppressions").upsert({ phone: from }); } catch {}
    const xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>You are opted out and will not receive more messages. Reply START to resubscribe.</Message></Response>";
    return new Response(xml, { headers: { "Content-Type": "text/xml" } });
  }
  if (isHelp) {
    const xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>Help: Reply STOP to opt out. Msg&Data rates may apply.</Message></Response>";
    return new Response(xml, { headers: { "Content-Type": "text/xml" } });
  }

  const From = String(form.get('From') || '');
  const To   = String(form.get('To')   || '');
  const Body = String(form.get('Body') || '');

  try {
    const base = resolvePublicBase(req);
    const resp = await fetch(`${base}/api/admin/ai-reply`, {
      method: 'POST',
      headers: {
        'x-admin-key': process.env.ADMIN_API_KEY || '',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: From, to: To, body: Body }),
      cache: 'no-store',
    });

    let info: any = null;
    try { info = await resp.json(); } catch {}
    console.log('[twilio/inbound→admin] status=', resp.status, 'ok=', info?.ok, 'err=', info?.error);
  } catch (e: any) {
    console.error('[twilio/inbound] forward error', e?.message || e);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  return new Response(xml, { headers: { 'Content-Type': 'text/xml' } });
}

export async function GET() {
  return NextResponse.json({ ok: true, ping: 'twilio inbound alive' });
}
