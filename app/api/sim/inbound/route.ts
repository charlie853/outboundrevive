import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
  const url = new URL(req.url);
  const from = url.searchParams.get('from') || '';
  const body = url.searchParams.get('body') || '';

  if (!from || !body) {
    return NextResponse.json({ error: 'Provide ?from=+1555…&body=YES|PAUSE' }, { status: 400 });
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
