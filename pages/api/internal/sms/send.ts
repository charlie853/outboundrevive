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

    const { account_id, lead_id, to, body, dedup_key } = req.body || {};

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

    const supaUrl = process.env.SUPABASE_URL;
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supaUrl || !supaKey) {
      console.error('OUTBOUND_DB_CONFIG_ERR', 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    } else {
      const supa = createClient(supaUrl, supaKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const nowIso = new Date().toISOString();
      const insertPayload: Record<string, unknown> = {
        account_id,
        lead_id: lead_id ?? null,
        to_phone: to,
        from_phone: FROM ?? null,
        body,
        status: 'sent',
        provider: 'twilio',
        provider_sid: msg.sid,
        provider_status: msg.status,
        sent_by: 'ai',
        created_at: nowIso,
        sent_at: nowIso,
      };
      if (dedup_key) insertPayload.dedup_key = dedup_key;

      const { data, error } = await supa.from('messages_out').insert(insertPayload).select();
      if (error) {
        console.error('OUTBOUND_DB_INSERT_ERR', error);
      }

      if (lead_id) {
        const { error: leadUpdErr } = await supa
          .from('leads')
          .update({ last_sent_at: nowIso })
          .eq('id', lead_id)
          .eq('account_id', account_id);
        if (leadUpdErr) console.error('LEAD_UPD_OUTBOUND_ERR', leadUpdErr);
      }

      return res.status(200).json({ ok: true, twilio_sid: msg.sid, provider_status: msg.status, db: data ?? null });
    }

    return res.status(200).json({ ok: true, twilio_sid: msg.sid, provider_status: msg.status, db: null });
  } catch (e: any) {
    console.error('OUTBOUND_SEND_FATAL', e?.message || e);
    return res.status(500).json({ error: 'send_failed', detail: e?.message || String(e) });
  }
}
