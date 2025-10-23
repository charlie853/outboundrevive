export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';

function xmlEscape(s: string) {
  return s.replace(/[<>&'"]/g, (c) => (
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '&' ? '&amp;' :
    c === '"' ? '&quot;' : '&apos;'
  ));
}

export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/webhooks/twilio/inbound', method: 'GET' });
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('application/x-www-form-urlencoded')) {
    // Twilio always sends x-www-form-urlencoded; still ACK to stop retries.
    return new NextResponse('<Response></Response>', { status: 200, headers: { 'Content-Type': 'text/xml' } });
  }

  const form = await req.formData();
  const From = (form.get('From') ?? '').toString();
  const Body = (form.get('Body') ?? '').toString();

  // Simple auto-reply; you can replace with your real logic later.
  const twiml =
    `<Response><Message>Thanks! We received: ${xmlEscape(Body)} — we'll follow up shortly.</Message></Response>`;

  return new NextResponse(twiml, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}
