import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import twilio from 'twilio';

const DEFAULT_ACCOUNT_ID = (process.env.DEFAULT_ACCOUNT_ID || '').trim();
const SAFE_FALLBACK = 'Thanks for reaching out. Want me to outline how we revive stalled leads, or should I focus on something else first?';
const BOOKING_LINK = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || '').trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').trim();
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || '').trim();

export const config = {
  api: { bodyParser: false },
};

async function parseTwilioForm(req: any) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return Object.fromEntries(new URLSearchParams(raw));
}

function normPhone(s: string) {
  const d = (s || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('+')) return `+${d.replace(/^\++/, '')}`;
  const digits = d.replace(/^\++/, '');
  const withCountry = digits.length === 10 ? `1${digits}` : digits;
  return `+${withCountry}`;
}

function cleanE164(s?: string | null) {
  return (s || '').replace(/[^\d+]/g, '');
}

function askedWhoIsThis(input: string): boolean {
  return /\bwho\s+is\s+(this|that)\b/i.test(input || '');
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

function neutralFollowUp(body: string, brand: string): string {
  const cleaned = body.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return `Thanks for reaching out. Want me to outline how ${brand} revives stalled leads, or should I focus on something else first?`;
  }
  const excerpt = cleaned.length > 110 ? `${cleaned.slice(0, 107)}...` : cleaned;
  return `Got it on "${excerpt}". Want a quick rundown of how ${brand} tackles that, or should I suggest next steps?`;
}

function sendTwiml(res: NextApiResponse, message: string, statusCallback?: string) {
  const response = new twilio.twiml.MessagingResponse();
  const trimmed = (message || '').trim();

  if (trimmed) {
    const msg = response.message(trimmed);
    if (statusCallback) {
      msg.setAttribute('statusCallback', statusCallback);
    }
  }

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(response.toString());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    sendTwiml(res, 'OK');
    return;
  }

  try {
    const form = await parseTwilioForm(req);
    const rawFrom = String(form.From || '');
    const rawTo = String(form.To || '');
    const bodyText = String(form.Body || '').trim();
    const profileName = typeof form.ProfileName === 'string' ? String(form.ProfileName).trim() : null;

    console.log('INBOUND:', { fromPhone: rawFrom, toPhone: rawTo, textRaw: bodyText });

    const from = normPhone(cleanE164(rawFrom));
    const to = normPhone(cleanE164(rawTo));

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

    let leadId: string | null = null;

    const { data: existingLead, error: findErr } = await supabase
      .from('leads')
      .select('id')
      .eq('account_id', accountId)
      .eq('phone', from)
      .limit(1)
      .maybeSingle();

    if (findErr) console.error('INBOUND_FIND_LEAD_ERR', findErr);

    if (existingLead?.id) {
      leadId = existingLead.id;
    } else {
      const { data: insertedLead, error: insertErr } = await supabase
        .from('leads')
        .insert({
          account_id: accountId,
          phone: from,
          name: leadName,
          status: 'active',
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error('INBOUND_INSERT_LEAD_ERR', insertErr);
        if (insertErr.code === '23505') {
          const { data: retryLead, error: retryErr } = await supabase
            .from('leads')
            .select('id')
            .eq('account_id', accountId)
            .eq('phone', from)
            .limit(1)
            .maybeSingle();
          if (retryErr) console.error('INBOUND_FIND_LEAD_RETRY_ERR', retryErr);
          leadId = retryLead?.id ?? null;
        }
      } else {
        leadId = insertedLead?.id ?? null;
      }
    }

    let inboundId: string | null = null;

    const { data: inboundRow, error: inErr } = await supabase
      .from('messages_in')
      .insert({
        account_id: accountId,
        lead_id: leadId,
        from_phone: from,
        to_phone: to,
        body: bodyText,
        processed: false,
      })
      .select('id')
      .single();

    if (inErr) {
      console.error('INBOUND_DB_INSERT_ERR', inErr);
    } else {
      inboundId = inboundRow?.id ?? null;
    }

    if (leadId) {
      const { error: bumpErr } = await supabase
        .from('leads')
        .update({ last_inbound_at: new Date().toISOString(), last_reply_body: bodyText })
        .eq('account_id', accountId)
        .eq('id', leadId);

      if (bumpErr) console.error('INBOUND_LEAD_ACTIVITY_ERR', bumpErr);
    }

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

    const msg = bodyText.toLowerCase();
    const wantsSchedule = /\b(schedule|book|calendar|calendly|zoom|teams|meet|call|time|availability|available|send (the )?link)\b/.test(msg);
    const asksPricing = /\b(price|pricing|cost|rates?|quote)\b/.test(msg);
    const asksWho = /\b(who( is|'?s)? (this|you))\b/.test(msg) || askedWhoIsThis(bodyText);
    const asksServices = /\b(what|how)\b.*\b(do|does)\b.*\b(you|outboundrevive)\b/.test(msg) || /\bservices?\b/.test(msg);
    const asksResults = /\b(result|conversion|booked|rebook|show rate|pipeline)\b/.test(msg);

    const bookingUrl = (BOOKING_LINK || accountBookingLink || '').trim();
    let replyText: string | null = null;

    const persistOutbound = async (body: string): Promise<string | null> => {
      try {
        if (!leadId) {
          const { data: leadLookupRow, error: leadLookupErr } = await supabase
            .from('leads')
            .select('id')
            .eq('account_id', accountId)
            .eq('phone', from)
            .maybeSingle();

          if (leadLookupErr) console.error('persist lead lookup failed', leadLookupErr);
          if (leadLookupRow?.id) {
            leadId = leadLookupRow.id;
          }
        }

        const { data: outInsert, error: outErr } = await supabase
          .from('messages_out')
          .insert({
            account_id: accountId,
            lead_id: leadId,
            from_phone: to,
            to_phone: from,
            body,
            status: 'queued',
            provider_status: 'queued',
            sent_by: 'ai',
            provider: 'twilio',
            channel: 'sms',
          })
          .select('id')
          .single();

        if (outErr) console.error('OUTBOUND_PLACEHOLDER_ERR', outErr);

        if (leadId) {
          const { error: leadUpdErr } = await supabase
            .from('leads')
            .update({ last_sent_at: new Date().toISOString() })
            .eq('account_id', accountId)
            .eq('id', leadId);
          if (leadUpdErr) console.error('LEAD_UPD_OUTBOUND_ERR', leadUpdErr);
        }

        return outInsert?.id ?? null;
      } catch (persistErr) {
        console.error('persistOutbound exception', persistErr);
        return null;
      }
    };

    const markInboundProcessed = async (): Promise<void> => {
      try {
        const processedUpdate = supabase
          .from('messages_in')
          .update({ processed: true })
          .eq('account_id', accountId)
          .eq('from_phone', from)
          .eq('to_phone', to)
          .is('processed', false);

        if (inboundId) {
          processedUpdate.eq('id', inboundId);
        }

        const { error: processedErr } = await processedUpdate;
        if (processedErr) console.error('INBOUND_MARK_PROCESSED_ERR', processedErr);
      } catch (processedEx) {
        console.error('INBOUND_MARK_PROCESSED_EX', processedEx);
      }
    };

    if (wantsSchedule) {
      let canLink = false;
      if (bookingUrl) {
        try {
          const alreadySent = await sentLinkInLast24h(supabase, accountId, from, bookingUrl);
          canLink = !alreadySent;
        } catch (linkErr) {
          console.error('LINK_DECISION_ERR', linkErr);
        }
      }
      replyText = canLink && bookingUrl
        ? `Happy to schedule. Here's my booking link: ${bookingUrl}. What works for you?`
        : 'Happy to schedule. What time windows work for you?';
    } else if (asksPricing) {
      replyText = 'Pricing depends on volume and channel mix. Typical pilots start small, then ramp. Want a 10-min call, or a short summary here?';
    } else if (asksWho) {
      replyText = "It's Charlie from OutboundRevive. We handle managed SMS and call follow-ups so older leads become live conversations. How can I help?";
    } else if (asksServices) {
      replyText = `We revive stalled pipeline for ${brand}: rebooking no-shows, warming inbound trials, and following up web leads fast. Are you focused on bookings or another funnel step?`;
    } else if (asksResults) {
      replyText = 'Revive campaigns typically turn 10-20% of cold or no-show leads into fresh conversations within two weeks. Want a quick call to compare playbooks?';
    } else if (bodyText.trim().length) {
      replyText = neutralFollowUp(bodyText, brand);
    }

    if (replyText) {
      if (shouldIntroduce && !/\bOutboundRevive\b/i.test(replyText) && !/\bCharlie\b/i.test(replyText)) {
        replyText = `Hi, it's Charlie from OutboundRevive with ${brand}. ${replyText}`;
      }

      const textToSend = replyText.slice(0, 320).trim();

      const outId = await persistOutbound(textToSend);

      const statusUrl =
        PUBLIC_BASE_URL && PUBLIC_BASE_URL.length
          ? `${PUBLIC_BASE_URL}/api/webhooks/twilio/status?account_id=${encodeURIComponent(accountId)}${
              outId ? `&out_id=${encodeURIComponent(String(outId))}` : ''
            }`
          : undefined;

      sendTwiml(res, textToSend, statusUrl);

      await markInboundProcessed();

      return;
    }

    const llmHistory = [...inboundHistory, ...outboundHistory]
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(-12)
      .map((entry) => ({ role: entry.role, content: entry.content }));

    let aiReply = '';

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
          aiReply = String(draftJson?.reply || '').trim();
        } else {
          console.warn('DRAFT_CALL_BAD_STATUS', draftResp.status);
        }
      } catch (draftErr) {
        console.error('DRAFT_CALL_ERR', draftErr);
      }
    } else {
      console.warn('DRAFT_CALL_SKIPPED_NO_BASE');
    }

    if (!aiReply) {
      aiReply = neutralFollowUp(bodyText, brand);
    }

    if (shouldIntroduce && !/\bOutboundRevive\b/i.test(aiReply) && !/\bCharlie\b/i.test(aiReply)) {
      aiReply = `Hi, it's Charlie from OutboundRevive with ${brand}. ${aiReply}`;
    }

    const aiText = aiReply.slice(0, 320).trim();

    const outId = await persistOutbound(aiText);

    const statusUrl =
      PUBLIC_BASE_URL && PUBLIC_BASE_URL.length
        ? `${PUBLIC_BASE_URL}/api/webhooks/twilio/status?account_id=${encodeURIComponent(accountId)}${
            outId ? `&out_id=${encodeURIComponent(String(outId))}` : ''
          }`
        : undefined;

    sendTwiml(res, aiText, statusUrl);

    await markInboundProcessed();

    return;
  } catch (err) {
    console.error('WEBHOOK_FATAL', err);
    sendTwiml(res, SAFE_FALLBACK);
  }
}
