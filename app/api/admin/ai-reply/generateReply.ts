export const runtime = 'nodejs';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseServer';

async function buildThreadContext(fromPhone: string, toPhone: string) {
  const norm = (s: string) => (s || '').trim();
  const fp = norm(fromPhone), tp = norm(toPhone);

  const { data: recentIn = [] } = await supabaseAdmin
    .from('messages_in').select('body,created_at')
    .eq('from_phone', fp).eq('to_phone', tp)
    .order('created_at', { ascending: false }).limit(8);

  const { data: recentOut = [] } = await supabaseAdmin
    .from('messages_out').select('body,from_phone,to_phone,created_at')
    .eq('from_phone', tp).eq('to_phone', fp)
    .order('created_at', { ascending: false }).limit(6);

  const lastInbound = recentIn[0]?.body || '';
  const hasGreeted = (recentOut || []).some(r =>
    /^(\s*)(hi|hey|hello|this is)\b/i.test(r?.body || '')
  );

  return {
    lastInbound,
    recentInbound: recentIn.map(r => r.body).filter(Boolean),
    recentOutbound: recentOut.map(r => r.body).filter(Boolean),
    hasGreeted,
  };
}

type ORJSON = {
  intent: string;
  confidence: number;
  message: string;
  needs_footer?: boolean;
  actions?: Array<Record<string, any>>;
  hold_until?: string | null;
  policy_flags?: Record<string, boolean>;
};

const SYSTEM = `
Return ONLY one JSON object:
{"intent":"<enum>","confidence":0..1,"message":"<<=240 chars>","needs_footer":true|false,"actions":[],"hold_until":null,"policy_flags":{}}

Rules:
- Be thread-aware: answer the LAST inbound directly. No generic “How can I help?”.
- Never repeat a greeting once we’ve greeted earlier in the thread.
- Max 2 sentences, <=240 chars (before footer). Plain & specific.
- Hours: state hours + propose 1–2 concrete slots (e.g., "Tue 10–12 or Thu 2–4?").
- Pricing: include a $ anchor (e.g., Starter $199/100 leads) OR ask for volume if unknown.
- HubSpot: confirm we integrate; offer a setup checklist if relevant.
- “Who is this”: identify brand once; later turns skip any greeting.
- Don’t put opt-out text in message; set needs_footer=true when appropriate.
- Reference the user’s last question directly; no generic “How can I help?”.
- If hours → answer hours + offer times; if pricing → give a concrete starting price or ask for volume (not a booking link first). One sentence + one question max.

intent ∈ {"identify_sender","hours","pricing","pricing_and_integration","integration","scheduling","general_question","other"}
`;

function simpleFallback(userBody: string, brand: string, link?: string) {
  const lower = (userBody || '').toLowerCase();
  if (/(price|cost|charge|how much)/.test(lower)) {
    return `Quick pricing overview from ${brand}: flexible plans based on lead volume.${link ? ` Want me to send a quote? ${link}` : ''}`;
  }
  if (/(who.*this|who is this|what is this|help)/.test(lower)) {
    return `Hey—it’s ${brand}. We help revive old leads with compliant SMS.${link ? ` Want a quick link to book? ${link}` : ''}`;
  }
  return `Hi—${brand} here.${link ? ` Want a quick link to book? ${link}` : ''}`;
}

async function fetchThread(fromPhone: string, toPhone: string) {
  const { data: inbound } = await supabaseAdmin
    .from('messages_in')
    .select('body,created_at')
    .eq('from_phone', fromPhone)
    .eq('to_phone', toPhone)
    .order('created_at', { ascending: false })
    .limit(6);

  const { data: outbound } = await supabaseAdmin
    .from('messages_out')
    .select('body,created_at')
    .eq('to_phone', fromPhone)     // our outbounds go to the contact
    .order('created_at', { ascending: false })
    .limit(6);

  const combo = [
    ...(inbound || []).map(i => ({ role: 'user' as const, content: i.body, at: i.created_at })),
    ...(outbound || []).map(o => ({ role: 'assistant' as const, content: o.body, at: o.created_at })),
  ].sort((a,b) => (a.at < b.at ? -1 : 1));

  return combo.map(m => ({ role: m.role, content: m.content }));
}

export async function generateReply(opts: {
  userBody: string;
  fromPhone: string;
  toPhone: string;
  brandName: string;
  bookingLink?: string;
}) {
  const { userBody, fromPhone, toPhone, brandName, bookingLink } = opts;

  if (!process.env.OPENAI_API_KEY || /^(1|true)$/i.test(process.env.LLM_DISABLE || '')) {
    const msg = simpleFallback(userBody, brandName, bookingLink);
    return { kind: 'text' as const, message: msg, reason: 'llm_disabled_or_missing_key' };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ctx = await buildThreadContext(fromPhone, toPhone);
  const business = {
    brandName,
    bookingLink,
    hours: 'Mon–Fri 9–5',
    pricingAnchors: [
      { plan: 'Starter', price: 199, leads: 100 },
      { plan: 'Growth', price: 499, leads: 300 },
    ],
  };
  const userPayload = { ...business, ...ctx };

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.4,
      top_p: 0.9,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      max_tokens: 220,
    });

    const raw = res.choices?.[0]?.message?.content?.trim() || '';
    const parsed: ORJSON = JSON.parse(raw);
    let msg = String(parsed?.message || '').trim();
    // 1) Strip greeting if we've greeted before
    if (ctx.hasGreeted) {
      msg = msg.replace(/^(\s*)(hi|hey|hello|this is)[^.!?]*[.!?]\s*/i, '').trim();
    }

    // 2) Hours: ensure slots
    if (parsed?.intent === 'hours' && !/(\bmon|\btue|\bwed|\bthu|\bfri|\d{1,2}\s*(am|pm))/i.test(msg)) {
      const addon = ' We have Tue 10–12 or Thu 2–4—work?';
      if ((msg + addon).length <= 240) msg += addon;
    }

    // 3) Pricing: ensure $ anchor or ask volume
    if (parsed?.intent?.startsWith('pricing')) {
      const hasDollar = /\$\s*\d/.test(msg);
      if (!hasDollar) {
        const ask = ' How many leads/mo?';
        if ((msg + ask).length <= 240) msg += ask;
      }
    }

    // 4) Enforce <=240 chars
    if (msg.length > 240) msg = msg.slice(0, 240).trim();
    if (!msg) throw new Error('json_missing_message');
    if (msg.length > 320) msg = msg.slice(0, 320);

    return { kind: 'json' as const, parsed, message: msg, raw };
  } catch (err: any) {
    console.error('[ai-reply] JSON path failed → fallback', err?.message || err);
    const msg = simpleFallback(userBody, brandName, bookingLink);
    return { kind: 'text' as const, message: msg, reason: 'json_parse_or_api_error' };
  }
}
