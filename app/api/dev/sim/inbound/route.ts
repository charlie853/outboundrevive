import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Simulates an inbound SMS by POSTing form-encoded data to your real inbound webhook.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const from = url.searchParams.get('from') || '+15551234567';
  const body = url.searchParams.get('body') || 'YES';

  const form = new URLSearchParams();
  form.set('From', from);
  form.set('Body', body);
  form.set('MessageSid', 'SM_SIM_' + Math.random().toString(36).slice(2).toUpperCase());

  const r = await fetch(`${process.env.PUBLIC_BASE_URL}/api/webhooks/twilio/inbound`, {
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