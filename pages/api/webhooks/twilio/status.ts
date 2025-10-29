import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { query } = req;
    const account_id = String(query.account_id || '');
    const out_id = query.out_id ? String(query.out_id) : null;

    const {
      MessageSid,
      MessageStatus,
      ErrorCode,
      To: twilioTo,
      From: twilioFrom,
    } = (req.body || {}) as Record<string, unknown>;

    const messageSid = MessageSid ? String(MessageSid) : '';
    const messageStatus = MessageStatus ? String(MessageStatus) : '';
    const errorCode = ErrorCode ?? null;
    const toPhone = typeof twilioTo === 'string' ? twilioTo : null;
    const fromPhone = typeof twilioFrom === 'string' ? twilioFrom : null;

    if (!account_id || !messageSid) {
      res.status(200).send('<ok/>');
      return;
    }

    const updates: Record<string, unknown> = {
      provider_sid: messageSid,
      provider_status: messageStatus || null,
      provider_error_code: errorCode,
    };

    if (toPhone) updates.to_phone = toPhone;
    if (fromPhone) updates.from_phone = fromPhone;

    if (messageStatus === 'delivered') {
      updates.status = 'delivered';
      updates.delivered_at = new Date().toISOString();
    } else if (messageStatus === 'failed' || messageStatus === 'undelivered') {
      updates.status = 'failed';
      updates.failed_at = new Date().toISOString();
    } else if (messageStatus === 'sent' || messageStatus === 'queued' || messageStatus === 'accepted') {
      updates.status = 'sent';
      updates.sent_at = new Date().toISOString();
    }

    if (out_id) {
      await admin
        .from('messages_out')
        .update(updates)
        .eq('account_id', account_id)
        .eq('id', out_id);
    } else {
      await admin
        .from('messages_out')
        .update(updates)
        .eq('account_id', account_id)
        .eq('provider_sid', messageSid);
    }

    res.status(200).send('<ok/>');
  } catch {
    res.status(200).send('<ok/>');
  }
}
