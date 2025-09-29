// app/api/internal/knowledge/list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const db = createClient(
  process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession:false } }
);

function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want =
    (process.env.ADMIN_API_KEY?.trim() || '') ||
    (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const account_id = url.searchParams.get('account_id') || '';
  const q = (url.searchParams.get('q') || '').trim();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));

  if (!account_id) return NextResponse.json({ error: 'missing_params', need: ['account_id'] }, { status: 400 });

  let query = db
    .from('account_kb_articles')
    .select('id,title,source_url,is_active,tags,created_at,updated_at', { count: 'exact' })
    .eq('account_id', account_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%,tags.cs.{${q}}`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, account_id, count, limit, offset, rows: data });
}

export async function PATCH(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const account_id: string = body.account_id || body.accountId;
    const id: string | null = body.id || null;
    const source_url: string | null = body.source_url || null;
    const is_active: boolean | null = typeof body.is_active === 'boolean' ? body.is_active : null;

    if (!account_id || (!id && !source_url) || is_active === null) {
      return NextResponse.json({ error: 'missing_params', need: ['account_id', 'id|source_url', 'is_active:boolean'] }, { status: 400 });
    }

    let q = db.from('account_kb_articles').update({ is_active })
      .eq('account_id', account_id);

    if (id) q = q.eq('id', id);
    if (!id && source_url) q = q.eq('source_url', source_url);

    const { error } = await q;
    if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'patch_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}