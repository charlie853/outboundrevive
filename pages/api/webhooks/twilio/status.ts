import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { toE164US } from '@/lib/phone';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const start = Date.now();
  try {
    const { query } = req;
    const account_id = query.account_id ? String(query.account_id) : null;
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
    const toPhone = typeof twilioTo === 'string' ? toE164US(twilioTo) : null;
    const fromPhone = typeof twilioFrom === 'string' ? toE164US(twilioFrom) : null;

    console.log('[twilio/status] webhook received', {
      messageSid,
      messageStatus,
      hasErrorCode: errorCode != null,
      account_id,
      out_id,
    });

    if (!messageSid) {
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

    // Build base query
    let queryBuilder = admin.from('messages_out').update(updates);

    if (out_id) {
      queryBuilder = queryBuilder.eq('id', out_id);
    } else {
      queryBuilder = queryBuilder.eq('provider_sid', messageSid);
    }

    if (account_id) {
      queryBuilder = queryBuilder.eq('account_id', account_id);
    }

    const { error } = await queryBuilder;

    if (error) {
      console.error('[twilio/status] failed to update message', { messageSid, error: error.message });
    } else {
      console.log('[twilio/status] updated message', { messageSid, status: updates.status });
    }

    res.status(200).send('<ok/>');
  } catch (err: any) {
    console.error('[twilio/status] handler exception', { message: err?.message });
    res.status(200).send('<ok/>');
  } finally {
    console.log('[twilio/status] completed', { durationMs: Date.now() - start });
  }
}
