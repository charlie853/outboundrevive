import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';

import { generateSmsReply, DEFAULT_AI_FALLBACK_MESSAGE, SmsReplyContract } from '@/lib/ai';
import {
  normalizePhone,
  isOptOut,
  isHelp,
  computeNeedsFooter,
  withinQuietHours,
} from '@/lib/policy';

export const config = { api: { bodyParser: true } };

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID!;

const OPT_OUT_RESPONSE = "You're paused and won't receive further messages. Reply START to resume.";
const HELP_RESPONSE = "Hi, it’s Charlie from OutboundRevive. Text START to resume or PAUSE to take a break. Anything else I can do?";
const MAX_SMS_LENGTH = 320;

type LeadSnapshot = {
  id: string;
  name: string | null;
  tz: string | null;
  state: string | null;
  last_message_at: string | null;
  last_footer_at: string | null;
  last_inbound_at: string | null;
  last_sent_at: string | null;
  opted_out: boolean | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    const form = parseForm(req);
    const from = normalizePhone(String(form.From ?? form.from ?? ''));
    const to = normalizePhone(String(form.To ?? form.to ?? ''));
    const inboundText = String(form.Body ?? form.body ?? '').trim();
    const rawProfileName = form.ProfileName ?? form.profile_name ?? '';
    const profileName = String(rawProfileName || '').trim();

    if (!from || !to) {
      console.error('INBOUND_MISSING_NUMBERS', { from, to });
      return respond(res, "We couldn't process that number—reply HELP for support.");
    }

    const supa = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

    const { data: account, error: accountErr } = await supa
      .from('account_settings')
      .select('*')
      .eq('phone_from', to)
      .maybeSingle();

    if (accountErr) {
      console.error('ACCOUNT_RESOLVE_ERR', accountErr);
      return respond(res, "We couldn't find this number. Reply HELP for assistance.");
    }

    if (!account) {
      console.error('ACCOUNT_RESOLVE_FAIL', { to });
      return respond(res, "We couldn't find this number. Reply HELP for assistance.");
    }

    const accountId: string = account.account_id || DEFAULT_ACCOUNT_ID;
    const nowIso = new Date().toISOString();

    const { data: existingLead, error: leadFetchErr } = await supa
      .from<LeadSnapshot>('leads')
      .select('id,name,tz,state,last_message_at,last_footer_at,last_inbound_at,last_sent_at,opted_out')
      .eq('account_id', accountId)
      .eq('phone', from)
      .maybeSingle();

    if (leadFetchErr) {
      console.error('LEAD_LOOKUP_ERR', leadFetchErr);
    }

    let lead: LeadSnapshot | null = existingLead ?? null;
    if (!lead) {
      const { data: insertedLead, error: leadInsertErr } = await supa
        .from<LeadSnapshot>('leads')
        .insert({
          account_id: accountId,
          phone: from,
          name: profileName || 'SMS Lead',
          status: 'active',
          last_inbound_at: nowIso,
        })
        .select('id,name,tz,state,last_message_at,last_footer_at,last_inbound_at,last_sent_at,opted_out')
        .single();

      if (leadInsertErr) {
        console.error('LEAD_INSERT_ERR', leadInsertErr);
      } else {
        lead = insertedLead ?? null;
      }
    }

    const leadId = lead?.id ?? null;
    const firstName = lead?.name?.split(' ')?.[0] || profileName.split(' ')?.[0] || null;

    const lastContactIso = lead?.last_message_at || lead?.last_inbound_at || lead?.last_sent_at || null;
    const lastContact30dAgo = lastContactIso
      ? Date.now() - new Date(lastContactIso).getTime() > 30 * 24 * 60 * 60 * 1000
      : true;

    const lastFooterAtIso = lead?.last_footer_at || account?.last_footer_at || null;
    const needsFooter = computeNeedsFooter(lastFooterAtIso, nowIso);

    const tz = lead?.tz || account?.tz || 'America/New_York';
    let nowLocalHHMM = '12:00';
    try {
      nowLocalHHMM = DateTime.now().setZone(tz).toFormat('HH:mm');
    } catch (err) {
      console.warn('TZ_PARSE_WARN', tz, err);
      nowLocalHHMM = DateTime.now().toFormat('HH:mm');
    }

    const askedWho = /who\s+is\s+this/i.test(inboundText);
    const schedulingIntent = /(book|schedule|resched|availability)/i.test(inboundText);
    const helpRequested = isHelp(inboundText);
    const optOut = isOptOut(inboundText);
    const quietHoursBlock = withinQuietHours(nowLocalHHMM, lead?.state || null);

    const ctx = {
      brand: account.brand || 'OutboundRevive',
      booking_link: account.booking_link || null,
      first_name: firstName,
      service: account.service || null,
      vertical: account.vertical || null,
      account_id: accountId,
      lead_id: leadId,
      is_new_thread: !existingLead,
      last_contact_at_iso: lastContactIso,
      last_contact_30d_ago: lastContact30dAgo,
      last_footer_at_iso: lastFooterAtIso,
      last_footer_within_30d: !needsFooter,
      scheduling_intent: schedulingIntent,
      inbound_text: inboundText,
      lead_tz: tz,
      lead_state: lead?.state || null,
      quiet_hours_block: quietHoursBlock,
      state_cap_block: false,
      asked_who_is_this: askedWho,
      opt_out_phrase: optOut ? inboundText : null,
      help_requested: helpRequested,
      needs_footer: needsFooter,
    };

    let replyContract: SmsReplyContract | null = null;
    let replyText = '';

    if (optOut) {
      replyText = OPT_OUT_RESPONSE;
      replyContract = {
        intent: 'opt_out',
        confidence: 1,
        message: replyText,
        needs_footer: false,
        actions: [{ type: 'suppress' }],
        hold_until: null,
        policy_flags: {
          quiet_hours_block: false,
          state_cap_block: false,
          footer_appended: false,
          opt_out_processed: true,
        },
      };
    } else {
      try {
        replyContract = await generateSmsReply(ctx);
        replyText = String(replyContract?.message || '').trim();
      } catch (err) {
        console.error('GENERATE_SMS_REPLY_ERR', err);
      }

      if (!replyText && helpRequested) {
        replyText = HELP_RESPONSE;
        replyContract = replyContract ?? {
          intent: 'help',
          confidence: 0.6,
          message: replyText,
          needs_footer: needsFooter,
          actions: [],
          hold_until: null,
          policy_flags: {
            quiet_hours_block,
            state_cap_block: false,
            footer_appended: false,
            opt_out_processed: false,
          },
        };
      }
    }

    if (!replyText) {
      replyText = DEFAULT_AI_FALLBACK_MESSAGE;
    }

    let appendedFooter = false;
    if ((replyContract?.needs_footer || (replyContract == null && needsFooter)) && !/reply\s+pause\s+to\s+stop/i.test(replyText)) {
      replyText = replyText.trim();
      if (replyText && !/[.!?]$/.test(replyText)) replyText += '.';
      replyText += ' Reply PAUSE to stop';
      appendedFooter = true;
      if (replyContract) {
        replyContract.policy_flags = {
          ...(replyContract.policy_flags ?? {}),
          footer_appended: true,
        };
      }
    }

    if (replyText.length > MAX_SMS_LENGTH) {
      replyText = replyText.slice(0, MAX_SMS_LENGTH - 1).trimEnd() + '…';
    }

    const accountIdForInsert = accountId;
    const replyForInsert = replyText;

    (async () => {
      try {
        const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

        let resolvedLeadId = leadId;
        if (!resolvedLeadId) {
          const { data: inserted, error: lateInsertErr } = await sb
            .from('leads')
            .insert({
              account_id: accountIdForInsert,
              phone: from,
              name: profileName || 'SMS Lead',
              status: 'active',
              last_inbound_at: nowIso,
            })
            .select('id')
            .single();
          if (lateInsertErr) {
            console.error('LEAD_INSERT_LATE_ERR', lateInsertErr);
          } else {
            resolvedLeadId = inserted?.id ?? null;
          }
        }

        if (!resolvedLeadId) return;

        const updates: Record<string, unknown> = { last_inbound_at: nowIso };
        if (profileName && (!lead?.name || lead?.name?.trim() === '')) {
          updates.name = profileName;
        }
        if (appendedFooter) updates.last_footer_at = nowIso;
        if (optOut) updates.opted_out = true;

        const { error: leadUpdateErr } = await sb
          .from('leads')
          .update(updates)
          .eq('id', resolvedLeadId);
        if (leadUpdateErr) console.error('LEAD_UPDATE_ERR', leadUpdateErr);

        const inboundPayload: Record<string, unknown> = {
          account_id: accountIdForInsert,
          lead_id: resolvedLeadId,
          body: inboundText,
          provider_from: from,
          provider_to: to,
          processed: true,
          meta: replyContract ? { policy_flags: replyContract.policy_flags, actions: replyContract.actions } : null,
        };

        const { data: inboundRow, error: inboundErr } = await sb
          .from('messages_in')
          .insert(inboundPayload)
          .select('id')
          .single();
        if (inboundErr) console.error('INBOUND_INSERT_ERR', inboundErr);

        const messagePayload: Record<string, unknown> = {
          account_id: accountIdForInsert,
          lead_id: resolvedLeadId,
          to_phone: from,
          from_phone: to,
          body: replyForInsert,
          status: 'queued',
          provider: 'twilio',
          source: 'ai',
          intent: replyContract?.intent ?? null,
          gate_log: replyContract ? { policy_flags: replyContract.policy_flags, actions: replyContract.actions } : null,
        };
        if (inboundRow?.id) messagePayload.parent_in_id = inboundRow.id;

        const { error: messagesOutErr } = await sb.from('messages_out').insert(messagePayload);
        if (messagesOutErr) console.error('OUTBOUND_INSERT_ERR', messagesOutErr);
      } catch (err) {
        console.error('OUTBOUND_ASYNC_ERR', err);
      }
    })().catch((err) => console.error('OUTBOUND_ASYNC_ERR', err));

    return respond(res, replyText);
  } catch (err) {
    console.error('WEBHOOK_FATAL', err);
    return respond(res, DEFAULT_AI_FALLBACK_MESSAGE);
  }
}

function parseForm(req: NextApiRequest) {
  const body = req.body;
  if (!body) return {} as Record<string, unknown>;
  if (typeof body === 'string') {
    return Object.fromEntries(new URLSearchParams(body)) as Record<string, unknown>;
  }
  if (Buffer.isBuffer(body)) {
    return Object.fromEntries(new URLSearchParams(body.toString('utf8')));
  }
  return body as Record<string, unknown>;
}

function respond(res: NextApiResponse, message: string) {
  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
  return res.status(200).send(xml);
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
