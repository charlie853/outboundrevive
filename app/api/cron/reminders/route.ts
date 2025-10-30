import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const adminHeader = (req.headers.get('x-admin-token') || '').trim();
    const adminWant = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
    if (!adminHeader || !adminWant || adminHeader !== adminWant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    const r = await fetch(`${base}/api/internal/followups/tick`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || ''),
      },
      body: JSON.stringify({ limit: 25, max_chars: 160 }),
    });
    const jr = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: true, delegated: true, result: jr });
  } catch (e: any) {
    console.error('cron/reminders error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
