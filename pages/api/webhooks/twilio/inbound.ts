import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_ACCOUNT_ID = (process.env.DEFAULT_ACCOUNT_ID || '').trim();
const SAFE_FALLBACK = "Happy to help and share details. Would you like a quick 10-min call, or should I text a brief summary?";
const BOOKING_LINK = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || '').trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').trim();
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || '').trim();

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

const clean = (p: string) => (p || '').replace(/\s+/g, '').replace(/\r/g, '');

function isSchedulingIntent(message: string): boolean {
  const msg = (message || '').toLowerCase();
  const booking = /\b(book|schedule|reschedul|move|slot|availability|available|time|tomorrow|today|next\s+(mon|tue|wed|thu|fri|week))\b/;
  const modality = /\b(call|meeting|appt|appointment|zoom|phone|chat)\b/;
  return booking.test(msg) && modality.test(msg);
}

function askedWhoIsThis(input: string): boolean {
  return /\bwho\s+is\s+(this|that)\b/i.test(input || '');
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

async function sentLinkInLast24h(supabase: SupabaseClient, accountId: string, toPhone: string, bookingUrl: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('messages_out')
    .select('id,body,created_at')
    .eq('account_id', accountId)
    .eq('to_phone', toPhone)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) {
    if (error) console.error('LINK_HISTORY_ERR', error);
    return false;
  }

  return data.some((row) => String(row?.body || '').includes(bookingUrl));
}

function sendTwiml(res: NextApiResponse, message: string) {
  res.setHeader('Content-Type', 'text/xml');
  const trimmed = (message || '').trim();
  const body = trimmed
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(trimmed)}</Message></Response>`
    : '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  res.status(200).send(body);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    sendTwiml(res, 'OK');
    return;
  }

  try {
    const payload = (req.body || {}) as Record<string, unknown>;
    const fromInput = clean(String((payload.From ?? payload.from ?? '') || ''));
    const toInput = clean(String((payload.To ?? payload.to ?? '') || ''));
    const bodyText = String(payload.Body ?? payload.body ?? '').trim();
    const profileName = typeof payload.ProfileName === 'string' ? String(payload.ProfileName).trim() : null;

    const from = normPhone(fromInput);
    const to = normPhone(toInput);

    if (!from || !to || !DEFAULT_ACCOUNT_ID) {
      console.error('WEBHOOK_BAD_INPUT', { from, to });
      sendTwiml(res, SAFE_FALLBACK);
      return;
    }

    const supabaseUrl = process.env.SUPABASE_URL?.trim();
    const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!supabaseServiceRole || !supabaseUrl) {
      console.error('FATAL_NO_SERVICE_ROLE');
      sendTwiml(res, SAFE_FALLBACK);
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRole);

    let accountId = DEFAULT_ACCOUNT_ID;
    let brand = 'OutboundRevive';
    let accountBookingLink = '';

    try {
      const { data: acctRows, error: acctErr } = await supabase
        .from('account_settings')
        .select('account_id,brand,booking_link')
        .eq('phone_from', to)
        .limit(1);

      if (acctErr) {
        console.error('ACCOUNT_LOOKUP_ERR', acctErr);
      }

      if (Array.isArray(acctRows) && acctRows.length) {
        accountId = acctRows[0].account_id || accountId;
        brand = acctRows[0].brand?.trim() || brand;
        accountBookingLink = acctRows[0].booking_link?.trim() || '';
      }
    } catch (lookupErr) {
      console.error('ACCOUNT_LOOKUP_EX', lookupErr);
    }

    const leadName =
      profileName && profileName.length
        ? profileName
        : bodyText
        ? bodyText.slice(0, 80)
        : 'New Lead';

    const { data: leadRows, error: leadUpsertErr } = await supabase
      .from('leads')
      .upsert(
        {
          account_id: accountId,
          phone: from,
          name: leadName,
          status: 'active',
        },
        { onConflict: 'account_id,phone' },
      )
      .select('id')
      .single();

    if (leadUpsertErr) console.error('INBOUND_LEAD_UPSERT_ERR', leadUpsertErr);

    const leadId = leadRows?.id ?? null;

    const { error: inErr } = await supabase.from('messages_in').insert({
      account_id: accountId,
      lead_id: leadId,
      from_phone: from,
      to_phone: to,
      body: bodyText ?? '',
      processed: false,
    });

    if (inErr) console.error('INBOUND_DB_INSERT_ERR', inErr);

    const { error: bumpErr } = await supabase
      .from('leads')
      .update({ last_inbound_at: new Date().toISOString(), last_reply_body: bodyText ?? '' })
      .eq('id', leadId ?? '__no_lead__')
      .eq('account_id', accountId);

    if (bumpErr) console.error('INBOUND_LEAD_ACTIVITY_ERR', bumpErr);

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    const [inHistoryResult, outHistoryResult] = await Promise.all([
      supabase
        .from('messages_in')
        .select('created_at,body')
        .eq('account_id', accountId)
        .eq('from_phone', from)
        .order('created_at', { ascending: true })
        .limit(12),
      supabase
        .from('messages_out')
        .select('created_at,body')
        .eq('account_id', accountId)
        .eq('to_phone', from)
        .order('created_at', { ascending: true })
        .limit(12),
    ]);

    if (inHistoryResult.error) console.error('IN_HISTORY_ERR', inHistoryResult.error);
    if (outHistoryResult.error) console.error('OUT_HISTORY_ERR', outHistoryResult.error);

    const inboundHistoryRaw = Array.isArray(inHistoryResult.data) ? inHistoryResult.data : [];
    const outboundHistoryRaw = Array.isArray(outHistoryResult.data) ? outHistoryResult.data : [];

    const inboundHistory = inboundHistoryRaw.map((msg) => ({ at: msg.created_at, role: 'user' as const, content: msg.body || '' }));
    const outboundHistory = outboundHistoryRaw.map((msg) => ({ at: msg.created_at, role: 'assistant' as const, content: msg.body || '' }));

    const hasHistory = inboundHistory.length > 0 || outboundHistory.length > 0;
    const lastInboundTimestamp = inboundHistoryRaw.length
      ? Date.parse(inboundHistoryRaw[inboundHistoryRaw.length - 1].created_at)
      : null;
    const lastOutboundTimestamp = outboundHistoryRaw.length
      ? Date.parse(outboundHistoryRaw[outboundHistoryRaw.length - 1].created_at)
      : null;
    const timestampCandidates = [lastInboundTimestamp, lastOutboundTimestamp].filter(
      (v): v is number => typeof v === 'number' && !Number.isNaN(v),
    );
    const lastContactTimestamp = timestampCandidates.length ? Math.max(...timestampCandidates) : null;

    let shouldIntroduce = askedWhoIsThis(bodyText) || !hasHistory;
    if (!shouldIntroduce && lastContactTimestamp !== null) {
      shouldIntroduce = Date.now() - lastContactTimestamp > THIRTY_DAYS_MS;
    }

    const llmHistory = [...inboundHistory, ...outboundHistory]
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(-12)
      .map((entry) => ({ role: entry.role, content: entry.content }));

    let reply = '';

    if (PUBLIC_BASE_URL && INTERNAL_SECRET) {
      try {
        const draftResp = await fetch(`${PUBLIC_BASE_URL}/api/internal/knowledge/draft`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-secret': INTERNAL_SECRET,
          },
          body: JSON.stringify({
            account_id: accountId,
            q: bodyText,
            history: llmHistory,
            hints: { brand, should_introduce: shouldIntroduce },
          }),
        });

        if (draftResp.ok) {
          const draftJson = (await draftResp.json().catch(() => ({}))) as { reply?: string };
          reply = String(draftJson?.reply || '').trim();
        } else {
          console.warn('DRAFT_CALL_BAD_STATUS', draftResp.status, await draftResp.text());
        }
      } catch (draftErr) {
        console.error('DRAFT_CALL_ERR', draftErr);
      }
    } else {
      console.warn('DRAFT_CALL_SKIPPED_NO_BASE');
    }

    if (!reply) {
      reply = SAFE_FALLBACK;
    }

    if (shouldIntroduce && !/\bOutboundRevive\b/i.test(reply) && !/\bCharlie\b/i.test(reply)) {
      reply = `Hi, it's Charlie from OutboundRevive with ${brand}. ${reply}`;
    }

    let finalReply = reply.trim();
    const bookingUrl = (BOOKING_LINK || accountBookingLink || '').trim();

    try {
      if (bookingUrl && isSchedulingIntent(bodyText)) {
        const alreadySent = await sentLinkInLast24h(supabase, accountId, from, bookingUrl);
        if (!alreadySent && !finalReply.includes(bookingUrl)) {
          finalReply = `${sanitizeForLinkInjection(finalReply)} ${bookingUrl}`.trim();
        }
      }
    } catch (linkErr) {
      console.error('LINK_DECISION_ERR', linkErr);
    }

    const { error: outErr } = await supabase.from('messages_out').insert({
      account_id: accountId,
      lead_id: leadId,
      to_phone: from,
      from_phone: to,
      body: finalReply,
      status: 'sent',
      sent_by: 'ai',
      provider: 'twilio',
      channel: 'sms',
    });
    if (outErr) console.error('OUTBOUND_SAVE_ERR', outErr);

    if (leadId) {
      const { error: leadUpd2 } = await supabase
        .from('leads')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('id', leadId)
        .eq('account_id', accountId);
      if (leadUpd2) console.error('LEAD_UPD_OUTBOUND_ERR', leadUpd2);
    }

    sendTwiml(res, finalReply);
  } catch (err) {
    console.error('WEBHOOK_FATAL', err);
    sendTwiml(res, SAFE_FALLBACK);
  }
}
