import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  if (!token) {
    return NextResponse.json({ error: 'ADMIN_TOKEN not set on server' }, { status: 500 });
  }
  const base =
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    `${req.nextUrl.origin}`;

  try {
    const body = await req.json();
    const r = await fetch(`${base}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token,
      },
      body: JSON.stringify(body),
    });

    const json = await r.json().catch(() => ({}));
    if (!r.ok) {
      return NextResponse.json(json || { error: 'Send failed' }, { status: r.status });
    }
    return NextResponse.json(json);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}