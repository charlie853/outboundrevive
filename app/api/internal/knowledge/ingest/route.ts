// app/api/internal/knowledge/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // avoid static optimization during dev

const db = createClient(
  process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession:false } }
);

// ── auth helper (accept ADMIN_API_KEY or ADMIN_TOKEN)
function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want =
    (process.env.ADMIN_API_KEY?.trim() || '') ||
    (process.env.ADMIN_TOKEN?.trim() || '');
  // Optional one-liner for quick debugging (disable before commit)
  if (process.env.DEBUG_AUTH === '1') {
    const h = (s: string) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 10);
    console.log('[knowledge.ingest auth]', {
      has_ADMIN_API_KEY: !!process.env.ADMIN_API_KEY,
      has_ADMIN_TOKEN: !!process.env.ADMIN_TOKEN,
      want_hash: want ? h(want) : null,
      got_hash: got ? h(got) : null,
    });
  }
  return !!want && got === want;
}

// --- helpers ---------------------------------------------------------------
function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function cleanHtmlToText(html: string): { title?: string; text: string } {
  const $ = cheerio.load(html || '');
  const title = $('title').first().text().trim() || undefined;

  $('script,noscript,style,svg,iframe,header,footer,nav').remove();
  $('[role="navigation"], .nav, .menu, .footer, .header').remove();

  const text = $('body').text().replace(/\s+/g, ' ').trim();
  return { title, text };
}

type PageInput = {
  url?: string | null;
  html?: string | null;
  text?: string | null;
  title?: string | null;
  tags?: string[] | null;
  status?: 'approved'|'hidden'|'pending' | null;
  meta?: Record<string, any> | null;
  source_url?: string | null;
};

async function tableExists(name: string) {
  const { error } = await db.from(name as any).select('*', { count: 'exact', head: true }).limit(1);
  // @ts-ignore PostgREST code
  if ((error as any)?.code === '42P01') return false;
  return true;
}

async function upsertAccountKbArticle(input: {
  account_id: string;
  title: string;
  body: string;
  tags: string[];
  source_url: string | null;
  is_active: boolean;
}) {
  const { account_id, source_url } = input;

  if (source_url) {
    const { data: existing, error: selErr } = await db
      .from('account_kb_articles')
      .select('id')
      .eq('account_id', account_id)
      .eq('source_url', source_url)
      .limit(1)
      .maybeSingle();

    if (!selErr && existing?.id) {
      const { error: updErr } = await db
        .from('account_kb_articles')
        .update({
          title: input.title,
          body: input.body,
          tags: input.tags,
          is_active: input.is_active
        })
        .eq('id', existing.id);

      if (updErr) return { error: updErr, id: null, op: 'update' as const };
      return { id: existing.id, op: 'update' as const };
    }
  }

  const { data: ins, error } = await db
    .from('account_kb_articles')
    .insert({
      account_id: input.account_id,
      title: input.title,
      body: input.body,
      tags: input.tags,
      source_url: input.source_url,
      is_active: input.is_active
    })
    .select('id')
    .single();

  if (error) return { error, id: null, op: 'insert' as const };
  return { id: ins?.id as string, op: 'insert' as const };
}

export async function POST(req: NextRequest) {
  // ✅ unified admin check
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const payload = await req.json();

    const account_id: string = payload.account_id || payload.accountId;
    if (!account_id) {
      return NextResponse.json({ error: 'missing_params', need: ['account_id'] }, { status: 400 });
    }
    // Require either single (url|html|text) or pages[] batch input
    const hasSingle = !!(payload.url || payload.html || payload.text);
    const hasPages  = Array.isArray(payload.pages) && payload.pages.length > 0;
    if (!hasSingle && !hasPages) {
      return NextResponse.json(
        { error: 'missing_params', need: ['url|html|text', 'or', 'pages[]'] },
        { status: 400 }
      );
    }

    const pages: PageInput[] = Array.isArray(payload.pages)
      ? payload.pages
      : [{
          url: payload.url,
          html: payload.html,
          text: payload.text,
          title: payload.title,
          tags: Array.isArray(payload.tags) ? payload.tags : undefined,
          status: payload.status,
          source_url: payload.source_url
        }];

    const hasKnowledgePages = await tableExists('knowledge_pages');
    const hasKnowledgeSources = await tableExists('knowledge_sources');

    let sourceId: string | null = null;
    if (hasKnowledgeSources) {
      const { data: src } = await db
        .from('knowledge_sources')
        .insert({
          account_id,
          type: 'text',
          title: payload.ingest_title || 'ingest',
          meta: payload.meta || null
        })
        .select('id')
        .single();
      sourceId = src?.id ?? null;
    }

    const results: Array<{
      op: 'insert'|'update'|'skip';
      article_id?: string;
      url?: string | null;
      title: string;
      checksum: string;
      mirrored?: boolean;
      error?: string;
    }> = [];

    for (const p of pages) {
      const url = (p.url || null) as string | null;
      const htmlIn = (p.html || null) as string | null;
      const textIn = (p.text || null) as string | null;
      const tags = Array.isArray(p.tags) ? p.tags as string[] : [];
      const status = (p.status || 'approved') as 'approved'|'hidden'|'pending';
      const is_active = status !== 'hidden';
      let source_url: string | null = (p.source_url ?? url ?? null) as string | null;

      if (!url && !htmlIn && !textIn) {
        results.push({ op: 'skip', title: 'Missing content', checksum: '', url: null, error: 'no url|html|text' });
        continue;
      }

      let rawHtml = htmlIn || '';
      if (!rawHtml && url) {
        try {
          const r = await fetch(url, { redirect: 'follow' });
          if (r.ok) rawHtml = await r.text();
        } catch { /* ignore; allow text-only */ }
      }

      let title = (p.title || '').trim();
      let text = '';

      if (textIn && textIn.trim().length > 0) {
        text = textIn.trim();
      } else if (rawHtml) {
        const cleaned = cleanHtmlToText(rawHtml);
        text = cleaned.text;
        if (!title && cleaned.title) title = cleaned.title;
      }

      if (!text || text.length < 10) {
        results.push({ op: 'skip', title: title || (url ?? 'Untitled'), checksum: '', url, error: 'empty_body_after_parse' });
        continue;
      }

      if (!title) {
        title =
          (url ? new URL(url).pathname.split('/').filter(Boolean).slice(-1)[0] : '') ||
          'Untitled';
      }

      const body = text.replace(/\s+/g, ' ').trim().slice(0, 8000);
      const checksum = sha256(body);

      const res = await upsertAccountKbArticle({
        account_id, title, body, tags, source_url, is_active
      });

      if (res.error) {
        results.push({ op: res.op, title, checksum, url, article_id: undefined, error: res.error.message });
        continue;
      }

      let mirrored = false;
      if (hasKnowledgePages) {
        const { error: kpErr } = await db
          .from('knowledge_pages')
          .upsert({
            account_id,
            source_id: sourceId,
            url,
            title,
            content: body,
            status,
            checksum,
            meta: { tags },
            updated_at: new Date().toISOString()
          }, { onConflict: 'account_id,url' });

        if (!kpErr) mirrored = true;
      }

      results.push({
        op: res.op,
        article_id: res.id || undefined,
        title,
        url,
        checksum,
        mirrored
      });
    }

    const inserted = results.filter(r => r.op === 'insert').length;
    const updated  = results.filter(r => r.op === 'update').length;
    const skipped  = results.filter(r => r.op === 'skip').length;

    return NextResponse.json({
      ok: true,
      account_id,
      inserted, updated, skipped,
      mirrored_to_knowledge_pages: results.some(r => r.mirrored),
      results
    });
  } catch (e:any) {
    return NextResponse.json({ error: 'ingest_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}