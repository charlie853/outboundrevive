import OpenAI from 'openai';

const sysPrompt = `
You are OutboundRevive’s SMS AI. Follow the "OutboundRevive — SMS AI System Prompt (Operator-Managed)" playbook and return JSON ONLY:
{ "intent": "...", "confidence": 0-1, "message": "≤320 chars", "needs_footer": true/false, "actions": [...], "hold_until": "...", "policy_flags": {...} }
If you are unsure, ask a short clarifying question in "message".
`;

type ORJSON = {
  intent: string;
  confidence: number;
  message: string;
  needs_footer?: boolean;
  actions?: Array<Record<string, any>>;
  hold_until?: string | null;
  policy_flags?: Record<string, boolean>;
};

function simpleFallback(userBody: string, brandName: string, link?: string) {
  const t = (userBody || '').toLowerCase();
  if (/(price|cost|charge|pricing)/i.test(t)) {
    return `Quick pricing overview from ${brandName}: flexible plans based on lead volume. Want me to send a quote?${link ? ' ' + link : ''}`;
  }
  if (/(hubspot|integrate)/i.test(t)) {
    return `${brandName} supports HubSpot integration for lead sync & notes. Want a quick link to see how it connects?${link ? ' ' + link : ''}`;
  }
  if (/(who.*this|who.*text|who.*is this|who dis|new phone)/i.test(t)) {
    return `Hey—it’s ${brandName}. We reconnect your old inbound leads with friendly SMS. Want a quick link to book a 10-min call?${link ? ' ' + link : ''}`;
  }
  return `Hey—it’s ${brandName}. We help revive old leads with compliant SMS. Want a 10-min walkthrough?${link ? ' ' + link : ''}`;
}

export async function generateReply({
  userBody,
  brandName,
  bookingLink,
  context,
}: {
  userBody: string;
  brandName: string;
  bookingLink?: string;
  context?: Record<string, any>;
}): Promise<{ kind: 'json'; intent: string; confidence: number; message: string; needs_footer?: boolean; actions?: any[]; hold_until?: string|null; policy_flags?: Record<string, boolean> } | { kind:'text'; message: string }> {
  const off = String(process.env.LLM_DISABLE || '').toLowerCase();
  if (off === '1' || off === 'true') {
    return { kind: 'text', message: simpleFallback(userBody, brandName, bookingLink) } as const;
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const userPayload = {
      brand: { name: brandName, booking_link: bookingLink || null },
      contact_text: userBody,
      context: context || {}
    };

    const res = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 220,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: JSON.stringify(userPayload) }
      ]
    });

    const raw = res.choices?.[0]?.message?.content?.trim() || '';
    let parsed: ORJSON | null = null;
    try { parsed = JSON.parse(raw); } catch {}

    if (parsed && typeof parsed.message === 'string') {
      let msg = parsed.message.slice(0, 320);
      console.log('[ai-reply] used=LLM input=', String(userBody).slice(0, 80));
      return {
        kind: 'json',
        intent: parsed.intent,
        confidence: Number(parsed.confidence || 0),
        message: msg,
        needs_footer: !!parsed.needs_footer,
        actions: parsed.actions || [],
        hold_until: parsed.hold_until || null,
        policy_flags: parsed.policy_flags || {}
      } as const;
    }

    console.log('[ai-reply] used=FALLBACK reason=', 'non-json');
    return { kind: 'text', message: simpleFallback(userBody, brandName, bookingLink) } as const;
  } catch (e) {
    console.log('[ai-reply] used=FALLBACK reason=', String((e as any)?.message || e));
    return { kind: 'text', message: simpleFallback(userBody, brandName, bookingLink) } as const;
  }
}
