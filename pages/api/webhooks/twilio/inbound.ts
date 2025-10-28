import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID!;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').trim();
const CAL_BOOKING_URL = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || '').trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function normUS(raw: string | undefined): string {
  if (!raw) return '';
  const d = (raw + '').replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  if (/^\+1\d{10}$/.test(raw)) return raw;
  return '';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function draftLLM(origin: string, accountId: string, brand: string, userText: string) {
  const url = origin
    ? `${origin}/api/ai/draft`
    : PUBLIC_BASE_URL
    ? `${PUBLIC_BASE_URL}/api/ai/draft`
    : `/api/ai/draft`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      account_id: accountId,
      q: `Only output one SMS (<=320 chars). Be direct, specific, and helpful. User said: "${userText}".`,
      hints: { brand, should_introduce: false },
    }),
  });
  if (!res.ok) return '';
  const j = (await res.json().catch(() => ({}))) as { reply?: string };
  return (j?.reply || '').trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  let Body = (req.body && (req.body.Body ?? req.body.body ?? req.body.text)) || '';
  let From = (req.body && (req.body.From ?? req.body.from)) || '';
  let To = (req.body && (req.body.To ?? req.body.to)) || '';

  if ((!Body || !From) && req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        (req as any).on('data', (c: Buffer) => chunks.push(c));
        (req as any).on('end', () => resolve());
      });
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      Body = Body || form.get('Body') || '';
      From = From || form.get('From') || '';
      To = To || form.get('To') || '';
    } catch {
      // ignore
    }
  }

  const textRaw = (Body || '').toString().trim();
  const fromPhone = normUS(From);
  const toPhone = normUS(To);
  const accountId = DEFAULT_ACCOUNT_ID;

  if (!textRaw || !fromPhone) {
    res.setHeader('Content-Type', 'application/xml');
    return res
      .status(200)
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  }

  let brand = 'OutboundRevive';
  try {
    const { data } = await supabase
      .from('account_settings')
      .select('brand')
      .eq('account_id', accountId)
      .limit(1)
      .maybeSingle();
    if (data?.brand) brand = data.brand;
  } catch {}

  let leadId: string | null = null;
  try {
    const { data: got } = await supabase
      .from('leads')
      .select('id')
      .eq('account_id', accountId)
      .eq('phone', fromPhone)
      .limit(1);
    if (got && got.length) {
      leadId = got[0].id;
    } else {
      const { data: ins } = await supabase
        .from('leads')
        .insert({ account_id: accountId, phone: fromPhone, name: null, status: 'active' })
        .select('id')
        .limit(1);
      leadId = ins?.[0]?.id || null;
    }
  } catch {}

  try {
    await supabase.from('messages_in').insert({
      account_id: accountId,
      from_phone: fromPhone,
      to_phone: toPhone || null,
      body: textRaw,
      processed: false,
      lead_id: leadId,
    });
    if (leadId) {
      await supabase
        .from('leads')
        .update({ last_inbound_at: new Date().toISOString(), last_reply_body: textRaw })
        .eq('id', leadId);
    }
  } catch {}

  const origin = PUBLIC_BASE_URL || (req.headers.host ? `https://${req.headers.host}` : '');
  let aiReply = await draftLLM(origin, accountId, brand, textRaw);

  if (!aiReply) {
    aiReply = await draftLLM(
      origin,
      accountId,
      brand,
      `Only output one SMS (<=320 chars). No filler. Respond specifically to: "${textRaw}".`,
    );
  }

  const wantsSchedule = /\b(book|schedule|zoom|call)\b/i.test(textRaw);
  if (wantsSchedule && CAL_BOOKING_URL) {
    if (aiReply && !aiReply.includes(CAL_BOOKING_URL)) {
      aiReply = `${aiReply} ${CAL_BOOKING_URL}`.trim();
    } else if (!aiReply) {
      aiReply = `Here's my booking link: ${CAL_BOOKING_URL}`;
    }
  }

  aiReply = (aiReply || '').trim();
  if (!aiReply) {
    res.setHeader('Content-Type', 'application/xml');
    return res
      .status(200)
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>One sec - reconnecting.</Message></Response>`,
      );
  }

  try {
    await supabase.from('messages_out').insert({
      account_id: accountId,
      lead_id: leadId,
      to_phone: fromPhone,
      from_phone: toPhone || null,
      body: aiReply,
      sent_by: 'ai',
      provider: 'twilio',
      provider_status: 'queued',
      status: 'sent',
    });
    if (leadId) {
      await supabase
        .from('leads')
        .update({ last_sent_at: new Date().toISOString(), last_reply_body: textRaw })
        .eq('id', leadId);
    }
  } catch {}

  res.setHeader('Content-Type', 'application/xml');
  return res
    .status(200)
    .send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(aiReply)}</Message></Response>`,
    );
}
