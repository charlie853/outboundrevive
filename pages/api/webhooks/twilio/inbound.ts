import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
} satisfies Record<string, string>;

function twiml(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const From = String(req.body?.From ?? '').trim();
    const To = String(req.body?.To ?? '').trim();
    const Body = String(req.body?.Body ?? '').trim();

    const settingsUrl = new URL(`${SUPABASE_URL}/rest/v1/account_settings`);
    settingsUrl.searchParams.set('select', 'account_id,phone_from');
    settingsUrl.searchParams.set('phone_from', `eq.${To}`);

    const settingsResp = await fetch(settingsUrl.toString(), { headers });
    const settingsJson = settingsResp.ok ? await settingsResp.json() : [];
    const account_id: string | undefined = settingsJson?.[0]?.account_id;

    if (!account_id) {
      res
        .status(200)
        .setHeader('Content-Type', 'text/xml')
        .send(twiml('Thanks—message received.'));
      return;
    }

    const now = new Date().toISOString();

    await fetch(`${SUPABASE_URL}/rest/v1/leads?on_conflict=phone`, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        {
          account_id,
          phone: From,
          name: From,
          status: 'pending',
          created_at: now,
          last_inbound_at: now,
          replied: true,
          last_reply_at: now,
        },
      ]),
    });

    await fetch(`${SUPABASE_URL}/rest/v1/messages_in`, {
      method: 'POST',
      headers,
      body: JSON.stringify([
        {
          account_id,
          from_phone: From,
          to_phone: To,
          body: Body,
          created_at: now,
        },
      ]),
    });

    res
      .status(200)
      .setHeader('Content-Type', 'text/xml')
      .send(twiml('Thanks—message received.'));
  } catch (error) {
    res
      .status(200)
      .setHeader('Content-Type', 'text/xml')
      .send(twiml('Thanks—message received.'));
  }
}
