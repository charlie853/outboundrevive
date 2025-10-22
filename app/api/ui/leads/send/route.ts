import { NextResponse } from 'next/server';
export const runtime = 'nodejs';   // important

export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/ui/leads/send', method: 'GET' });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({ ok: true, route: '/api/ui/leads/send', method: 'POST', body });
}
