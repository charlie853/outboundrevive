import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';

const SB_URL = (process.env.SUPABASE_URL || '').trim();
const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || '').trim();
const DEFAULT_ACCOUNT_ID = (process.env.DEFAULT_ACCOUNT_ID || '').trim();
const SYSTEM_PROMPT = (process.env.SMS_SYSTEM_PROMPT || 'You are Charlie from OutboundRevive...').trim();
const SAFE_FALLBACK = "Happy to help and share details. Would you like a quick 10-min call, or should I text a brief summary?";
const BOOKING_LINK = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || '').trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').trim();

export const config = {
  api: { bodyParser: true },
};

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

function withTimeout<T>(p: Promise<T>, ms = 450): Promise<T | 'timeout'> {
  return Promise.race([p, new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms))]);
}

function hasSchedulingIntentFromUser(input: string): boolean {
  const t = input.toLowerCase();
  if (/(send (the )?link|booking link|calendly)/i.test(t)) return true;
  if (/\b(book|schedule|reschedule|availability|slot|slots|opening|openings|calendar|meeting|appointment|appt)\b/i.test(t)) return true;
  return false;
}

function askedWhoIsThis(input: string): boolean {
  return /\b(who (is|\u2019s|'s) this|who dis)\b/i.test(input);
}

function sanitizeForLinkInjection(s: string): string {
  let out = s;

  out = out
    .replace(
      /(?:^|[.!?]\s*)([^.!?]*\bI can[\u2019']?t send links\b[^.!?]*)([.!?])?/gi,
      (_match, _sentence, endPunct = '') => (endPunct ? endPunct : ''),
    )
    .trim();

  out = out.replace(/(^|\.\s+)(?:but|however),?\s+/gi, '$1');

  out = out.replace(/\bI[\u2019']?m sorry,?\s*but\s*\.(\s|$)/gi, '');
  out = out.replace(/\s{2,}/g, ' ').trim();

  return out;
}

function escapeXml(s: string) {
  return s.replace(/[<>&'\"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' } as Record<string, string>)[c] || c,
  );
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
    sendTwiml(res, 'OK');
    return;
  }

  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const fromRaw = (body.From || body.from || '') as string;
    const toRaw = (body.To || body.to || '') as string;
    const text = String(body.Body || body.body || '').trim();
    const messageSid = String(body.MessageSid || body.SmsMessageSid || '').trim();

    const from = normPhone(fromRaw.trim());
    const to = normPhone(toRaw.trim());
    const accountId = DEFAULT_ACCOUNT_ID;
    const sbUrl = SB_URL;
    const sbKey = SB_KEY;

    if (!from || !to || !accountId || !sbUrl || !sbKey) {
      console.error('WEBHOOK_BAD_INPUT', { from, to, accountId, sbUrl, sbKeyPresent: Boolean(sbKey) });
      sendTwiml(res, SAFE_FALLBACK);
      return;
    }

    const accRows = await fetchJson<Array<{ account_id: string; brand?: string; autotexter_enabled?: boolean; phone_from?: string; booking_link?: string }>>(
      `${sbUrl}/rest/v1/account_settings?select=account_id,brand,autotexter_enabled,phone_from,booking_link&phone_from=eq.${encodeURIComponent(to)}`,
      {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      },
    );
    const acc = accRows?.[0] || {
      account_id: accountId,
      brand: 'OutboundRevive',
      autotexter_enabled: true,
      phone_from: to,
      booking_link: undefined,
    };
    const brandName = typeof acc.brand === 'string' && acc.brand.trim() ? acc.brand.trim() : 'OutboundRevive';

    if (messageSid) {
      const inUpsert = await fetch(`${sbUrl}/rest/v1/messages_in`, {
        method: 'POST',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
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
          sendTwiml(res, '');
          return;
        }
      }
    }

    const [insResp, outsResp] = await Promise.all([
      fetchJson<Array<{ created_at: string; body: string }>>(
        `${sbUrl}/rest/v1/messages_in?account_id=eq.${acc.account_id}&from_phone=eq.${encodeURIComponent(from)}&select=created_at,body&order=created_at.asc&limit=12`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
      ),
      fetchJson<Array<{ created_at: string; body: string }>>(
        `${sbUrl}/rest/v1/messages_out?account_id=eq.${acc.account_id}&to_phone=eq.${encodeURIComponent(from)}&select=created_at,body&order=created_at.asc&limit=12`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
      ),
    ]);

    const lastInboundAt = Array.isArray(insResp) && insResp.length ? new Date(insResp[insResp.length - 1].created_at) : null;
    const lastOutboundAt = Array.isArray(outsResp) && outsResp.length ? new Date(outsResp[outsResp.length - 1].created_at) : null;
    const hasPriorOutbound = Array.isArray(outsResp) && outsResp.length > 0;
    const contactCandidates = [lastInboundAt, lastOutboundAt].filter((d): d is Date => Boolean(d));
    const lastContactAt = contactCandidates.length
      ? contactCandidates.sort((a, b) => b.getTime() - a.getTime())[0]
      : null;
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const introNeeded = askedWhoIsThis(text) || !hasPriorOutbound || !lastContactAt || Date.now() - lastContactAt.getTime() > THIRTY_DAYS_MS;

    const mergedHistory = [
      ...(insResp || []).map((msg) => ({ at: msg.created_at, role: 'user' as const, content: msg.body })),
      ...(outsResp || []).map((msg) => ({ at: msg.created_at, role: 'assistant' as const, content: msg.body })),
    ]
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(-12)
      .map((msg) => ({ role: msg.role, content: msg.content }));

    let aiText = '';

    try {
      if (PUBLIC_BASE_URL) {
        const draft = await fetch(`${PUBLIC_BASE_URL}/api/internal/knowledge/draft`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-secret': INTERNAL_SECRET,
          },
          body: JSON.stringify({
            account_id: acc.account_id,
            q: text,
            history: mergedHistory,
            vars: { brand: brandName, booking_link: BOOKING_LINK || acc.booking_link },
            hints: { brand: brandName, should_introduce: introNeeded },
          }),
        });
        if (draft.ok) {
          const j = (await draft.json().catch(() => ({}))) as {
            reply?: string;
            intent?: string;
          };
          aiText = String(j?.reply ?? '').trim();
        } else {
          console.warn('DRAFT_CALL_BAD_STATUS', draft.status);
        }
      } else {
        console.warn('DRAFT_CALL_SKIPPED_NO_BASE');
      }
    } catch (err) {
      console.error('DRAFT_CALL_ERR', err);
    }

    if (!aiText && OPENAI_KEY) {
      try {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
          { role: 'system', content: SYSTEM_PROMPT.replaceAll('{{brand}}', brandName) },
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
        `${sbUrl}/rest/v1/messages_out?account_id=eq.${acc.account_id}&to_phone=eq.${encodeURIComponent(from)}&select=body&order=created_at.desc&limit=1`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
      );
      lastOut = String(lastRows?.[0]?.body || '');
    } catch (err) {
      console.error('LAST_OUT_FETCH_ERR', err);
    }

    if (aiText && nearDuplicate(aiText, lastOut)) {
      aiText = aiText.replace(/(\.|!|\?)?$/, ' — would Tues 10am or 2pm work?');
    }

    if (!aiText) aiText = SAFE_FALLBACK;

    if (introNeeded && !/\bOutboundRevive\b/i.test(aiText) && !/\bCharlie\b/i.test(aiText)) {
      aiText = `Hi, it's Charlie from OutboundRevive with ${brandName}. ${aiText}`;
    }

    let finalText = (aiText || SAFE_FALLBACK).trim();
    const calLink = (BOOKING_LINK || acc.booking_link || '').trim();
    const userWantsScheduling = hasSchedulingIntentFromUser(text);
    let allowLink = false;

    try {
      if (userWantsScheduling && calLink) {
        const since = encodeURIComponent(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        const encTo = encodeURIComponent(from);
        const url =
          `${sbUrl}/rest/v1/messages_out?account_id=eq.${acc.account_id}` +
          `&to_phone=eq.${encTo}&created_at=gte.${since}` +
          '&select=created_at,body&order=created_at.desc';

        const r = await fetch(url, {
          headers: {
            apikey: sbKey,
            Authorization: `Bearer ${sbKey}`,
          },
        });

        const arr = await r.json().catch(() => []);
        const alreadySent = Array.isArray(arr) && arr.some((msg) => String(msg?.body || '').includes(calLink));
        const replyAlreadyHasLink = aiText.includes(calLink);
        allowLink = !alreadySent && !replyAlreadyHasLink;
      }
    } catch (err) {
      console.error('LINK_GATE_ERROR', err);
      allowLink = false;
    }

    if (allowLink && calLink) {
      const cleaned = sanitizeForLinkInjection(aiText).trim();
      finalText = `${cleaned} ${calLink}`.trim();
    }

    const persist = (async () => {
      try {
        let leadId: string | null = null;
        try {
          const up = await fetch(`${sbUrl}/rest/v1/leads?on_conflict=phone`, {
            method: 'POST',
            headers: {
              apikey: sbKey,
              Authorization: `Bearer ${sbKey}`,
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
          if (!up.ok) {
            console.error('LEAD_UPSERT_BAD_STATUS', up.status, await up.text());
          } else {
            const leadRows = (await up.json().catch(() => [])) as Array<{ id?: string }>;
            leadId = Array.isArray(leadRows) && leadRows[0]?.id ? String(leadRows[0].id) : null;
          }
        } catch (leadErr) {
          console.error('LEAD_UPSERT_ERROR', leadErr);
        }

        const { error } = await supabaseAdmin.from('messages_out').insert([
          {
            account_id: acc.account_id,
            lead_id: leadId,
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
    })();

    const persistResult = await withTimeout(persist, 450);
    if (persistResult === 'timeout') {
      console.warn('OUTBOUND_PERSIST_TIMEOUT');
    }

    if (messageSid) {
      void fetch(`${sbUrl}/rest/v1/messages_in?message_sid=eq.${encodeURIComponent(messageSid)}`, {
        method: 'PATCH',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ processed: true }),
      }).catch((err) => console.error('INBOUND_MARK_PROCESSED_ERR', err));
    }

    sendTwiml(res, finalText);
  } catch (err) {
    console.error('WEBHOOK_FATAL', err);
    sendTwiml(res, SAFE_FALLBACK);
  }
}

function sendTwiml(res: NextApiResponse, message: string) {
  res.setHeader('Content-Type', 'text/xml');
  const trimmed = (message || '').trim();
  const body = trimmed
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(trimmed)}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  res.status(200).send(body);
}
