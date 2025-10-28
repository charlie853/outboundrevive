// app/api/internal/knowledge/draft/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

// ── auth helper (ADMIN_API_KEY or ADMIN_TOKEN)
function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want =
    (process.env.ADMIN_API_KEY?.trim() || '') ||
    (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}
function hasInternalSecret(req: Request) {
  const hdrSecret = (req.headers.get('x-internal-secret') || req.headers.get('X-Internal-Secret') || '').trim();
  const want = (process.env.INTERNAL_API_SECRET || '').trim();
  return !!want && hdrSecret === want;
}

// ── shared helpers (match /answer behavior)
async function tableExists(name: string) {
  const { error } = await db.from(name as any).select('*', { head: true, count: 'exact' }).limit(1);
  // @ts-ignore
  if (error?.code === '42P01') return false;
  return true;
}
function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function makeExcerpt(content: string, q: string, radius = 160) {
  const txt = (content || '').replace(/\s+/g, ' ').trim();
  const idx = txt.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return txt.slice(0, radius * 2) + (txt.length > radius * 2 ? '…' : '');
  const start = Math.max(0, idx - radius);
  const end = Math.min(txt.length, idx + q.length + radius);
  return (start > 0 ? '…' : '') + txt.slice(start, end) + (end < txt.length ? '…' : '');
}

// tokenization helpers for fallback search
const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','than','to','of','in','on','for','with',
  'do','you','your','we','us','our','is','are','be','can','could','would','should',
  'what','when','where','how','why','it','this','that'
]);
function tokenize(q: string) {
  return (q.toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean) as string[])
    .filter(w => w.length >= 3 && !STOPWORDS.has(w))
    .slice(0, 5);
}

// ── minimal context fetch (mirrors /answer ranking)
async function getContexts(account_id: string, q: string, k: number) {
  const needle = `%${q}%`;
  const re = new RegExp(escapeRegex(q), 'gi');

  const hasKP = await tableExists('knowledge_pages');
  let rows: Array<{ id: string; title: string | null; url: string | null; content: string; table: 'knowledge_pages'|'account_kb_articles' }> = [];

  // 1) Phrase search first (knowledge_pages preferred if present)
  if (hasKP) {
    const { data, error } = await db
      .from('knowledge_pages')
      .select('id,title,content,url,status')
      .eq('account_id', account_id)
      .eq('status', 'approved')
      .ilike('content', needle)
      .limit(k * 6);
    if (error) throw new Error(error.message);
    rows = (data || []).map((r: any) => ({
      id: r.id,
      title: r.title ?? 'Untitled',
      url: r.url ?? null,
      content: r.content || '',
      table: 'knowledge_pages'
    }));
  }

  // 2) If nothing from KP or KP missing, search account_kb_articles by phrase
  if (rows.length === 0) {
    const [byTitle, byBody] = await Promise.all([
      db.from('account_kb_articles')
        .select('id,title,body,source_url,is_active')
        .eq('account_id', account_id).eq('is_active', true)
        .ilike('title', needle).limit(k * 6),
      db.from('account_kb_articles')
        .select('id,title,body,source_url,is_active')
        .eq('account_id', account_id).eq('is_active', true)
        .ilike('body', needle).limit(k * 6),
    ]);
    if (byTitle.error) throw new Error(byTitle.error.message);
    if (byBody.error) throw new Error(byBody.error.message);

    const map = new Map<string, any>();
    (byTitle.data || []).forEach((r: any) => map.set(r.id, r));
    (byBody.data || []).forEach((r: any) => map.set(r.id, r));

    rows = Array.from(map.values()).map((r: any) => ({
      id: r.id,
      title: r.title ?? 'Untitled',
      url: r.source_url ?? null,
      content: r.body || '',
      table: 'account_kb_articles'
    }));
  }

  // 3) Tokenized fallback if phrase search returned nothing (handles full-sentence questions)
  if (rows.length === 0) {
    const tokens = tokenize(q);
    if (tokens.length) {
      const queries: any[] = [];
      for (const t of tokens) {
        const like = `%${t}%`;
        if (hasKP) {
          queries.push(
            db.from('knowledge_pages')
              .select('id,title,content,url,status')
              .eq('account_id', account_id)
              .eq('status', 'approved')
              .ilike('content', like)
              .limit(k * 3) as any
          );
        }
        // title hits (smaller)
        queries.push(
          db.from('account_kb_articles')
            .select('id,title,body,source_url,is_active')
            .eq('account_id', account_id).eq('is_active', true)
            .ilike('title', like)
            .limit(k * 3) as any
        );
        // body hits (larger)
        queries.push(
          db.from('account_kb_articles')
            .select('id,title,body,source_url,is_active')
            .eq('account_id', account_id).eq('is_active', true)
            .ilike('body', like)
            .limit(k * 6) as any
        );
      }
      const results = await Promise.all(queries);
      const map = new Map<string, { id: string; title: string; url: string|null; content: string; table: 'knowledge_pages'|'account_kb_articles'; score: number }>();
      for (const res of results) {
        if (res.error) continue;
        for (const r of (res.data || [])) {
          const id = r.id as string;
          const isKP = 'content' in r && 'status' in r && ('url' in r);
          const title = (r.title ?? 'Untitled') as string;
          const url = (isKP ? r.url : r.source_url) ?? null;
          const content = (isKP ? r.content : r.body) || '';
          const prev = map.get(id);
          // basic scoring: one point plus one per token present
          const tokenHits = tokens.reduce((acc, t) => acc + ((content.match(new RegExp(escapeRegex(t), 'gi'))?.length || 0) > 0 ? 1 : 0), 0);
          const inc = 1 + tokenHits;
          if (prev) prev.score += inc;
          else map.set(id, { id, title, url, content, table: isKP ? 'knowledge_pages' : 'account_kb_articles', score: inc });
        }
      }
      rows = Array.from(map.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, k)
        .map(r => ({ id: r.id, title: r.title, url: r.url, content: r.content, table: r.table }));
    }
  }

  // 4) Final ranking by phrase occurrences if any, else keep token score order (default 1)
  const ranked = rows
    .map(r => ({ ...r, score: (r.content.match(re)?.length || 0) || 1 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return ranked.map(r => ({
    id: r.id,
    title: r.title,
    source: r.url,
    excerpt: makeExcerpt(r.content, q),
    table: r.table,
  }));
}

// ── provider-agnostic LLM adapter
type Provider = 'openai'|'anthropic'|'openrouter'|'together'|'deepseek'|'mock';

async function callLLM(opts: {
  provider: Provider; model: string; system: string; user: string; temperature?: number;
}) {
  const { provider, model, system, user, temperature = 0.3 } = opts;

  // Mock if disabled or missing keys
    const disabled = ['1','true'].includes(String(process.env.LLM_DISABLE||'').toLowerCase());
  const missingKey =
    (provider === 'openai' && !process.env.OPENAI_API_KEY) ||
    (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) ||
    (provider === 'openrouter' && !process.env.OPENROUTER_API_KEY) ||
    (provider === 'together' && !process.env.TOGETHER_API_KEY) ||
    (provider === 'deepseek' && !process.env.DEEPSEEK_API_KEY);

  if (disabled || missingKey || provider === 'mock') {
    return {
      text: `Sounds good — yes, we offer Botox. Would you like to book a quick consult?`,
      meta: { provider: provider || 'mock', model, mocked: true }
    };
  }

  try {
    if (provider === 'openai' || provider === 'openrouter' || provider === 'together' || provider === 'deepseek') {
      const endpoint =
        provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' :
        provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' :
        provider === 'together' ? 'https://api.together.xyz/v1/chat/completions' :
        'https://api.deepseek.com/chat/completions';

      const key =
        provider === 'openai' ? process.env.OPENAI_API_KEY :
        provider === 'openrouter' ? process.env.OPENROUTER_API_KEY :
        provider === 'together' ? process.env.TOGETHER_API_KEY :
        process.env.DEEPSEEK_API_KEY!;

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          ...(provider === 'openrouter' ? { 'HTTP-Referer': process.env.PUBLIC_BASE_URL || 'http://localhost:3001', 'X-Title': 'OutboundRevive' } : {})
        },
        body: JSON.stringify({
          model,
          temperature,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        })
      });
      const j = await r.json();
      const text = j?.choices?.[0]?.message?.content?.trim?.() || '';
      return { text, meta: { provider, model, http_status: r.status } };
    }

    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          system,
          temperature,
          max_tokens: 300,
          messages: [{ role: 'user', content: user }]
        })
      });
      const j = await r.json();
      const text = j?.content?.[0]?.text?.trim?.() || '';
      return { text, meta: { provider, model, http_status: r.status } };
    }

    // Fallback
    return {
      text: `Thanks for reaching out — yes, we can help. Want me to book a quick consult?`,
      meta: { provider, model, fallback: true }
    };
  } catch (e: any) {
    return {
      text: `Got it — I’ll have a specialist follow up shortly.`,
      meta: { provider, model, error: e?.message || String(e) }
    };
  }
}

// ── SMS shaping
function shapeSms(text: string, maxChars: number, includeFooter = false, footer = '') {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  let out = cleaned;
  if (includeFooter && footer) {
    const space = cleaned.length ? ' ' : '';
    out = cleaned + space + footer.trim();
  }
  if (out.length > maxChars) {
    out = out.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!(hasInternalSecret(req) || isAdmin(req))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const account_id: string = body.account_id || body.accountId || '';
    const q: string = (body.q || body.message || '').trim();
    const k = Math.max(1, Math.min(20, Number(body.k || 3)));
    const tone: string = (body.tone || 'friendly').toLowerCase();
    const max_chars = Math.max(120, Math.min(480, Number(body.max_chars || 240)));
    const include_footer = !!body.include_footer;
    const footer = body.footer ?? ''; // usually leave empty; sending pipeline adds compliance footer

    // Optional: send the drafted SMS in one hop
    const send: boolean = body.send === true;
    const lead_id: string | undefined = body.lead_id || body.leadId;
    const operator_id: string | null = body.operator_id || body.operatorId || null;

    // Guard for SMS + potential footer when actually sending now.
    // If we're about to send, reserve room for the compliance footer added downstream.
    const estimatedFooter = 25; // rough allowance for carrier footer
    const hardCap = send ? Math.min(max_chars, 160 - estimatedFooter) : max_chars;

    if (!account_id || !q) {
      return NextResponse.json({ error: 'missing_params', need: ['account_id', 'q'] }, { status: 400 });
    }

    // contexts (same ranking as /answer)
    const contexts = await getContexts(account_id, q, k);

    // Build SMS-specific prompt
    const calUrl = process.env.CAL_BOOKING_URL || '';
    const contextLines = contexts.map((c, i) => `${i + 1}. ${c.title}${c.source ? ` (${c.source})` : ''}: ${c.excerpt}`).join('\n');

    const system = [
      `You are an assistant drafting a SINGLE SMS reply for a business.`,
      `Rules:`,
      `- Keep it under ${hardCap} characters.`,
      `- Be ${tone}, concise, and natural. No emojis.`,
      `- Use ONLY the facts in CONTEXTS. If the answer isn't present, say you don't know and offer to connect or book.`,
      calUrl ? `- If relevant, you may include: ${calUrl}` : null,
      `- No pricing unless present in CONTEXTS.`,
      `- No disclaimers or legalese.`,
    ].filter(Boolean).join('\n');

    const user = [
      `QUESTION from lead: "${q}"`,
      ``,
      `CONTEXTS:`,
      contextLines || `(none)`,
      ``,
      `Now draft the SMS (just the message text, no labels):`
    ].join('\n');

    // Provider config
    const provider = (process.env.LLM_PROVIDER as Provider) || 'mock';
    const model =
      process.env.LLM_MODEL ||
      (provider === 'openai' ? 'gpt-4o-mini' :
       provider === 'anthropic' ? 'claude-3-haiku-20240307' :
       provider === 'openrouter' ? 'openai/gpt-4o-mini' :
       provider === 'together' ? 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' :
       provider === 'deepseek' ? 'deepseek-chat' :
       'mock');

    const llm = await callLLM({ provider, model, system, user, temperature: 0.3 });

    // Final SMS shaping
    const text = shapeSms(llm.text || '', hardCap, include_footer, footer);

    // If NO contexts and LLM produced something generic, give a safer fallback
    const safeText = contexts.length === 0
      ? shapeSms(`Good question! I don’t have that info handy. Want me to connect you with a specialist${calUrl ? ` or share a quick booking link: ${calUrl}` : ''}?`, hardCap, include_footer, footer)
      : text;

    const responsePayload: any = {
      ok: true,
      account_id,
      q,
      k,
      cap_used: hardCap,
      draft: { text: safeText, chars: safeText.length },
      contexts,               // keep for UI preview / logs
      model: llm.meta         // provider/model/debug
    };

    // If requested, send the drafted SMS now using the internal pipeline
    if (send && lead_id) {
      const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
      const adminKey = (process.env.ADMIN_API_KEY || '').trim();
      const fallback = (process.env.ADMIN_TOKEN || '').trim();
      const adminHeader = adminKey || fallback; // prefer ADMIN_API_KEY per guidance
      try {
        const draftText: string = responsePayload.draft.text;
        const r = await fetch(`${base}/api/sms/send`, {
          method: 'POST',
          headers: {
            'x-admin-token': adminHeader,
            'Content-Type': 'application/json',
          },
          // Keep our existing /api/sms/send shape (leadIds/message) and also include
          // account_id/lead_id/body for compatibility with other handlers.
          body: JSON.stringify({
            leadIds: [lead_id],          // current pipeline expects this
            message: draftText,           // current pipeline expects this
            replyMode: true,              // keep compliance gating centralized
            operator_id,                  // attribution
            // Compatibility extras (ignored by current sender but future-proof):
            account_id,
            lead_id,
            body: draftText,
          })
        });
        const sendJson = await r.json().catch(() => ({}));
        responsePayload.sent = sendJson;
        responsePayload.send_result = sendJson;
      } catch (e: any) {
        responsePayload.send_error = e?.message || String(e);
      }
    }

    return NextResponse.json(responsePayload);
  } catch (e: any) {
    return NextResponse.json({ error: 'draft_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}
