import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

const sbHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const From = String(req.body?.From ?? '').trim();
    const To   = String(req.body?.To ?? '').trim();
    const Body = String(req.body?.Body ?? '').trim();
    const now  = new Date().toISOString();

    // Resolve account by inbound number
    const s = new URL(`${SUPABASE_URL}/rest/v1/account_settings`);
    s.searchParams.set('select', 'account_id, phone_from, autotexter_enabled, brand, quiet_hours, tz, quiet_start, quiet_end');
    s.searchParams.set('phone_from', `eq.${To}`);
    const rSet = await fetch(s.toString(), { headers: sbHeaders });
    const settings = rSet.ok ? await rSet.json() : [];
    const set = settings?.[0];

    const account_id: string | undefined = set?.account_id;
    const autotexter_enabled: boolean = !!set?.autotexter_enabled;

    // If no account matches this To number, just ACK so Twilio is happy
    if (!account_id) {
      res
        .status(200)
        .setHeader('Content-Type', 'text/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks—message received.</Message></Response>`);
      return;
    }

    // Upsert lead for this account
    await fetch(`${SUPABASE_URL}/rest/v1/leads?on_conflict=phone`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify([{
        account_id,
        phone: From,
        name: From,
        status: 'pending',
        created_at: now,
        last_inbound_at: now,
        replied: true,
        last_reply_at: now,
      }]),
    });

    // Insert inbound message
    await fetch(`${SUPABASE_URL}/rest/v1/messages_in`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify([{
        account_id,
        from_phone: From,
        to_phone: To,
        body: Body,
        created_at: now,
      }]),
    });

    // Fire-and-forget: trigger the responder immediately (if enabled)
    if (autotexter_enabled && PUBLIC_BASE_URL) {
      fetch(`${PUBLIC_BASE_URL}/api/internal/agent/consume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ account_id, from: From, to: To, mode: 'immediate' }),
      }).catch(() => {});
    }

    // Return TwiML (never block Twilio on AI)
    res
      .status(200)
      .setHeader('Content-Type', 'text/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks—message received.</Message></Response>`);
  } catch {
    res
      .status(200)
      .setHeader('Content-Type', 'text/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks—message received.</Message></Response>`);
  }
}
