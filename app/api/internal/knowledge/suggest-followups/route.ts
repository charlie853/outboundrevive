// app/api/internal/knowledge/suggest-followups/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

// ── auth (ADMIN_API_KEY or ADMIN_TOKEN)
function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want =
    (process.env.ADMIN_API_KEY?.trim() || '') ||
    (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

// ── small helpers (mirrors /draft + /answer behavior)
async function tableExists(name: string) {
  const { error } = await db.from(name as any).select('*', { head: true, count: 'exact' }).limit(1);
  // @ts-ignore
  if (error?.code === '42P01') return false;
  return true;
}
function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function makeExcerpt(content: string, q: string, radius = 160) {
  const txt = (content || '').replace(/\s+/g, ' ').trim();
  if (!q) return txt.slice(0, radius * 2) + (txt.length > radius * 2 ? '…' : '');
  const idx = txt.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return txt.slice(0, radius * 2) + (txt.length > radius * 2 ? '…' : '');
  const start = Math.max(0, idx - radius);
  const end = Math.min(txt.length, idx + q.length + radius);
  return (start > 0 ? '…' : '') + txt.slice(start, end) + (end < txt.length ? '…' : '');
}

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

// Get ranked contexts (same idea as /draft)
async function getContexts(account_id: string, q: string, k: number) {
  const needle = q ? `%${q}%` : '%';
  const re = q ? new RegExp(escapeRegex(q), 'gi') : null;

  const hasKP = await tableExists('knowledge_pages');
  let rows: Array<{ id: string; title: string | null; url: string | null; content: string; table: 'knowledge_pages'|'account_kb_articles' }> = [];

  // 1) Prefer knowledge_pages
  if (hasKP && q) {
    const { data, error } = await db
      .from('knowledge_pages')
      .select('id,title,content,url,status')
      .eq('account_id', account_id)
      .eq('status', 'approved')
      .ilike('content', needle)
      .limit(k * 6);
    if (error) throw new Error(error.message);
    rows = (data || []).map((r: any) => ({
      id: r.id, title: r.title ?? 'Untitled', url: r.url ?? null, content: r.content || '', table: 'knowledge_pages'
    }));
  }

  // 2) Or fallback to account_kb_articles (phrase)
  if (rows.length === 0 && q) {
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
      id: r.id, title: r.title ?? 'Untitled', url: r.source_url ?? null, content: r.body || '', table: 'account_kb_articles'
    }));
  }

  // 3) Tokenized fallback (works even if q is a sentence or empty)
  if (rows.length === 0 && q) {
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
        queries.push(
          db.from('account_kb_articles')
            .select('id,title,body,source_url,is_active')
            .eq('account_id', account_id).eq('is_active', true)
            .ilike('title', like)
            .limit(k * 3) as any
        );
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

  // 4) Final ranking
  const ranked = rows
    .map(r => ({ ...r, score: (q ? (r.content.match(new RegExp(escapeRegex(q), 'gi'))?.length || 0) : 1) || 1 }))
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

function shapeSms(text: string, maxChars: number) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > maxChars ? cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…' : cleaned;
}

// ── provider-agnostic LLM adapter (same as /draft)
type Provider = 'openai'|'anthropic'|'openrouter'|'together'|'deepseek'|'mock';
async function callLLM(opts: { provider: Provider; model: string; system: string; user: string; temperature?: number; }) {
  const { provider, model, system, user, temperature = 0.2 } = opts;
  const disabled = ['1','true'].includes(String(process.env.LLM_DISABLE||'').toLowerCase());
  const missingKey =
    (provider === 'openai' && !process.env.OPENAI_API_KEY) ||
    (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) ||
    (provider === 'openrouter' && !process.env.OPENROUTER_API_KEY) ||
    (provider === 'together' && !process.env.TOGETHER_API_KEY) ||
    (provider === 'deepseek' && !process.env.DEEPSEEK_API_KEY);

  if (disabled || missingKey || provider === 'mock') {
    return {
      text: JSON.stringify({
        suggestions: [
          { text: 'Want me to hold Tue 2 PM for you?' },
          { text: 'Prefer Wed 10 AM instead?' },
          { text: 'I can text a booking link if helpful.' }
        ]
      }),
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
          model, temperature,
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
          model, system, temperature, max_tokens: 300,
          messages: [{ role: 'user', content: user }]
        })
      });
      const j = await r.json();
      const text = j?.content?.[0]?.text?.trim?.() || '';
      return { text, meta: { provider, model, http_status: r.status } };
    }

    return { text: JSON.stringify({ suggestions: [{ text: 'Sounds good—want me to pencil something in?' }] }), meta: { provider, model, fallback: true } };
  } catch (e: any) {
    return { text: JSON.stringify({ suggestions: [{ text: 'Got it—happy to help. Would you like me to share our booking link?' }] }), meta: { provider, model, error: e?.message || String(e) } };
  }
}

// Parse LLM output into array of strings (robust to non-JSON)
function extractSuggestions(raw: string): string[] {
  try {
    const j = JSON.parse(raw);
    const arr = j?.suggestions || j?.options || j?.followups;
    if (Array.isArray(arr)) {
      return arr
        .map((x) => (typeof x === 'string' ? x : x?.text))
        .filter((s): s is string => !!s && typeof s === 'string');
    }
  } catch { /* fall through */ }

  // fallback: split lines / bullets
  return raw
    .split(/\r?\n/)
    .map(s => s.replace(/^\s*[-•\d.]+\s*/, '').trim())
    .filter(Boolean);
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const account_id: string = body.account_id || body.accountId || '';
    const q: string = (body.q || body.topic || body.last_question || '').trim(); // optional topic
    const previous: string = (body.previous || body.last_message || '').trim();  // prior AI/agent message (optional)
    const k = Math.max(1, Math.min(20, Number(body.k || 3)));
    const n = Math.max(2, Math.min(5, Number(body.n || 3)));
    const tone: string = (body.tone || 'friendly').toLowerCase();
    const max_chars = Math.max(80, Math.min(180, Number(body.max_chars || 120))); // short by design
    const calUrl = process.env.CAL_BOOKING_URL || '';

    if (!account_id) {
      return NextResponse.json({ error: 'missing_params', need: ['account_id'] }, { status: 400 });
    }

    // contexts (same ranking as /draft). Works even if q is empty.
    const contexts = await getContexts(account_id, q, k);
    const contextLines = contexts.map((c, i) => `${i + 1}. ${c.title}${c.source ? ` (${c.source})` : ''}: ${c.excerpt}`).join('\n');

    const system = [
      `You are writing ULTRA-SHORT follow-up SMS messages (not emails).`,
      `Rules for EACH suggestion:`,
      `- Under ${max_chars} characters.`,
      `- Be ${tone}, natural, and specific to CONTEXTS.`,
      `- Avoid emojis, legalese, and prices unless present in CONTEXTS.`,
      calUrl ? `- You MAY include ${calUrl} if a link is relevant.` : null,
      `- Vary the structure across suggestions (question, offer, confirm, clarify).`,
      `- No labels or numbering in the output.`,
      `- Return ONLY valid JSON: {"suggestions":[{"text":"..."}, ...]}.`
    ].filter(Boolean).join('\n');

    const user = [
      previous ? `PREVIOUS_REPLY: "${previous}"` : `PREVIOUS_REPLY: (none)`,
      q ? `TOPIC_OR_QUESTION: "${q}"` : `TOPIC_OR_QUESTION: (none)`,
      ``,
      `CONTEXTS:`,
      contextLines || `(none)`,
      ``,
      `Now output JSON with 2–3 follow-up SMS suggestions exactly like:`,
      `{"suggestions":[{"text":"<s1>"},{"text":"<s2>"},{"text":"<s3>"}]}`
    ].join('\n');

    const provider = (process.env.LLM_PROVIDER as Provider) || 'mock';
    const model =
      process.env.LLM_MODEL ||
      (provider === 'openai' ? 'gpt-4o-mini' :
       provider === 'anthropic' ? 'claude-3-haiku-20240307' :
       provider === 'openrouter' ? 'openai/gpt-4o-mini' :
       provider === 'together' ? 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo' :
       provider === 'deepseek' ? 'deepseek-chat' :
       'mock');

    const llm = await callLLM({ provider, model, system, user, temperature: 0.2 });

    // Convert to strings, dedupe, cap, and limit to n
    const raw = extractSuggestions(llm.text || '');
    const seen = new Set<string>();
    const cleaned = raw
      .map(s => shapeSms(s.replace(/^"(.*)"$/, '$1'), max_chars))
      .filter(s => {
        const key = s.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return !!s;
      })
      .slice(0, n);

    // Safe fallback if model returned nothing
    const fallbacks = [
      `Want me to hold Tue 2 PM for you?`,
      `Prefer Wed 10 AM instead?`,
      calUrl ? `I can send a quick booking link: ${calUrl}` : `Want me to text over a couple of time options?`
    ].map(s => shapeSms(s, max_chars));

    const suggestions = cleaned.length ? cleaned : fallbacks.slice(0, n);

    return NextResponse.json({
      ok: true,
      account_id,
      q,
      previous,
      n: suggestions.length,
      suggestions: suggestions.map(t => ({ text: t, chars: t.length })),
      contexts,          // helpful for UI preview
      model: llm.meta    // provider/model/debug
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'followups_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}
