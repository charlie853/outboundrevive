// app/api/internal/knowledge/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession:false } }
);

// auth (same as elsewhere)
function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want =
    (process.env.ADMIN_API_KEY?.trim() || '') ||
    (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

// table-exists helper
async function tableExists(name: string) {
  const { error } = await db.from(name as any).select('*', { head: true, count: 'exact' }).limit(1);
  // @ts-ignore
  if (error?.code === '42P01') return false;
  return true;
}

function makeExcerpt(content: string, q: string, radius = 120) {
  const idx = content.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return content.slice(0, radius * 2) + (content.length > radius * 2 ? '…' : '');
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + q.length + radius);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const account_id = url.searchParams.get('account_id') || url.searchParams.get('accountId') || '';
  const q = (url.searchParams.get('q') || '').trim();
  const k = Math.max(1, Math.min(20, Number(url.searchParams.get('k') || 5)));

  if (!account_id || !q) {
    return NextResponse.json({ error: 'missing_params', need: ['account_id', 'q'] }, { status: 400 });
  }

  try {
    const hasVectors = await tableExists('kb_embeddings');
    const useVectors = hasVectors && !!process.env.OPENAI_API_KEY;

    if (useVectors) {
      // 1) embed query
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
      const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
      const emb = await openai.embeddings.create({ model, input: q });
      const qvec = emb.data[0].embedding;

      // 2) call RPC to rank by cosine distance
      const { data, error } = await db.rpc('kb_search_chunks', {
        aid: account_id,
        query_embedding: qvec as any,
        match_count: k * 3
      });

      if (error) {
        // fall back on text if RPC fails
        console.warn('kb_search_chunks failed; falling back to text:', error.message);
      } else {
        const rows = (data || []).map((r: any) => ({
          id: r.chunk_id,
          title: r.title,
          url: r.source_url,
          score: 1 / (1 + (r.distance ?? 0)), // higher is better
          excerpt: makeExcerpt(r.content || '', q),
          source: 'kb_vectors'
        }))
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
        .slice(0, k);

        if (rows.length > 0) {
          return NextResponse.json({ ok: true, account_id, q, k, rows, used: 'vectors' });
        }
      }
    }

    // ── Fallback: text search (account_kb_articles)
    const { data, error } = await db
      .from('account_kb_articles')
      .select('id,title,body,source_url,is_active,tags')
      .eq('account_id', account_id)
      .eq('is_active', true)
      .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
      .limit(k * 3);

    if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });

    const ranked = (data || [])
      .map((row) => {
        const body = (row as any).body || '';
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = body.match(re)?.length || 0;
        return {
          id: (row as any).id,
          title: (row as any).title,
          url: (row as any).source_url,
          score: matches || 1,
          excerpt: makeExcerpt(body, q),
          tags: (row as any).tags || [],
          source: 'account_kb_articles'
        };
      })
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, k);

    return NextResponse.json({ ok: true, account_id, q, k, rows: ranked, used: 'text' });
  } catch (e: any) {
    return NextResponse.json({ error: 'search_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}
