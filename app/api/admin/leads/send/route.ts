import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const adminKey = req.headers.get('x-admin-key') ?? '';
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return new NextResponse('forbidden', { status: 403 });
  }

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return new NextResponse('bad json', { status: 400 });
  }

  const { lead_id, body } = payload ?? {};
  if (!lead_id || !body) {
    return NextResponse.json({ error: 'lead_id and body required' }, { status: 400 });
  }

  // TODO: plug your Supabase lookup + Twilio send here
  // return NextResponse.json({ ok: true, lead_id, body }, { status: 200 });

  // Temporary echo so we can verify the route works in PROD first:
  return NextResponse.json({ ok: true, lead_id, body }, { status: 200 });
}
