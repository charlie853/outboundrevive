import type { NextApiRequest, NextApiResponse } from 'next';
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (req.headers['x-internal-secret'] !== process.env.INTERNAL_API_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { account_id, lead_id, to, body } = req.body || {};

    if (!account_id || !to || !body) {
      return res.status(400).json({ error: 'account_id, to, body required' });
    }

    const FROM = process.env.TWILIO_FROM;
    const MSID = process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;
    if (!FROM && !MSID) {
      return res.status(500).json({ error: 'No TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID configured' });
    }

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !auth) {
      return res.status(500).json({ error: 'Twilio credentials missing' });
    }
    const client = twilio(sid, auth);

    const statusCallback = process.env.PUBLIC_BASE_URL
      ? `${process.env.PUBLIC_BASE_URL}/api/webhooks/twilio/status`
      : undefined;

    const msg = await client.messages.create({
      to,
      body,
      ...(MSID ? { messagingServiceSid: MSID } : { from: FROM! }),
      ...(statusCallback ? { statusCallback } : {}),
    });

    const supa = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const row = {
      account_id,
      lead_id: lead_id ?? null,
      to_phone: to,
      from_phone: FROM ?? null,
      body,
      status: 'sent',
      provider: 'twilio',
      provider_sid: msg.sid,
    };

    const { data: outRows, error: outErr } = await supa
      .from('messages_out')
      .insert(row)
      .select('id, created_at, status, provider_sid');

    if (outErr) {
      console.error('OUTBOUND_DB_INSERT_ERR', outErr);
      return res.status(500).json({ error: 'db_insert_failed', detail: outErr.message, twilio_sid: msg.sid });
    }

    if (lead_id) {
      const { error: leadErr } = await supa
        .from('leads')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('account_id', account_id)
        .eq('id', lead_id);
      if (leadErr) console.error('LEAD_ACTIVITY_UPDATE_ERR', leadErr);
    }

    return res.status(200).json({
      ok: true,
      twilio_sid: msg.sid,
      provider_status: msg.status,
      db: outRows,
    });
  } catch (e: any) {
    console.error('OUTBOUND_SEND_FATAL', e?.message || e);
    return res.status(500).json({ error: 'send_failed', detail: e?.message || String(e) });
  }
}
