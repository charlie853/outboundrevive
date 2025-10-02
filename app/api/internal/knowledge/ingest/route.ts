// app/api/internal/knowledge/ingest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // Admin auth
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const payload = await req.json();

    // Accept both snake/camel for account id and url/html
    const account_id: string = payload.account_id || payload.accountId;
    const url: string | undefined  = payload.url?.trim();
    const htmlIn: string | undefined = payload.html?.trim();
    const titleIn: string | undefined = payload.title?.trim();
    const tags: string[] = Array.isArray(payload.tags) ? payload.tags : [];

    if (!account_id || (!url && !htmlIn)) {
      return NextResponse.json({ error: 'missing_params', need: ['account_id', 'url|html'] }, { status: 400 });
    }

    // Fetch or use provided HTML
    let rawHtml = htmlIn || '';
    let source_url: string | null = null;

    if (!rawHtml && url) {
      try {
        const r = await fetch(url, { redirect: 'follow' });
        if (!r.ok) {
          return NextResponse.json({ error: 'fetch_failed', status: r.status }, { status: 502 });
        }
        rawHtml = await r.text();
        source_url = url;
      } catch {
        return NextResponse.json({ error: 'fetch_failed', status: 0 }, { status: 502 });
      }
    } else if (htmlIn) {
      source_url = payload.source_url ?? null; // optional
    }

    // Clean & extract
    const $ = cheerio.load(rawHtml || '');
    const title =
      titleIn ||
      $('title').first().text().trim() ||
      (url ? new URL(url).pathname.split('/').filter(Boolean).slice(-1)[0] : '') ||
      'Untitled';

    // strip noisy nodes then compact
    $('script,noscript,style,header,footer,nav').remove();
    const body = $('body').text().replace(/\s+/g, ' ').trim();

    if (!body || body.length < 10) {
      return NextResponse.json({ error: 'empty_body_after_parse' }, { status: 422 });
    }

    // Insert article
    const { data, error } = await db
      .from('account_kb_articles')
      .insert({
        account_id,
        title,
        body: body.slice(0, 8000),       // keep it sane
        tags,
        source_url,
        is_active: true
      })
      .select('id,title,tags,source_url,created_at')
      .single();

    if (error) {
      return NextResponse.json({ error: 'db_insert_failed', detail: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, article: data });
  } catch (e:any) {
    return NextResponse.json({ error: 'ingest_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}
