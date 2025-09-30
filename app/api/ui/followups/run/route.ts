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
    // Merge caller body with derived account_id (from bearer) if missing
    const raw = await req.text();
    let bodyIn: any = {};
    try { bodyIn = raw ? JSON.parse(raw) : {}; } catch { bodyIn = {}; }

    if (!bodyIn.account_id && !bodyIn.accountId) {
      const supabase = supabaseUserClientFromReq(req);
      const { data: ures } = await supabase.auth.getUser();
      const acc = (ures?.user?.user_metadata as any)?.account_id as string | undefined;
      if (acc) bodyIn.account_id = acc;
    }

    const payload = JSON.stringify(bodyIn);
    const r = await fetch(new URL('/api/internal/followups/run', req.nextUrl.origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: payload,
    });
    const body = await r.text();
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      return new NextResponse(body, { status: r.status, headers: { 'content-type': 'application/json' } });
    }
    return NextResponse.json({ status: r.status, body: body.slice(0, 4000) }, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: 'proxy_crash', detail: e?.message }, { status: 500 });
  }
}
