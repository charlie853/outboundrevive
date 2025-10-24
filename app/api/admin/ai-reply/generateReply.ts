import OpenAI from 'openai';

export async function generateReply(accountId: string | undefined, userBody: string): Promise<string> {
  try {
    const disabled = String(process.env.LLM_DISABLE || '').match(/^(1|true)$/i);
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (disabled || !apiKey) throw new Error('llm_disabled');

    const openai = new OpenAI({ apiKey });
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const system = 'You are a concise, friendly SMS assistant for OutboundRevive. Keep replies short (1–2 sentences, <=300 chars). If appropriate, suggest booking a quick call.';

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 180,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: String(userBody) }
      ]
    });

    let txt = completion.choices?.[0]?.message?.content?.trim() || '';
    if (!txt) throw new Error('empty_llm');
    if (txt.length > 300) txt = txt.slice(0, 300);
    return txt;
  } catch (e) {
    // Guaranteed fallback
    return "Hi — it’s OutboundRevive. We re-engage your leads with friendly SMS. Want a quick link to book a 10‑min call?";
  }
}

