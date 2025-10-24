import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function asJsonResponse(r: Response, rawBody: string) {
  // If content-type looks like JSON, just pass through
  const ct = r.headers.get('Content-Type') || '';
  if (ct.includes('application/json')) {
    return new NextResponse(rawBody, {
      status: r.status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  // Otherwise wrap as JSON so the client never tries to parse "<!DOCTYPE ...>"
  return NextResponse.json(
    { error: 'Upstream returned non-JSON', status: r.status, body: rawBody.slice(0, 4000) },
    { status: r.status }
  );
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL('/api/settings', req.nextUrl.origin);
    const r = await fetch(url.toString(), { cache: 'no-store' });
    const body = await r.text();
    return asJsonResponse(r, body);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Proxy error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const url = new URL('/api/settings', req.nextUrl.origin);
    const token = (process.env.ADMIN_TOKEN || '').trim();
    if (!token) {
      return NextResponse.json({ error: 'Server missing ADMIN_TOKEN' }, { status: 500 });
    }

    const payload = await req.text(); // raw passthrough
    const r = await fetch(url.toString(), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': token
      },
      body: payload,
      cache: 'no-store'
    });

    const body = await r.text();
    return asJsonResponse(r, body);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Proxy error' }, { status: 500 });
  }
}
