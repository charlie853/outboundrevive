import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_ACCOUNT_ID = (process.env.DEFAULT_ACCOUNT_ID || '').trim();
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

function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

const adminSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getOrCreateLead({
  account_id,
  phone,
  nameHint,
}: {
  account_id: string;
  phone: string;
  nameHint: string | null;
}) {
  const { data: found, error: findErr } = await adminSupabase
    .from('leads')
    .select('id,name,phone')
    .eq('account_id', account_id)
    .eq('phone', phone)
    .limit(1)
    .maybeSingle();

  if (findErr) {
    throw findErr;
  }

  if (found?.id) {
    return { lead: found, lead_id: found.id };
  }

  const { data: created, error: createErr } = await adminSupabase
    .from('leads')
    .insert({ account_id, phone, name: nameHint || phone, status: 'active' })
    .select('id,name,phone')
    .single();

  if (createErr) {
    throw createErr;
  }

  return { lead: created, lead_id: created.id };
}

async function persistOutbound({
  accountId,
  leadId,
  toPhone,
  fromPhone,
  body,
  status = 'sent',
  providerStatus,
}: {
  accountId: string;
  leadId: string | null;
  toPhone: string;
  fromPhone: string;
  body: string;
  status?: string;
  providerStatus?: string | null;
}): Promise<string | null> {
  const { data, error } = await adminSupabase
    .from('messages_out')
    .insert({
      account_id: accountId,
      lead_id: leadId,
      to_phone: toPhone,
      from_phone: fromPhone,
      body,
      sent_by: 'ai',
      status,
      provider_status: providerStatus ?? null,
      provider: 'twilio',
    })
    .select('id')
    .single();

  if (error) {
    console.error('OUTBOUND_INSERT_ERR', error);
    return null;
  }

  return data?.id ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send('<Response></Response>');
    return;
  }

  try {
    const form = await parseTwilioForm(req);
    const fromPhone = String(form.From || '').trim();
    const toPhone = String(form.To || '').trim();
    const textRaw = String(form.Body || '').trim();
    const text = textRaw.toLowerCase();

    console.log('INBOUND', { fromPhone, toPhone, textRaw });

    const from = normPhone(cleanE164(fromPhone));
    const to = normPhone(cleanE164(toPhone));

    if (!from || !to || !DEFAULT_ACCOUNT_ID) {
      res.setHeader('Content-Type', 'text/xml');
      res.status(200).send('<Response></Response>');
      return;
    }

    const accountId = DEFAULT_ACCOUNT_ID;
    const { lead_id } = await getOrCreateLead({ account_id: accountId, phone: from, nameHint: null });

    let brand = 'OutboundRevive';
    let lastFooterAt: Date | null = null;

    try {
      const { data: acctRow } = await adminSupabase
        .from('account_settings')
        .select('brand,last_footer_at')
        .eq('account_id', accountId)
        .single();

      if (acctRow) {
        brand = acctRow.brand?.trim() || brand;
        lastFooterAt = acctRow.last_footer_at ? new Date(acctRow.last_footer_at) : null;
      }
    } catch (acctErr) {
      console.error('ACCOUNT_SETTINGS_ERR', acctErr);
    }

    const BOOKING = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || '').trim();
    const askedToSchedule = /\b(book|schedule|calend(?:ly|ar)|zoom|meet|call|link|time|slot|availability)\b/i.test(text);
    const canSendLink = Boolean(BOOKING) && (!lastFooterAt || Date.now() - lastFooterAt.getTime() > 24 * 3600 * 1000);

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
            q: textRaw,
            hints: {
              should_introduce: false,
              brand,
              link_allowed: askedToSchedule && canSendLink,
              booking_url: BOOKING,
            },
          }),
        });

        if (draftResp.ok) {
          const draftJson = (await draftResp.json().catch(() => ({}))) as { reply?: string };
          reply = String(draftJson?.reply || '').trim();
        } else {
          console.warn('DRAFT_BAD_STATUS', draftResp.status);
        }
      } catch (draftErr) {
        console.error('DRAFT_FETCH_ERR', draftErr);
      }
    }

    if (!reply) {
      reply = textRaw.length <= 140
        ? `You said: "${textRaw}". Can you clarify what you'd like me to do next?`
        : "Got your note—what's the next step you'd like?";
    }

    if (askedToSchedule && canSendLink && BOOKING && !reply.includes(BOOKING)) {
      reply = `${reply} ${BOOKING}`.trim();
      try {
        await adminSupabase
          .from('account_settings')
          .update({ last_footer_at: new Date().toISOString() })
          .eq('account_id', accountId);
      } catch (footerErr) {
        console.error('ACCOUNT_FOOTER_UPDATE_ERR', footerErr);
      }
    }

    const nowIso = new Date().toISOString();

    try {
      await adminSupabase.from('messages_in').insert({
        account_id: accountId,
        lead_id,
        from_phone: from,
        to_phone: to,
        body: textRaw,
        processed: true,
      });
    } catch (inErr) {
      console.error('INBOUND_INSERT_ERR', inErr);
    }

    const outId = await persistOutbound({
      accountId,
      leadId: lead_id,
      toPhone: from,
      fromPhone: to,
      body: reply,
      status: 'queued',
      providerStatus: 'queued',
    });

    try {
      await adminSupabase
        .from('leads')
        .update({ last_inbound_at: nowIso, last_sent_at: nowIso, last_reply_body: textRaw })
        .eq('id', lead_id);
    } catch (leadUpdateErr) {
      console.error('LEAD_ACTIVITY_UPDATE_ERR', leadUpdateErr);
    }

    const twiml = `<Response><Message>${escapeXml(reply)}</Message></Response>`;
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(twiml);
  } catch (err) {
    console.error('WEBHOOK_FATAL', err);
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send('<Response></Response>');
  }
}
