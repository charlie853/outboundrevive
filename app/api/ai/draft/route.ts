// app/api/ai/draft/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

// using admin client with build-safe env fallbacks

// ── Account fallback (until all leads carry account_id) ──
const DEFAULT_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

// ── KB helpers (tokenized match, portable, no extensions) ──
function tokenize(q: string) {
  return Array.from(new Set(
    (q || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 4)
  )).slice(0, 8);
}

type KbRow = { title: string; body: string; is_active: boolean };

async function fetchKbSnippets(
  dbClient: any,
  accountId: string,
  q: string
): Promise<string[]> {
  const tokens = tokenize(q);
  if (tokens.length === 0) return [] as string[];

  const { data, error } = await dbClient
    .from('account_kb_articles')
    .select('title,body,is_active')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .limit(50);

  if (error || !data) return [] as string[];

  const rows = (data || []) as KbRow[];

  const scored = rows.map((a: KbRow) => {
    const hay = (a.title + ' ' + a.body).toLowerCase();
    const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
    return { a, score };
  })
  .filter(x => x.score > 0)
  .sort((a,b) => b.score - a.score)
  .slice(0, 3)
  .map(x => x.a);

  const clamp = (s: string, n = 300) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  return scored.map((s: KbRow) => `- ${s.title}: ${clamp(s.body, 400)}`);
}

// ── misc helpers ──
function render(t: string, vars: Record<string,string>) {
  let out = t || '';
  for (const [k,v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v ?? '');
  return out;
}
function clampSms(s: string, max = 160) {
  if (!s) return s;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
// Intent router (expanded)
function inferIntent(q: string) {
  const t = (q || '').toLowerCase();

  // price first
  if (/(price|cost|how much|quote|pricing|rates?)/.test(t)) return 'price';

  // schedule signals (expanded)
  if (
    /(resched|reschedule|another time|different time|later|next week|tomorrow|book|schedule)/.test(t) ||
    /\bhold(s)?\b/.test(t) ||         // “how long do holds last”
    /\bslot(s)?\b/.test(t) ||         // “any slots today”
    /\bavailability\b/.test(t) ||
    /\bpencil\b/.test(t)              // “pencil me in”
  ) return 'schedule';

  if (/(competitor|other company|cheaper|match|beat)/.test(t)) return 'competitor';
  if (/(already bought|already got|went with another)/.test(t)) return 'already_bought';
  if (/(timing|too soon|not ready|maybe later)/.test(t)) return 'timing';

  // generic “how … ?” → faq
  if (/\bhow (long|many|often|does|do)\b/.test(t) || /(faq|how does it work|what do you do|info|information|details)/.test(t)) {
    return 'faq';
  }
  return 'fallback';
}

function formatMoney(cents?: number|null, currency='USD') {
  if (cents == null) return null;
  return new Intl.NumberFormat('en-US', { style:'currency', currency }).format(cents/100);
}
async function priceSnippet(accountId: string, currency: string) {
  const { data: rows } = await db
    .from('account_prices')
    .select('name,price_cents,min_cents,max_cents,cadence')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .limit(25);

  if (!rows || rows.length === 0) return null;

  const prices = rows.map(r => r.price_cents).filter((x): x is number => typeof x === 'number');
  const mins   = rows.map(r => r.min_cents).filter((x): x is number => typeof x === 'number');
  const maxs   = rows.map(r => r.max_cents).filter((x): x is number => typeof x === 'number');

  const lo = Math.min(...(mins.length ? mins : prices.length ? prices : [Infinity]));
  const hi = Math.max(...(maxs.length ? maxs : prices.length ? prices : [0]));
  if (!isFinite(lo) && hi === 0) return null;

  if (isFinite(lo) && isFinite(hi) && lo < hi) {
    return `Typical range ${formatMoney(lo, currency)}–${formatMoney(hi, currency)} depending on options.`;
  }
  if (prices.length) {
    const start = Math.min(...prices);
    return `Packages start around ${formatMoney(start, currency)}.`;
  }
  return null;
}

// ── route ──
export async function POST(req: NextRequest) {
  try {
    const { leadId, lastInboundOverride } = await req.json();

    // Lead + account (tolerant of missing leads.account_id; also accepts phone fallback)
    let lead: { id: string; name: string | null; phone: string; account_id?: string | null } | null = null;

    // Try by id with account_id
    let res = await db
      .from('leads')
      .select('id,name,phone,account_id')
      .eq('id', leadId)
      .maybeSingle();

    if (res.error && /account_id/.test(String(res.error.message))) {
      // Column doesn't exist in this DB — retry without it
      const retry = await db
        .from('leads')
        .select('id,name,phone')
        .eq('id', leadId)
        .maybeSingle();
      if (!retry.error) lead = retry.data as any;
    } else {
      lead = res.data as any;
    }

    // If still no lead, allow passing a phone (e.g. "+1818…") instead of UUID
    if (!lead) {
      const byPhone = await db
        .from('leads')
        .select('id,name,phone') // keep minimal; account_id might not exist
        .eq('phone', String(leadId))
        .maybeSingle();
      if (!byPhone.error) lead = byPhone.data as any;
    }

    if (!lead) {
      return NextResponse.json({ error: 'lead_not_found' }, { status: 404 });
    }

    // If the column doesn't exist or is null, fall back to the default tenant
    const accountId = (lead as any).account_id || DEFAULT_ACCOUNT_ID;

    // Account profile (brand/booking/policy)
    const { data: profile } = await db
      .from('account_profiles')
      .select('brand, booking_link, currency, price_display_policy')
      .eq('account_id', accountId).maybeSingle();

    const brand = profile?.brand || 'OutboundRevive';
    const currency = profile?.currency || 'USD';
    const base = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const bookingEnv = process.env.CAL_BOOKING_URL; // optional global override
    const bookingLink = profile?.booking_link || bookingEnv || `${base}/r/book/${lead.id || leadId}`;
    const pricePolicy = (profile?.price_display_policy || 'book_only') as 'quoteable'|'range_only'|'book_only';

    // Active blueprint for THIS account
    const { data: cfg } = await db
      .from('app_settings')
      .select('active_blueprint_version_id, templates')
      .eq('id', 'default')
      .maybeSingle();

    const { data: activeVerRow } = await db
      .from('blueprint_versions')
      .select(`
        id, version,
        account_blueprint:account_blueprints!inner(account_id)
      `)
      .eq('account_blueprints.account_id', accountId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const activeVer: string | null = activeVerRow?.id || cfg?.active_blueprint_version_id || null;

    // Optional template variables from app_settings.templates (with safe defaults)
    const slotA = (cfg as any)?.templates?.slotA || 'Tue 2p';
    const slotB = (cfg as any)?.templates?.slotB || 'Wed 10a';
    const appt_noun = (cfg as any)?.templates?.appt_noun || 'consult';

    // Intent & name
    const inferred = inferIntent(lastInboundOverride || '');
    const firstName = (lead?.name || '').split(' ')[0] || 'there';

    // 1) Template by intent
    if (activeVer) {
      const { data: tmpl } = await db
        .from('prompt_templates')
        .select('id,body,max_len,enabled')
        .eq('blueprint_version_id', activeVer)
        .eq('intent', inferred)
        .eq('enabled', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tmpl?.body) {
        // --- KB hint (non-destructive) ---
        const kbList = await fetchKbSnippets(db, accountId, lastInboundOverride || '');
        const kbHintRaw = kbList.length ? kbList[0] : '';
        const kbHint = kbHintRaw.replace(/^[\-\u2022]\s*/, ''); // strip leading "- " or "• "
        let templateBody = tmpl.body; // working copy

        // If template has {{kb_hint}}, fill it; else soft-append if it fits
        if (kbHint) {
          if (templateBody.includes('{{kb_hint}}')) {
            templateBody = templateBody.replace('{{kb_hint}}', kbHint);
          } else {
            const candidate = `${templateBody} ${kbHint}`;
            if (candidate.length <= (tmpl.max_len ?? 160)) {
              templateBody = candidate;
            }
          }
        }

        // Special handling for "price" with policy
        if (inferred === 'price' && pricePolicy !== 'book_only') {
          const snippet = await priceSnippet(accountId, currency);
          // Merge price snippet into the KB-augmented templateBody
          let withPrice = templateBody;
          if (snippet) {
            withPrice = templateBody.includes('{{price_snippet}}')
              ? templateBody.replace('{{price_snippet}}', snippet)
              : `${templateBody} ${snippet}`;
          }
          const rendered = render(withPrice, {
            first_name: firstName,
            name: firstName,
            brand,
            booking_link: bookingLink,
            kb_hint: kbHint,
            slotA, slotB, appt_noun
          });
          return NextResponse.json({
            draft: clampSms(rendered, tmpl.max_len ?? 160),
            intent: inferred,
            source: 'template',
            template_id: tmpl.id,
            blueprint_version_id: activeVer,
            used_snippets: [kbHint, snippet].filter(Boolean)
          });
        }

        const rendered = render(templateBody, {
          first_name: firstName,
          name: firstName,
          brand,
          booking_link: bookingLink,
          kb_hint: kbHint,
          slotA, slotB, appt_noun
        });
        return NextResponse.json({
          draft: clampSms(rendered, tmpl.max_len ?? 160),
          intent: inferred,
          source: 'template',
          template_id: tmpl.id,
          blueprint_version_id: activeVer,
          used_snippets: kbHint ? [kbHint] : undefined
        });
      }
    }

    // 2) KB-aware LLM fallback
    const facts = await fetchKbSnippets(db, accountId, lastInboundOverride || '');
    const system = [
      `You are the SMS assistant for ${brand}.`,
      'Style: concise, friendly, <=160 chars, NO footer.',
      'If unsure, ask a brief clarifying question OR suggest booking.',
      `Pricing policy: ${pricePolicy}.`,
      (pricePolicy === 'book_only'
        ? 'Do not quote exact numbers; steer to booking politely.'
        : pricePolicy === 'range_only'
        ? 'You may share ranges or “starts at” but not firm quotes.'
        : 'You may share specific pricing if the catalog contains it.'
      ),
      `Slots to offer (if relevant): ${slotA} / ${slotB}. Appointment noun: ${appt_noun}.`,
      facts.length ? `Account KB (authoritative facts; keep wording natural, do not quote verbatim):\n${facts.join('\n')}` : '',
    ].filter(Boolean).join('\n');

    const userMsg = lastInboundOverride || 'New inbound message from contact. Draft a short helpful reply.';

    let draft = '';
    if (process.env.OPENAI_API_KEY) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 120,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg }
          ]
        })
      });
      const j = await r.json();
      const raw = j?.choices?.[0]?.message?.content || '';
      draft = render(raw, {
        first_name: firstName,
        name: firstName,
        brand,
        booking_link: bookingLink,
        slotA, slotB, appt_noun
      });
    } else {
      draft = `${brand}: happy to help—quick 10-min chat to tailor this? ${bookingLink}`;
    }

    return NextResponse.json({
      draft: clampSms(draft, 160),
      intent: inferred,
      source: 'llm',
      used_snippets: facts,
      blueprint_version_id: activeVer
    });
  } catch (e:any) {
    console.error('/api/ai/draft error', e);
    const base = process.env.CAL_BOOKING_URL || 'https://cal.com/YOURNAME/15min';
    return NextResponse.json({
      draft: clampSms(`Happy to help—can we do a quick 10-min chat? ${base}`, 160),
      intent:'fallback',
      source:'fallback'
    });
  }
}
