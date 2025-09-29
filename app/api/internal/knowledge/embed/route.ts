// app/api/internal/knowledge/embed/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { createHash } from 'crypto';   // <-- use Node crypto explicitly


// add this helper (name matches the call sites)
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession:false } }
);


// accept ADMIN_API_KEY or ADMIN_TOKEN
function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want =
    (process.env.ADMIN_API_KEY?.trim() || '') ||
    (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}


// simple char-based chunker (token-agnostic, good enough to start)
function chunkText(txt: string, size = 900, overlap = 150) {
  const out: string[] = [];
  let i = 0;
  while (i < txt.length) {
    const end = Math.min(txt.length, i + size);
    out.push(txt.slice(i, end));
    if (end === txt.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return out.map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const account_id: string = body.account_id || body.accountId;
    if (!account_id) {
      return NextResponse.json({ error: 'missing_params', need: ['account_id'] }, { status: 400 });
    }

    const {
      article_ids,           // optional: string[] of account_kb_articles.id
      limit = 50,            // max articles to process
      chunk_size = Number(process.env.KB_CHUNK_SIZE || 900),
      chunk_overlap = Number(process.env.KB_CHUNK_OVERLAP || 150),
      model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small'
    } = body || {};

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'embeddings_disabled', detail: 'Set OPENAI_API_KEY' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 1) Pull active articles for this account
    let q = db
      .from('account_kb_articles')
      .select('id,title,body,source_url,is_active')
      .eq('account_id', account_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (Array.isArray(article_ids) && article_ids.length > 0) {
      q = q.in('id', article_ids);
    }

    const { data: articles, error: aerr } = await q;
    if (aerr) return NextResponse.json({ error: 'db_error', detail: aerr.message }, { status: 500 });

    // 2) Build chunks; skip ones we’ve already embedded (by checksum)
    const allChunks: Array<{
      article_id: string;
      title: string | null;
      source_url: string | null;
      content: string;
      checksum: string;
    }> = [];

    for (const art of articles || []) {
      const text = (art as any).body || '';
      const parts = chunkText(text, chunk_size, chunk_overlap);
      for (const p of parts) {
        const checksum = sha256(p);
        allChunks.push({
          article_id: (art as any).id,
          title: (art as any).title || null,
          source_url: (art as any).source_url || null,
          content: p,
          checksum
        });
      }
    }

    if (allChunks.length === 0) {
      return NextResponse.json({ ok: true, account_id, inserted_chunks: 0, embedded: 0, skipped: 0, results: [] });
    }

    // 3) Find which checksums already exist for this account
    const checksums = [...new Set(allChunks.map(c => c.checksum))];
    const { data: existing, error: exErr } = await db
      .from('kb_chunks')
      .select('checksum')
      .eq('account_id', account_id)
      .in('checksum', checksums);

    if (exErr) return NextResponse.json({ error: 'db_error', detail: exErr.message }, { status: 500 });

    const existingSet = new Set((existing || []).map(r => (r as any).checksum));
    const newChunks = allChunks.filter(c => !existingSet.has(c.checksum));

    // 4) Insert new kb_chunks (dedup with unique(account_id, checksum))
   const { data: insChunks, error: insErr } = await db
  .from('kb_chunks')
  .upsert(
    newChunks.map(c => ({
      account_id,
      article_id: c.article_id,
      title: c.title,
      source_url: c.source_url,
      content: c.content,
      checksum: c.checksum,
    })), 
    { onConflict: 'account_id,checksum', ignoreDuplicates: true }
  )
  .select('id,checksum,content');

    if (insErr) return NextResponse.json({ error: 'db_error', detail: insErr.message }, { status: 500 });

    // 5) Compute embeddings for just-inserted chunks (batch)
    const toEmbed = insChunks || [];
    const BATCH = 96; // keep under token limits
    const embeddedRows: any[] = [];
    for (let i = 0; i < toEmbed.length; i += BATCH) {
      const batch = toEmbed.slice(i, i + BATCH);
      const inputs = batch.map((b: any) => b.content);
      const resp = await openai.embeddings.create({
        model,
        input: inputs
      });
      // write kb_embeddings
      const rows = batch.map((b: any, idx: number) => ({
        chunk_id: b.id,
        embedding: resp.data[idx].embedding
      }));
      const { error: eErr } = await db.from('kb_embeddings').upsert(rows, { onConflict: 'chunk_id' });
      if (eErr) return NextResponse.json({ error: 'db_error', detail: eErr.message }, { status: 500 });
      embeddedRows.push(...rows);
    }

    return NextResponse.json({
      ok: true,
      account_id,
      scanned_articles: (articles || []).length,
      inserted_chunks: (insChunks || []).length,
      embedded: embeddedRows.length,
      skipped: allChunks.length - newChunks.length,
      model
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'embed_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}