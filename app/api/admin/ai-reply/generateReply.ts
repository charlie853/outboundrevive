import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

function simpleFallback(userBody: string, brandName = 'OutboundRevive', link?: string) {
  const t = (userBody || '').toLowerCase();
  if (/(price|cost|charge|pricing)/i.test(t)) {
    return `Quick pricing overview from ${brandName}: flexible plans based on lead volume.${link ? ` Want me to send a quote? ${link}` : ''}`;
  }
  if (/(hubspot|integrat)/i.test(t)) {
    return `Yes—${brandName} integrates with HubSpot (and other CRMs).${link ? ` Want a quick link to see how it connects? ${link}` : ''}`;
  }
  if (/(who.*this|who.*text|who.*is this|who dis|new phone)/i.test(t)) {
    return `Hey—it’s ${brandName}. We reconnect your old inbound leads with friendly SMS.${link ? ` Want a quick link to book a 10‑min call? ${link}` : ''}`;
  }
  return `Hey—it’s ${brandName}. We help revive old leads with compliant SMS.${link ? ` Want a 10‑min walkthrough? ${link}` : ''}`;
}

export async function generateReply(accountId: string | null, userBody: string): Promise<string> {
  const off = String(process.env.LLM_DISABLE || '').toLowerCase();
  if (off === '1' || off === 'true') return simpleFallback(userBody);

  const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  let prompt_system =
    "You are {{BRAND}}'s SMS assistant. Reply in under 160 chars. Be friendly, specific, and helpful. If it makes sense, include {{BOOKING_LINK}}. Never invent facts.";
  let prompt_examples: Array<{ user: string; assistant: string }> = [];
  let booking_link: string | null = null;
  let brand: string | null = 'OutboundRevive';

  if (accountId) {
    const { data: acct } = await supa
      .from('account_settings')
      .select('prompt_system, prompt_examples, booking_link, brand')
      .eq('account_id', accountId)
      .maybeSingle();
    if (acct?.prompt_system) prompt_system = String(acct.prompt_system);
    if (acct?.prompt_examples) prompt_examples = acct.prompt_examples as any[];
    if (acct?.booking_link) booking_link = String(acct.booking_link);
    if (acct?.brand) brand = String(acct.brand);
  }

  const brandName = brand ?? 'OutboundRevive';
  const link = booking_link ?? '';
  const apply = (s: string) => s.replaceAll('{{BOOKING_LINK}}', link).replaceAll('{{BRAND}}', brandName);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  try {
    const messages = [
      { role: 'system' as const, content: apply(prompt_system) },
      ...(prompt_examples || []).slice(0, 10).flatMap((ex) => [
        { role: 'user' as const, content: ex.user },
        { role: 'assistant' as const, content: apply(String(ex.assistant)) },
      ]),
      { role: 'user' as const, content: String(userBody || '') },
    ];

    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages,
      temperature: 0.5,
      max_tokens: 160,
    });

    let txt = res.choices?.[0]?.message?.content?.trim() || '';
    if (!txt) throw new Error('empty-llm-reply');
    if (txt.length > 300) txt = txt.slice(0, 300);
    console.log('[ai-reply] used=LLM input=', String(userBody || '').slice(0, 80));
    return txt;
  } catch (e) {
    console.log('[ai-reply] used=FALLBACK reason=', String((e as any)?.message || e));
    return simpleFallback(userBody, brandName, link);
  }
}
