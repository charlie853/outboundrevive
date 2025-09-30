import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function supabaseUserClientFromReq(req: NextRequest) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headers: Record<string, string> = {};
  if (m) headers.Authorization = `Bearer ${m[1]}`;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers }
  });
}

export async function POST(req: NextRequest) {
  try {
    const token = (process.env.ADMIN_TOKEN || process.env.ADMIN_API_KEY || '').trim();
    if (!token) return NextResponse.json({ error: 'ADMIN_TOKEN not set' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    let account_id: string | undefined = body.account_id || body.accountId;
    const limit = Number(body.limit || 50);
    if (!account_id) {
      const supabase = supabaseUserClientFromReq(req);
      const { data: ures } = await supabase.auth.getUser();
      account_id = (ures?.user?.user_metadata as any)?.account_id as string | undefined;
    }
    if (!account_id) return NextResponse.json({ error: 'missing account_id' }, { status: 400 });

    const r = await fetch(new URL('/api/internal/knowledge/embed', req.nextUrl.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ account_id, limit }),
    });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json(j, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: 'proxy_crash', detail: e?.message }, { status: 500 });
  }
}
