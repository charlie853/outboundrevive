// app/api/internal/knowledge/answer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const db = createClient(
  process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ── auth helper (accept ADMIN_API_KEY or ADMIN_TOKEN)
function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want =
    (process.env.ADMIN_API_KEY?.trim() || '') ||
    (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

// 42P01 => table missing
async function tableExists(name: string) {
  const { error } = await db.from(name as any).select('*', { head: true, count: 'exact' }).limit(1);
  // @ts-ignore
  if (error?.code === '42P01') return false;
  return true;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeExcerpt(content: string, q: string, radius = 160) {
  const txt = (content || '').replace(/\s+/g, ' ').trim();
  const idx = txt.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return txt.slice(0, radius * 2) + (txt.length > radius * 2 ? '…' : '');
  const start = Math.max(0, idx - radius);
  const end = Math.min(txt.length, idx + q.length + radius);
  return (start > 0 ? '…' : '') + txt.slice(start, end) + (end < txt.length ? '…' : '');
}

function keyTerms(q: string, max = 3) {
  const stop = new Set(['the','and','for','with','you','your','are','our','about','what','when','where','how','do','does','offer','offers','we','can']);
  return (q.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(w => w.length >= 3 && !stop.has(w))
    .slice(0, max);
}

function scoreByTerms(text: string, terms: string[], fallbackQ: string) {
  const content = text || '';
  if (!terms.length) {
    const re = new RegExp(escapeRegex(fallbackQ), 'gi');
    return (content.match(re)?.length || 0) || 1;
  }
  return terms.reduce((s, t) => {
    const re = new RegExp(escapeRegex(t), 'gi');
    return s + (content.match(re)?.length || 0);
  }, 0) || 1;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const account_id: string = body.account_id || body.accountId || '';
    const q: string = (body.q || '').trim();
    const k = Math.max(1, Math.min(20, Number(body.k || 3)));
    const debug = String(body.debug || '').toLowerCase() === '1';

    const terms = keyTerms(q);

    if (!account_id || !q) {
      return NextResponse.json({ error: 'missing_params', need: ['account_id', 'q'] }, { status: 400 });
    }

    const needle = `%${q}%`;
    const re = new RegExp(escapeRegex(q), 'gi');

    // 1) Prefer knowledge_pages (if present)
    let rows: Array<{ id: string; title: string | null; url: string | null; content: string; source: 'knowledge_pages' | 'account_kb_articles' }> = [];
    const hasKP = await tableExists('knowledge_pages');

    if (hasKP) {
      const { data: kp, error: kpErr } = await db
        .from('knowledge_pages')
        .select('id,title,content,url,status')
        .eq('account_id', account_id)
        .eq('status', 'approved')
        .ilike('content', needle)
        .limit(k * 6);

      if (kpErr) {
        return NextResponse.json({ error: 'db_error', detail: kpErr.message }, { status: 500 });
      }

      rows = (kp || []).map((r: any) => ({
        id: r.id,
        title: r.title ?? 'Untitled',
        url: r.url ?? null,
        content: r.content || '',
        source: 'knowledge_pages' as const
      }));

      // Keyword fallback if phrase match found nothing
      if (rows.length === 0 && terms.length) {
        const orExpr = terms.map(t => `content.ilike.%${t}%`).join(',');
        const { data: kp2, error: kpErr2 } = await db
          .from('knowledge_pages')
          .select('id,title,content,url,status')
          .eq('account_id', account_id)
          .eq('status', 'approved')
          .or(orExpr)
          .limit(k * 6);
        if (kpErr2) {
          return NextResponse.json({ error: 'db_error', detail: kpErr2.message }, { status: 500 });
        }
        rows = (kp2 || []).map((r: any) => ({
          id: r.id,
          title: r.title ?? 'Untitled',
          url: r.url ?? null,
          content: r.content || '',
          source: 'knowledge_pages' as const
        }));
      }
    }

    // 2) Fallback to account_kb_articles if no KP hits
    if (rows.length === 0) {
      // Do TWO simple queries instead of `.or(...)`, then merge/dedupe
      const [byTitle, byBody] = await Promise.all([
        db.from('account_kb_articles')
          .select('id,title,body,source_url,is_active')
          .eq('account_id', account_id)
          .eq('is_active', true)
          .ilike('title', needle)
          .limit(k * 6),
        db.from('account_kb_articles')
          .select('id,title,body,source_url,is_active')
          .eq('account_id', account_id)
          .eq('is_active', true)
          .ilike('body', needle)
          .limit(k * 6),
      ]);

      if (byTitle.error) {
        return NextResponse.json({ error: 'db_error', detail: byTitle.error.message }, { status: 500 });
      }
      if (byBody.error) {
        return NextResponse.json({ error: 'db_error', detail: byBody.error.message }, { status: 500 });
      }

      const map = new Map<string, any>();
      (byTitle.data || []).forEach((r: any) => map.set(r.id, r));
      (byBody.data || []).forEach((r: any) => map.set(r.id, r));

      rows = Array.from(map.values()).map((r: any) => ({
        id: r.id,
        title: r.title ?? 'Untitled',
        url: r.source_url ?? null,
        content: r.body || '',
        source: 'account_kb_articles' as const
      }));

      // Keyword fallback if phrase matches found nothing
      if (rows.length === 0 && terms.length) {
        const ors = terms.flatMap(t => [
          `title.ilike.%${t}%`,
          `body.ilike.%${t}%`
        ]).join(',');
        const { data: kb2, error: kbErr2 } = await db
          .from('account_kb_articles')
          .select('id,title,body,source_url,is_active')
          .eq('account_id', account_id)
          .eq('is_active', true)
          .or(ors)
          .limit(k * 6);
        if (kbErr2) {
          return NextResponse.json({ error: 'db_error', detail: kbErr2.message }, { status: 500 });
        }
        rows = (kb2 || []).map((r: any) => ({
          id: r.id,
          title: r.title ?? 'Untitled',
          url: r.source_url ?? null,
          content: r.body || '',
          source: 'account_kb_articles' as const
        }));
      }
    }

    // 3) Rank & build contexts
    const ranked = rows
      .map(r => ({ ...r, score: scoreByTerms(r.content, terms, q) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    const excerptAnchor = terms[0] ?? q;
    const contexts = ranked.map(r => ({
      id: r.id,
      title: r.title,
      source: r.url,
      excerpt: makeExcerpt(r.content, excerptAnchor),
      table: r.source,
    }));

    const prompt = [
      `You are an assistant answering on behalf of a client.`,
      `Use only the snippets in CONTEXTS. If the answer isn’t present, say you don’t know and suggest asking a human.`,
      ``,
      `QUESTION: ${q}`,
      ``,
      `CONTEXTS:`,
      ...contexts.map((c, i) => `${i + 1}. ${c.title}${c.source ? ` (${c.source})` : ''}: ${c.excerpt}`)
    ].join('\n');

    const resp: any = { ok: true, account_id, q, k, contexts, prompt };
    if (debug) resp.debug = { hasKP, total_hits: rows.length };
    return NextResponse.json(resp);
  } catch (e: any) {
    return NextResponse.json({ error: 'answer_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}