import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  // You can add your Supabase auth check here later
  const { lead_id, body } = await req.json();
  if (!lead_id || !body) {
    return NextResponse.json({ error: 'lead_id and body required' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, lead_id, body }, { status: 200 });
}
