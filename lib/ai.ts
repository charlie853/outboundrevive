// lib/ai.ts
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

type DraftParams = {
  brand: string;
  booking?: string;
  lead: { name?: string | null; phone: string };
  lastInbound: string;
  managedMode?: boolean;
};

export async function draftSmsReply({
  brand,
  booking,
  lead,
  lastInbound,
  managedMode = true,
}: DraftParams): Promise<string> {
  const system = [
    `You are the SMS assistant for ${brand}.`,
    `Constraints:`,
    `- Keep replies <= 160 characters.`,
    `- Warm, concise, human tone; no emojis.`,
    `- Do NOT include "Txt STOP to opt out" (the platform adds it if needed).`,
    `- If booking link is provided, prefer sharing it: ${booking || '(none)'} .`,
    `- If user asks to stop, do not send a marketing reply (platform handles STOP).`,
    `- If unclear, ask a short clarifying question or offer a quick time window.`,
    `- Avoid quoting prices or medical claims; suggest confirming on the call.`,
    `Managed mode: ${managedMode ? 'enabled' : 'disabled'} (assume managed).`,
  ].join('\n');

  // !!! - Need to pass the entire message history into the 
  // model, not just last inbound
  const user = [
    `Lead name: ${lead.name || 'there'} (${lead.phone})`,
    `Last inbound message: "${lastInbound}"`,
    booking ? `Booking link available: ${booking}` : `No booking link available.`,
    `Reply in one SMS (<=160 chars).`,
  ].join('\n');

  const resp = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
      max_tokens: 120,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`OpenAI error: ${resp.status} ${err}`);
  }
  const json = await resp.json();
  const text: string | undefined = json?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('No draft returned from OpenAI');
  // Hard trim in case a model goes long
  return text.length > 160 ? text.slice(0, 160) : text;
}