import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
  const url = new URL(req.url);

  // Handle '+' turning into space in querystrings.
  let from = (url.searchParams.get('from') || '').trim();
  // If it came in as plain digits or space+digits, make it E.164.
  const digits = from.replace(/\D/g, '');
  if (!from.startsWith('+') && /^\d{10,15}$/.test(digits)) {
    from = '+' + digits;
  }

  const body = (url.searchParams.get('body') || '').trim();

  if (!from || !body) {
    return NextResponse.json({ error: 'Provide ?from=+1555…&body=YES|STOP' }, { status: 400 });
  }

  const form = new URLSearchParams({ From: from, Body: body });
  const r = await fetch(`${base}/api/webhooks/twilio/inbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'Content-Type': r.headers.get('Content-Type') || 'text/plain' }
  });
}