import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  if (!token) return NextResponse.json({ error: 'ADMIN_TOKEN not set' }, { status: 500 });

  const body = await req.text();
  const r = await fetch(`${base}/api/admin/unsuppress`, {
    method: 'POST',
    headers: { 'x-admin-token': token, 'Content-Type': 'application/json' },
    body,
  });
  const json = await r.json().catch(() => ({}));
  return NextResponse.json(json, { status: r.status });
}