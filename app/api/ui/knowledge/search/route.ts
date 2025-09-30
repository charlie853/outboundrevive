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

export async function GET(req: NextRequest) {
  try {
    const token = (process.env.ADMIN_TOKEN || process.env.ADMIN_API_KEY || '').trim();
    if (!token) return NextResponse.json({ error: 'ADMIN_TOKEN not set' }, { status: 500 });

    const url = new URL(req.url);
    let account_id = url.searchParams.get('account_id') || url.searchParams.get('accountId') || '';
    const q = url.searchParams.get('q') || '';
    const k = url.searchParams.get('k') || '5';
    const debug = url.searchParams.get('debug') || '0';
    if (!account_id) {
      const supabase = supabaseUserClientFromReq(req);
      const { data: ures } = await supabase.auth.getUser();
      account_id = (ures?.user?.user_metadata as any)?.account_id || '';
    }
    const upstream = new URL('/api/internal/knowledge/search', req.nextUrl.origin);
    upstream.searchParams.set('account_id', account_id);
    upstream.searchParams.set('q', q);
    upstream.searchParams.set('k', k);
    if (debug) upstream.searchParams.set('debug', debug);

    const r = await fetch(upstream.toString(), {
      headers: { 'x-admin-token': token },
      cache: 'no-store'
    });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json(j, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: 'proxy_crash', detail: e?.message }, { status: 500 });
  }
}
