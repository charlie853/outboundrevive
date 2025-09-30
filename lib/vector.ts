import OpenAI from 'openai';
import { supabaseAdmin } from './supabaseServer';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const model = process.env.EMBEDDING_MODEL || process.env.VEC_EMBED_MODEL || 'text-embedding-3-small';
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Mock: return zero vectors to keep flow unblocked in dev
    return texts.map(() => Array(1536).fill(0));
  }
  const client = new OpenAI({ apiKey: key });
  const resp = await client.embeddings.create({ model, input: texts });
  return resp.data.map((d) => d.embedding as unknown as number[]);
}

export async function semanticSearch(opts: { accountId: string; query: string; k: number }): Promise<Array<{ id: string; title: string | null; score: number; chunk: string }>> {
  const { accountId, query } = opts;
  const k = Math.max(1, Math.min(50, opts.k || 5));

  // 1) Embed query
  const [vec] = await embedTexts([query]);

  // 2) Try RPC (preferred)
  try {
    const { data, error } = await supabaseAdmin.rpc('kb_search_chunks', {
      aid: accountId,
      query_embedding: vec as unknown as any,
      match_count: k * 3
    });
    if (!error && Array.isArray(data) && data.length) {
      const rows = (data as any[])
        .map((r) => ({ id: r.chunk_id || r.id, title: r.title ?? null, score: 1 / (1 + (r.distance ?? 0)), chunk: r.content || r.chunk || '' }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
      return rows;
    }
  } catch (_) {}

  // 3) Fallback: call internal search endpoint (returns excerpt not true chunk)
  try {
    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
    const admin = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
    const u = new URL('/api/internal/knowledge/search', base);
    u.searchParams.set('account_id', accountId);
    u.searchParams.set('q', query);
    u.searchParams.set('k', String(k));
    u.searchParams.set('debug', '1');
    const r = await fetch(u.toString(), { headers: { 'x-admin-token': admin } });
    const j = await r.json();
    const rows = (j.rows || []).map((m: any) => ({ id: m.id, title: m.title || null, score: typeof m.score === 'number' ? m.score : 1, chunk: m.excerpt || '' }));
    return rows;
  } catch (_) {
    return [];
  }
}

