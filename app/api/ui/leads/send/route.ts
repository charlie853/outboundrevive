import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || '';
    const { lead_id, body } = await req.json().catch(() => ({}));

    if (!lead_id || !body || !String(body).trim()) {
      return NextResponse.json({ error: 'lead_id and body required' }, { status: 400 });
    }

    // Reuse central SMS pipeline for compliance, logging, and Twilio integration.
    const base = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const r = await fetch(`${base}/api/sms/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(auth ? { authorization: auth } : {})
      },
      body: JSON.stringify({
        leadIds: [String(lead_id)],
        message: String(body),
        replyMode: true
      })
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json(j, { status: r.status });
    return NextResponse.json(j);
  } catch (e: any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message || String(e) }, { status: 500 });
  }
}

