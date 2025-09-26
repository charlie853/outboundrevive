import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    const { message, replyMode = true } = await req.json();

    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const adminToken = process.env.ADMIN_TOKEN || '';
    if (!adminToken) {
      return NextResponse.json({ error: 'Server missing ADMIN_TOKEN' }, { status: 500 });
    }

    const origin = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const r = await fetch(`${origin}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': adminToken,
      },
      body: JSON.stringify({
        leadIds: [id],
        message,
        replyMode, // true = treat as reply (bypass quiet hours / 24h cap), still honors suppression/consent
      }),
    });

    const j = await r.json();
    if (!r.ok) return NextResponse.json(j, { status: r.status });
    return NextResponse.json(j);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Invalid JSON' }, { status: 400 });
  }
}