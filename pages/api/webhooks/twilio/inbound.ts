import type { NextApiRequest, NextApiResponse } from 'next';
import { parse } from 'qs';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL!;
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

function normPhone(s: string | undefined) {
  return (s || '').replace(/[^\d+]/g, '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Twilio sends application/x-www-form-urlencoded
    const body = typeof req.body === 'string' ? parse(req.body) : (req.body ?? {});
    const from = normPhone(String((body as any).From));
    const to = normPhone(String((body as any).To));
    const text = String((body as any).Body ?? '').trim();

    // 1) Upsert lead (ensure account_id)
    await fetch(`${SUPABASE_URL}/rest/v1/leads?on_conflict=phone`, {
      method: 'POST',
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ account_id: ACCOUNT_ID, phone: from, name: from, replied: true, last_reply_at: new Date().toISOString() }])
    });

    // 2) Insert inbound message as "work" for the agent (processed=false)
    await fetch(`${SUPABASE_URL}/rest/v1/messages_in`, {
      method: 'POST',
      headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([{ account_id: ACCOUNT_ID, from_phone: from, to_phone: to, body: text, processed: false }])
    });

    // 3) Kick agent (fire-and-forget)
    fetch(`${PUBLIC_BASE_URL}/api/internal/agent/consume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'webhook' }) })
      .catch(() => {});

    // Tell Twilio OK right away
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks—message received.</Message></Response>`);
  } catch (e) {
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks—message received.</Message></Response>`);
  }
}
