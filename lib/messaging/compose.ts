import { getSettings, getKB, getObjections, pickInitialVariant } from './store';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function composeInitial({ account_id, lead, track }:{ account_id: string; lead: any; track: 'new'|'old' }) {
  const chosen = await pickInitialVariant(account_id, track);
  const name = (lead.name || lead.first_name || '').split(' ')[0] || '';
  const text = (chosen?.body || 'Hi {{first_name}}—{{brand}} here. Quick question: open to a short walkthrough?')
    .replace('{{first_name}}', name);
  return { text, meta: { variant: chosen?.variant || 'A', track } };
}

export async function composeFollowup({ account_id, lead, lastInbound }:{ account_id: string; lead: any; lastInbound: string }) {
  const s = await getSettings(account_id);
  const kb = await getKB(account_id);
  const objections = await getObjections(account_id);

  const system = [
    `You are an SMS assistant for ${s.brand}.`,
    `Goal: politely advance the conversation and offer booking via ${s.booking_link || '<<no link set>>'}.`,
    `Style: concise, friendly, no emojis, 1 question at a time, under 240 chars.`,
    `Respect quiet hours ${s.quiet_start}-${s.quiet_end} ${s.timezone}.`,
    `Comply with PAUSE/RESUME/HELP and legacy STOP/UNSTOP keywords.`,
  ].join('\n');

  const tools = [
    { name: 'kb', content: kb.map(x => `[${x.tag || 'kb'}] ${x.title || ''}: ${x.body || ''}`).join('\n') },
    { name: 'objections', content: objections.map(o => `${o.label}: ${o.script}`).join('\n') },
  ];

  const prompt = [
    `Lead message: "${lastInbound}"`,
    `If the lead raises a common objection, address it using objection scripts.`,
    `If they ask for pricing/process, summarize briefly and offer the booking link.`,
    `End with a short question to advance or confirm booking.`,
  ].join('\n');

  if (!process.env.OPENAI_API_KEY) {
    // Fallback if no LLM key set
    return { text: `Thanks — happy to help. Want me to share a quick booking link${s.booking_link ? ` (${s.booking_link})` : ''}?` };
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: system },
    { role: 'user', content: `TOOLS\n${tools.map(t => `<${t.name}>\n${t.content}\n</${t.name}>`).join('\n')}` },
    { role: 'user', content: prompt },
  ];

  const r = await openai.chat.completions.create({
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    messages,
    temperature: 0.5,
    max_tokens: 150,
  });
  const text = r.choices?.[0]?.message?.content?.trim?.() || 'Got it—want to pick a time?';
  return { text };
}
