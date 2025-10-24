export const runtime = 'nodejs';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/lib/supabaseServer';

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
You are OutboundRevive’s SMS AI. Return ONLY JSON with:
{ "intent": "...", "confidence": 0.0-1.0, "message": "≤320 chars, one clear CTA", "needs_footer": bool?, "actions": [], "hold_until": iso8601?, "policy_flags": {} }
Use the short conversation, be truthful, comply with STOP/HELP, keep it friendly and concise. No prose outside JSON.
`.trim();

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
  const history = await fetchThread(fromPhone, toPhone);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM },
    ...history,
    { role: 'user', content: `Contact says: ${userBody}\nReturn ONLY JSON as specified.` },
  ];

  try {
    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 220,
    });

    const raw = res.choices?.[0]?.message?.content?.trim() || '';
    const parsed: ORJSON = JSON.parse(raw);
    let msg = (parsed.message || '').trim();
    if (!msg) throw new Error('json_missing_message');
    if (msg.length > 320) msg = msg.slice(0, 320);

    return { kind: 'json' as const, parsed, message: msg, raw };
  } catch (err: any) {
    console.error('[ai-reply] JSON path failed → fallback', err?.message || err);
    const msg = simpleFallback(userBody, brandName, bookingLink);
    return { kind: 'text' as const, message: msg, reason: 'json_parse_or_api_error' };
  }
}
