import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, type PostgrestSingleResponse } from '@supabase/supabase-js';

export const config = {
  api: { bodyParser: false },
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID!;
const SMS_SYSTEM_PROMPT = (process.env.SMS_SYSTEM_PROMPT || '').trim();
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').trim();
const CAL_BOOKING_URL = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || '').trim();
const INTERNAL_SECRET = (process.env.INTERNAL_API_SECRET || '').trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type HistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

type LeadRecord = {
  id: string;
  name: string | null;
};

function ensureEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DEFAULT_ACCOUNT_ID) {
    throw new Error('Missing required Supabase configuration for inbound webhook.');
  }
}

async function readTwilioForm(req: NextApiRequest): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve) => {
    (req as any).on('data', (chunk: Buffer) => chunks.push(chunk));
    (req as any).on('end', () => resolve());
  });
  const raw = Buffer.concat(chunks).toString('utf8');
  return Object.fromEntries(new URLSearchParams(raw));
}

function normalizeUS(phone: string | undefined): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  const trimmed = phone.trim();
  if (/^\+1\d{10}$/.test(trimmed)) return trimmed;
  return '';
}

function sanitizeForLog(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, 160);
}

async function sentBookingLinkLast24h(
  supabaseUrl: string,
  serviceKey: string,
  accountId: string,
  toPhone: string,
  calUrl: string,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url = new URL(`${supabaseUrl}/rest/v1/messages_out`);
    url.searchParams.set('account_id', `eq.${accountId}`);
    url.searchParams.set('to_phone', `eq.${toPhone}`);
    url.searchParams.set('created_at', `gte.${since}`);
    const needle = calUrl.replace(/^https?:\/\//i, '');
    url.searchParams.set('body', `ilike.*${needle}*`);
    url.searchParams.set('select', 'id');

    const r = await fetch(url.toString(), {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    });
    if (!r.ok) {
      console.error('BOOKING_LINK_HISTORY_HTTP_ERR', { status: r.status, statusText: r.statusText });
      return false;
    }
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.error('BOOKING_LINK_HISTORY_ERR', err);
    return false;
  }
}

async function fetchRecentHistory(accountId: string, phone: string): Promise<HistoryEntry[]> {
  try {
    const [inbound, outbound] = await Promise.all([
      supabase
        .from('messages_in')
        .select('body,created_at')
        .eq('account_id', accountId)
        .eq('from_phone', phone)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('messages_out')
        .select('body,created_at')
        .eq('account_id', accountId)
        .eq('to_phone', phone)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

    const entries: Array<{ role: 'user' | 'assistant'; content: string; created_at: string }> = [];

    if (inbound.error) console.error('HISTORY_INBOUND_ERR', inbound.error);
    if (outbound.error) console.error('HISTORY_OUTBOUND_ERR', outbound.error);

    if (Array.isArray(inbound.data)) {
      inbound.data.forEach((row) => {
        if (row.body) {
          entries.push({ role: 'user', content: String(row.body), created_at: row.created_at });
        }
      });
    }

    if (Array.isArray(outbound.data)) {
      outbound.data.forEach((row) => {
        if (row.body) {
          entries.push({ role: 'assistant', content: String(row.body), created_at: row.created_at });
        }
      });
    }

    return entries
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-8)
      .map((entry) => ({
        role: entry.role,
        content: entry.content.replace(/[\r\n]+/g, ' ').slice(0, 320),
        created_at: entry.created_at,
      }));
  } catch (err) {
    console.error('HISTORY_FETCH_ERR', err);
    return [];
  }
}

async function callDraft(
  origin: string,
  payload: Record<string, unknown>,
  label: string,
): Promise<string> {
  const url = origin ? `${origin}/api/internal/knowledge/draft` : '/api/internal/knowledge/draft';
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (INTERNAL_SECRET) headers['x-internal-secret'] = INTERNAL_SECRET;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('LLM_DRAFT_HTTP_ERR', { label, status: res.status, statusText: res.statusText });
      return '';
    }
    const data = (await res.json().catch(() => ({}))) as { reply?: string };
    return (data?.reply || '').trim();
  } catch (err) {
    console.error('LLM_DRAFT_EX', { label, error: err });
    return '';
  }
}

async function getOrCreateLead(accountId: string, phone: string): Promise<LeadRecord | null> {
  try {
    const existing: PostgrestSingleResponse<LeadRecord> = await supabase
      .from('leads')
      .select('id,name')
      .eq('account_id', accountId)
      .eq('phone', phone)
      .maybeSingle();

    if (existing.error) throw existing.error;
    if (existing.data?.id) return existing.data;

    const created: PostgrestSingleResponse<LeadRecord> = await supabase
      .from('leads')
      .insert({ account_id: accountId, phone, name: null, status: 'active' })
      .select('id,name')
      .maybeSingle();

    if (created.error) throw created.error;
    return created.data ?? null;
  } catch (err) {
    console.error('LEAD_UPSERT_ERR', err);
    return null;
  }
}

function deriveOrigin(req: NextApiRequest): string {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const host = req.headers.host;
  if (!host) return '';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

function buildHistoryPrompt(history: HistoryEntry[]): string {
  if (!history.length) return '';
  return history
    .map((entry) => {
      const prefix = entry.role === 'user' ? 'Lead:' : 'AI:';
      return `${prefix} ${entry.content}`;
    })
    .join('\n');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  ensureEnv();

  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  let form: Record<string, string> = {};
  try {
    form = await readTwilioForm(req);
  } catch {
    form = {};
  }

  const rawBody = (form.Body || form.body || form.text || '').toString().trim();
  const fromPhone = normalizeUS(form.From || form.from);
  const toPhone = normalizeUS(form.To || form.to);

  if (!rawBody || !fromPhone) {
    res.status(204).end();
    return;
  }

  const accountId = DEFAULT_ACCOUNT_ID;

  let brand = 'OutboundRevive';
  try {
    const { data } = await supabase
      .from('account_settings')
      .select('brand')
      .eq('account_id', accountId)
      .maybeSingle();
    if (data?.brand) brand = data.brand.trim() || brand;
  } catch (brandErr) {
    console.error('ACCOUNT_BRAND_ERR', brandErr);
  }

  const leadRecord = await getOrCreateLead(accountId, fromPhone);
  const leadId = leadRecord?.id ?? null;
  const leadName = leadRecord?.name ?? null;

  const history = await fetchRecentHistory(accountId, fromPhone);

  let inboundId: string | null = null;
  try {
    const { data: messageRow, error } = await supabase
      .from('messages_in')
      .insert({
        account_id: accountId,
        from_phone: fromPhone,
        to_phone: toPhone || null,
        body: rawBody,
        processed: false,
        lead_id: leadId,
      })
      .select('id')
      .maybeSingle();
    if (error) throw error;
    inboundId = messageRow?.id ?? null;

    if (leadId) {
      await supabase
        .from('leads')
        .update({ last_inbound_at: new Date().toISOString(), last_reply_body: rawBody })
        .eq('id', leadId);
    }
  } catch (inErr) {
    console.error('INBOUND_PERSIST_ERR', inErr);
  }

  const origin = deriveOrigin(req);
  const systemPrompt = buildSystemPrompt(brand);
  const historyPrompt = buildHistoryPrompt(history);
  const whoIsIntent = /^\s*who\s+is\s+this\??\s*$/i.test(rawBody);
  const wantsSchedule = /\b(book|schedule|zoom|call)\b/i.test(rawBody);
  const wantsPricing = /\b(price|pricing|cost|rate|quote)\b/i.test(rawBody);

  let intent: string = 'general';
  if (whoIsIntent) intent = 'whois';
  else if (wantsSchedule) intent = 'schedule';
  else if (wantsPricing) intent = 'pricing';

  let finalReply = '';

  if (whoIsIntent) {
    finalReply = 'Charlie from OutboundRevive.';
  } else {
    const baseContextParts: string[] = [];
    if (leadName) baseContextParts.push(`Lead name: ${leadName}`);
    if (historyPrompt) baseContextParts.push(`Recent conversation:\n${historyPrompt}`);
    baseContextParts.push(`Latest inbound: ${rawBody}`);

    const llmInput = baseContextParts.join('\n');

    const basePayload = {
      account_id: accountId,
      q: llmInput,
      system_prompt: systemPrompt,
      hints: {
        brand,
        should_introduce: false,
        lead_name: leadName ?? undefined,
        history: historyPrompt || undefined,
      },
    };

    let draft = await callDraft(origin, basePayload, 'base');

    if (!draft) {
      const strictPayload = {
        account_id: accountId,
        q: `${llmInput}\n\nInstruction: Only output one SMS (<=320 chars). No filler.`,
        system_prompt: systemPrompt,
        hints: {
          brand,
          should_introduce: false,
          lead_name: leadName ?? undefined,
          history: historyPrompt || undefined,
        },
      };
      draft = await callDraft(origin, strictPayload, 'strict');
    }

    finalReply = (draft || '').trim();
  }

  if (!finalReply && wantsSchedule && CAL_BOOKING_URL) {
    finalReply = `Let's lock in a time. Here's my booking link: ${CAL_BOOKING_URL}`;
  }

  if (!finalReply) {
    res.status(204).end();
    return;
  }

  if (wantsSchedule && CAL_BOOKING_URL) {
    const alreadySent = await sentBookingLinkLast24h(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      accountId,
      fromPhone,
      CAL_BOOKING_URL,
    );
    if (!alreadySent && !finalReply.includes(CAL_BOOKING_URL)) {
      finalReply = `${finalReply} ${CAL_BOOKING_URL}`.trim();
    }
  }

  if (finalReply.length > 320) {
    finalReply = finalReply.slice(0, 320).trim();
  }

  if (!finalReply) {
    res.status(204).end();
    return;
  }

  let persistedOutId: string | null = null;
  try {
    const { data: outRow, error: outErr } = await supabase
      .from('messages_out')
      .insert({
        account_id: accountId,
        lead_id: leadId,
        to_phone: fromPhone,
        from_phone: toPhone || null,
        body: finalReply,
        sent_by: 'ai',
        provider: 'twilio',
        provider_status: 'queued',
        status: 'queued',
      })
      .select('id')
      .maybeSingle();

    if (outErr) {
      console.error('OUTBOUND_PERSIST_ERR', outErr);
    } else {
      persistedOutId = outRow?.id ?? null;
    }
  } catch (outEx) {
    console.error('OUTBOUND_PERSIST_EX', outEx);
  }

  if (leadId) {
    try {
      await supabase
        .from('leads')
        .update({ last_sent_at: new Date().toISOString(), last_reply_body: finalReply })
        .eq('id', leadId);
    } catch (leadUpdateErr) {
      console.error('LEAD_ACTIVITY_UPDATE_ERR', leadUpdateErr);
    }
  }

  if (INTERNAL_SECRET && origin) {
    try {
      const sendResp = await fetch(`${origin}/api/internal/sms/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': INTERNAL_SECRET,
        },
        body: JSON.stringify({
          account_id: accountId,
          lead_id: leadId,
          to: fromPhone,
          body: finalReply,
        }),
      });

      if (sendResp.ok) {
        const result = (await sendResp.json().catch(() => ({}))) as {
          twilio_sid?: string;
          provider_status?: string;
          db?: Array<{ id: string; provider_sid?: string; status?: string }>;
        };

        const providerSid = result.twilio_sid || result.db?.[0]?.provider_sid || null;
        const providerStatus = result.provider_status || result.db?.[0]?.status || null;
        const duplicateId = result.db?.[0]?.id || null;

        if (persistedOutId && (providerSid || providerStatus)) {
          const updatePayload: Record<string, string> = {};
          if (providerSid) updatePayload.provider_sid = providerSid;
          if (providerStatus) {
            updatePayload.provider_status = providerStatus;
            updatePayload.status = providerStatus;
          }
          if (Object.keys(updatePayload).length) {
            await supabase.from('messages_out').update(updatePayload).eq('id', persistedOutId);
          }
        }

        if (duplicateId && persistedOutId && duplicateId !== persistedOutId) {
          try {
            await supabase.from('messages_out').delete().eq('id', duplicateId);
          } catch (cleanupErr) {
            console.error('OUTBOUND_DUPLICATE_CLEANUP_ERR', cleanupErr);
          }
        } else if (!persistedOutId && duplicateId) {
          persistedOutId = duplicateId;
        }
      } else {
        console.error('INTERNAL_SMS_SEND_FAILED', { status: sendResp.status, statusText: sendResp.statusText });
      }
    } catch (sendErr) {
      console.error('INTERNAL_SMS_SEND_ERR', sendErr);
    }
  }

  if (inboundId) {
    try {
      await supabase
        .from('messages_in')
        .update({ processed: true })
        .eq('id', inboundId);
    } catch (processErr) {
      console.error('INBOUND_PROCESS_UPDATE_ERR', processErr);
    }
  }

const logPayload = {
  from: sanitizeForLog(fromPhone),
  to: sanitizeForLog(toPhone),
  lead_id: leadId,
  intent,
  appended_calendly: wantsSchedule && !!CAL_BOOKING_URL && finalReply.includes(CAL_BOOKING_URL),
  persisted_outbound_id: persistedOutId,
};
console.info('INBOUND_SMS', logPayload);

  res.status(204).end();
}

/*
Self-test checklist:
- who is this -> persists "Charlie from OutboundRevive." in messages_out
- can we book a zoom tomorrow? -> first response appends Calendly link, repeat within 24h does not
- pricing tiers? -> concise pricing reply with single CTA, no canned phrases
- Verify messages_out has no blank body rows for this lead in the last 10 minutes
*/
