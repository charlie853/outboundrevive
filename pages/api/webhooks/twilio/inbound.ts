/* LLM-first inbound Twilio webhook (Pages API)
   - parses x-www-form-urlencoded
   - calls /api/ai/draft
   - sends via /api/sms/send (persisted to messages_out)
   - returns empty TwiML to avoid dup sends
*/
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { api: { bodyParser: false } };

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' } as any)[c]
  );
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  // --- Parse Twilio form payload ---
  const raw = await readRawBody(req);
  const form = new URLSearchParams(raw);
  const fromPhone = (form.get('From') || '').trim();  // lead's phone
  const toPhone   = (form.get('To')   || '').trim();  // your Twilio number
  const textRaw   = (form.get('Body') || '').trim();

  const accountId = (process.env.DEFAULT_ACCOUNT_ID || '').trim();
  const baseUrl   = (process.env.PUBLIC_BASE_URL || '').trim();
  const secret    = (process.env.INTERNAL_API_SECRET || '').trim();
  const calUrl    = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || process.env.CAL_URL || '').trim();

  if (!fromPhone || !toPhone || !accountId || !baseUrl || !secret) {
    // Acknowledge to Twilio to stop retries, but don't send an outbound.
    return res
      .status(200)
      .setHeader('Content-Type', 'text/xml')
      .send('<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(aiReply)}</Message></Response>');
  }

  // --- LLM draft call (first pass) ---
  async function aiDraft(prompt: string, hints: any = {}) {
    const r = await fetch(`${baseUrl}/api/ai/draft`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ account_id: accountId, q: prompt, hints })
    }).catch(() => null);

    if (!r || !r.ok) return '';
    const j: any = await r.json().catch(() => ({}));
    return (j?.reply || j?.draft || '').trim();
  }

  // System rules for the SMS model are in SMS_SYSTEM_PROMPT env on Vercel.
  const basePrompt = `Only output one SMS (<=320 chars). Be direct and specific. User said: "${textRaw}"`;

  let aiReply = await aiDraft(basePrompt, { brand: 'OutboundRevive', should_introduce: false });

  // Special-case: whois
  if (/^\s*(who\s+is\s+this|who[’'`]s\s+this|who\s+dis)\s*$/i.test(textRaw)) {
    aiReply = 'Charlie from OutboundRevive.';
  }

  // Retry once if blank
  if (!aiReply) {
    aiReply = await aiDraft(`Reply with a single helpful SMS (<=320 chars) to: "${textRaw}"`, {});
  }

  // Smart Calendly append for schedule intent
  const wantsSchedule = /\b(book|schedule|zoom|call)\b/i.test(textRaw);
  if (wantsSchedule && calUrl && !aiReply.includes(calUrl)) {
    aiReply = aiReply ? `${aiReply} ${calUrl}` : `Here’s my booking link: ${calUrl}`;
  }

  // Final guard: if still blank, send the minimal identity line (better than a dead end)
  if (!aiReply) {
    aiReply = 'Charlie from OutboundRevive.';
  }

  // --- REST-only send & persist ---
  await fetch(`${baseUrl}/api/sms/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify({
      account_id: accountId,
      // lead_id optional—your /api/sms/send can resolve by phone
      to: fromPhone,    // outbound goes back to the sender
      from: toPhone,    // your Twilio number
      body: aiReply,
      sent_by: 'ai'
    })
  }).catch(() => { /* swallow, we still ack Twilio */ });

  // --- Ack Twilio with empty TwiML to avoid double-send ---
  return res
    .status(200)
    .setHeader('Content-Type', 'text/xml')
    .send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
}
