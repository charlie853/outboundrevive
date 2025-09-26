import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession:false } }
);

export async function POST(req: NextRequest) {
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { account_id, items } = await req.json() as {
      account_id: string;
      items: Array<{ title: string; body: string; tags?: string[]; is_active?: boolean }>;
    };

    if (!account_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    // Normalize & clamp
    const rows = items.map(x => ({
      account_id,
      title: String(x.title || '').slice(0, 200),
      body: String(x.body || '').slice(0, 5000),
      tags: Array.isArray(x.tags) ? x.tags.slice(0, 10) : [],
      is_active: x.is_active !== false
    }));

    const { data, error } = await db.from('account_kb_articles').insert(rows).select('id,title,tags,is_active');
    if (error) {
      console.error('[KB UPSERT] error:', error);
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, inserted: data });
  } catch (e:any) {
    console.error('[KB UPSERT] exception:', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}