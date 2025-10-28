import type { NextApiRequest, NextApiResponse } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MessagingResponse } from 'twilio/lib/twiml/MessagingResponse';
import { supabaseAdmin } from '@/lib/supabaseServer';

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || '';
const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID!;
const SYSTEM_PROMPT = process.env.SMS_SYSTEM_PROMPT || 'You are Charlie from OutboundRevive...';
const SAFE_FALLBACK = "Happy to help and share details. Would you like a quick 10-min call, or should I text a brief summary?";
const BOOKING_LINK = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || '').trim();

function normPhone(s: string) {
  const d = (s || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) return `+${d.replace(/^\++/, '')}`;
  const digits = d.replace(/^\++/, '');
  const withCountry = digits.length === 10 ? `1${digits}` : digits;
  return `+${withCountry}`;
}

function nearDuplicate(a: string, b: string) {
  const na = a.toLowerCase().replace(/\s+/g, ' ').trim();
  const nb = b.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  const tokensA = new Set(na.split(/\W+/).filter(Boolean));
  const tokensB = new Set(nb.split(/\W+/).filter(Boolean));
  const intersection = [...tokensA].filter((token) => tokensB.has(token)).length;
  const union = new Set([...tokensA, ...tokensB]).size || 1;
  return intersection / union > 0.9;
}

async function hasSentLinkInLast24h(
  supabase: SupabaseClient,
  accountId: string,
  toPhone: string,
  link: string,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('messages_out')
      .select('body')
      .eq('account_id', accountId)
      .eq('to_phone', toPhone)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('LINK_HIST_ERR', error);
      return false;
    }
    return (data ?? []).some((row) => (row.body ?? '').includes(link));
  } catch (err) {
    console.error('LINK_HIST_EX', err);
    return false;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, init);
  const text = await resp.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    return ([] as unknown) as T;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('');
    return;
  }

  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const fromRaw = (body.From || body.from || '') as string;
    const toRaw = (body.To || body.to || '') as string;
    const text = String(body.Body || body.body || '').trim();
    const messageSid = String(body.MessageSid || body.SmsMessageSid || '').trim();

    const from = normPhone(fromRaw);
    const to = normPhone(toRaw);

    if (!from || !to) {
      respond(res, SAFE_FALLBACK);
      return;
    }

    const accRows = await fetchJson<Array<{ account_id: string; brand?: string; autotexter_enabled?: boolean; phone_from?: string; booking_link?: string }>>(
      `${SB_URL}/rest/v1/account_settings?select=account_id,brand,autotexter_enabled,phone_from,booking_link&phone_from=eq.${encodeURIComponent(to)}`,
      {
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      },
    );
    const acc = accRows?.[0] || {
      account_id: DEFAULT_ACCOUNT_ID,
      brand: 'OutboundRevive',
      autotexter_enabled: true,
      phone_from: to,
      booking_link: undefined,
    };

    if (messageSid) {
      const inUpsert = await fetch(`${SB_URL}/rest/v1/messages_in`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'content-type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify([
          {
            message_sid: messageSid,
            account_id: acc.account_id,
            from_phone: from,
            to_phone: to,
            body: text,
            processed: false,
          },
        ]),
      });
      if (!inUpsert.ok) {
        const errBody = await inUpsert.text();
        const lower = errBody.toLowerCase();
        if (lower.includes('duplicate') || lower.includes('unique')) {
          res.setHeader('Content-Type', 'text/xml');
          res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
          return;
        }
      }
    }

    const leadUpsert = await fetch(`${SB_URL}/rest/v1/leads?on_conflict=phone`, {
      method: 'POST',
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        'content-type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify([
        {
          account_id: acc.account_id,
          phone: from,
          name: from,
          status: 'active',
        },
      ]),
    });
    const leadRows = (await leadUpsert.json().catch(() => [])) as Array<{ id: string }>;
    const lead = leadRows?.[0];

    const [insResp, outsResp] = await Promise.all([
      fetchJson<Array<{ created_at: string; body: string }>>(
        `${SB_URL}/rest/v1/messages_in?account_id=eq.${acc.account_id}&from_phone=eq.${encodeURIComponent(from)}&select=created_at,body&order=created_at.asc&limit=12`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
      ),
      fetchJson<Array<{ created_at: string; body: string }>>(
        `${SB_URL}/rest/v1/messages_out?account_id=eq.${acc.account_id}&to_phone=eq.${encodeURIComponent(from)}&select=created_at,body&order=created_at.asc&limit=12`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
      ),
    ]);

    const mergedHistory = [
      ...(insResp || []).map((msg) => ({ at: msg.created_at, role: 'user' as const, content: msg.body })),
      ...(outsResp || []).map((msg) => ({ at: msg.created_at, role: 'assistant' as const, content: msg.body })),
    ]
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(-12)
      .map((msg) => ({ role: msg.role, content: msg.content }));

    let aiText = '';
    let aiIntent = '';

    try {
      const draft = await fetch(`${process.env.PUBLIC_BASE_URL || ''}/api/internal/knowledge/draft`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
        body: JSON.stringify({
          account_id: acc.account_id,
          q: text,
          history: mergedHistory,
          vars: { brand: acc.brand, booking_link: BOOKING_LINK || acc.booking_link },
        }),
      });
      if (draft.ok) {
        const j = (await draft.json().catch(() => ({}))) as {
          reply?: string;
          intent?: string;
        };
        aiText = String(j?.reply ?? '').trim();
        aiIntent = typeof j?.intent === 'string' ? j.intent : '';
      }
    } catch (err) {
      console.error('DRAFT_CALL_ERR', err);
    }

    if (!aiText) {
      try {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: SYSTEM_PROMPT.replaceAll('{{brand}}', acc.brand || 'OutboundRevive') },
          ...mergedHistory,
          { role: 'user', content: text },
        ];
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify({ model: OPENAI_MODEL, temperature: 0.5, top_p: 0.9, messages }),
        });
        const completion = (await resp.json().catch(() => ({}))) as { choices?: Array<{ message?: { content?: string } }> };
        aiText = String(completion?.choices?.[0]?.message?.content ?? '').trim();
      } catch (err) {
        console.error('OPENAI_FALLBACK_ERR', err);
      }
    }

    let lastOut = '';
    try {
      const lastRows = await fetchJson<Array<{ body: string }>>(
        `${SB_URL}/rest/v1/messages_out?account_id=eq.${acc.account_id}&to_phone=eq.${encodeURIComponent(from)}&select=body&order=created_at.desc&limit=1`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
      );
      lastOut = String(lastRows?.[0]?.body || '');
    } catch (err) {
      console.error('LAST_OUT_FETCH_ERR', err);
    }

    if (aiText && nearDuplicate(aiText, lastOut)) {
      aiText = aiText.replace(/(\.|!|\?)?$/, ' — would Tues 10am or 2pm work?');
    }

    if (!aiText) aiText = SAFE_FALLBACK;
    const intent = aiIntent.toLowerCase();
    let finalText = (aiText || SAFE_FALLBACK).trim();
    const bookingLink = BOOKING_LINK;
    const schedulingIntent =
      ['book', 'availability', 'reschedule', 'confirm_booking'].includes(intent) ||
      /book|schedule|availability|resched|time work|what time|tomorrow|today|this week/i.test(text || '');

    if (bookingLink && schedulingIntent) {
      const already = await hasSentLinkInLast24h(supabaseAdmin, acc.account_id, from, bookingLink);
      if (!already && !finalText.includes(bookingLink)) {
        finalText = `${finalText} ${bookingLink}`.trim();
      }
    }

    try {
      const { error } = await supabaseAdmin.from('messages_out').insert([
        {
          account_id: acc.account_id,
          lead_id: lead?.id || null,
          to_phone: from,
          from_phone: to,
          body: finalText,
          status: 'queued',
          provider: 'twilio',
          source: 'ai',
          channel: 'sms',
        },
      ]);
      if (error) {
        console.error('OUTBOUND_INSERT_ERR', error);
      }
    } catch (err) {
      console.error('OUTBOUND_INSERT_ERR', err);
    }

    if (messageSid) {
      void fetch(`${SB_URL}/rest/v1/messages_in?message_sid=eq.${encodeURIComponent(messageSid)}`, {
        method: 'PATCH',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ processed: true }),
      }).catch((err) => console.error('INBOUND_MARK_PROCESSED_ERR', err));
    }

    respond(res, finalText);
  } catch (err) {
    console.error('WEBHOOK_FATAL', err);
    respond(res, SAFE_FALLBACK);
  }
}

function respond(res: NextApiResponse, message: string) {
  const twiml = new MessagingResponse();
  twiml.message(message);
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());
}
