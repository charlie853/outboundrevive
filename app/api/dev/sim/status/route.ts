import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sid = url.searchParams.get('sid') || 'SM_SIM_' + Math.random().toString(36).slice(2).toUpperCase();
  const status = url.searchParams.get('status') || 'delivered';
  const code = url.searchParams.get('code') || '';

  const form = new URLSearchParams();
  form.set('MessageSid', sid);
  form.set('MessageStatus', status);
  if (code) form.set('ErrorCode', code);

  const r = await fetch(`${process.env.PUBLIC_BASE_URL}/api/webhooks/twilio/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { 'Content-Type': r.headers.get('Content-Type') || 'text/plain' },
  });
}
