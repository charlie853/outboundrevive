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
    // Accept both shapes: {account_id, pages:[...]} OR single doc {title, html|text|url}
    let account_id: string | undefined = body.account_id || body.accountId;
    let pages: Array<{ title?: string; text?: string; html?: string; url?: string }> = [];

    if (Array.isArray(body.pages)) {
      pages = body.pages;
    } else if (body.title || body.html || body.text || body.url) {
      pages = [{ title: body.title, html: body.html, text: body.text, url: body.url }];
    }

    if (!account_id) {
      const supabase = supabaseUserClientFromReq(req);
      const { data: ures } = await supabase.auth.getUser();
      account_id = (ures?.user?.user_metadata as any)?.account_id as string | undefined;
    }

    if (!account_id || pages.length === 0) {
      return NextResponse.json({ error: 'missing_params', need: ['account_id', 'pages[] or {title,html|text|url}'] }, { status: 400 });
    }

    let ok = 0; const results: any[] = []; const errors: any[] = [];
    for (const p of pages) {
      const payload: any = { account_id };
      if (p.url) payload.url = p.url;
      const html = p.html || p.text; // accept either, backend expects html
      if (html) payload.html = html;
      if (p.title) payload.title = p.title;

      const r = await fetch(new URL('/api/internal/knowledge/ingest', req.nextUrl.origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) { ok++; results.push(j); } else { errors.push(j); }
    }

    return NextResponse.json({ ok: true, account_id, count: pages.length, inserted: ok, results, errors });
  } catch (e: any) {
    return NextResponse.json({ error: 'proxy_crash', detail: e?.message }, { status: 500 });
  }
}
