import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { sendEmail } from '@/lib/email/send';
import { injectTrackingIntoHtml, enqueueNextStepAfterSend } from '@/lib/email/queue';

export const runtime = 'nodejs';

type QueueItem = {
  id: string;
  account_id: string;
  campaign_id: string;
  step_id: string;
  lead_id: string;
  sending_inbox_id: string;
  thread_id: string | null;
  attempt: number;
  max_attempts: number;
};

function backoffRunAfter(attempt: number): string {
  const sec = Math.min(Math.pow(2, attempt) * 60, 3600);
  return new Date(Date.now() + sec * 1000).toISOString();
}

export async function POST(req: NextRequest) {
  const adminHeader = (req.headers.get('x-admin-token') || req.headers.get('authorization') || '').trim();
  const adminWant = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const isCron = req.headers.get('x-vercel-cron') === '1' && cronSecret && adminHeader === cronSecret;
  const isAdmin = adminHeader && adminWant && adminHeader === adminWant;
  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = (process.env.PUBLIC_BASE_URL || req.nextUrl?.origin || 'http://localhost:3000').replace(/\/$/, '');
  const now = new Date().toISOString();

  const { data: items, error } = await supabaseAdmin
    .from('email_send_queue')
    .select('id, account_id, campaign_id, step_id, lead_id, sending_inbox_id, thread_id, attempt, max_attempts')
    .eq('status', 'queued')
    .lte('run_after', now)
    .order('run_after', { ascending: true })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!items?.length) return NextResponse.json({ ok: true, processed: 0, results: [] });

  const results: { id: string; sent?: boolean; error?: string; skipped?: string }[] = [];

  for (const item of items as QueueItem[]) {
    const lock = await supabaseAdmin
      .from('email_send_queue')
      .update({ status: 'processing', locked_at: now })
      .eq('id', item.id)
      .eq('status', 'queued')
      .select('id')
      .single();

    if (lock.error || !lock.data) {
      results.push({ id: item.id, sent: false, skipped: 'lock_failed' });
      continue;
    }

    try {
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('id, email, name')
        .eq('id', item.lead_id)
        .eq('account_id', item.account_id)
        .single();
      const leadEmail = (lead as any)?.email?.trim().toLowerCase();
      if (!leadEmail) {
        results.push({ id: item.id, sent: false, error: 'missing_email' });
        await supabaseAdmin.from('email_send_queue').update({ status: 'failed', error_message: 'missing_email' }).eq('id', item.id);
        continue;
      }

      const { data: supp } = await supabaseAdmin
        .from('email_suppression')
        .select('id')
        .eq('email', leadEmail)
        .or(`account_id.eq.${item.account_id},account_id.is.null`)
        .limit(1)
        .maybeSingle();
      if ((supp as any)?.id) {
        results.push({ id: item.id, sent: false, skipped: 'suppressed' });
        await supabaseAdmin.from('email_send_queue').update({ status: 'sent', error_message: null }).eq('id', item.id);
        continue;
      }

      const { data: inbox } = await supabaseAdmin
        .from('email_sending_inboxes')
        .select('id, email_address, credentials_ref, daily_limit')
        .eq('id', item.sending_inbox_id)
        .single();
      const dailyLimit = (inbox as any)?.daily_limit ?? 50;

      const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
      const { data: threadIds } = await supabaseAdmin
        .from('email_threads')
        .select('id')
        .eq('sending_inbox_id', item.sending_inbox_id);
      const ids = (threadIds || []).map((t: any) => t.id);
      let sentToday = 0;
      if (ids.length > 0) {
        const { count } = await supabaseAdmin
          .from('email_messages')
          .select('id', { count: 'exact', head: true })
          .eq('direction', 'out')
          .gte('sent_at', todayStart)
          .in('thread_id', ids);
        sentToday = count ?? 0;
      }
      if (sentToday >= dailyLimit) {
        results.push({ id: item.id, sent: false, skipped: 'daily_cap' });
        await supabaseAdmin.from('email_send_queue').update({ status: 'queued', locked_at: null }).eq('id', item.id);
        continue;
      }

      const { data: step } = await supabaseAdmin
        .from('email_campaign_steps')
        .select('id, subject_template, body_template')
        .eq('id', item.step_id)
        .single();
      if (!step) {
        results.push({ id: item.id, sent: false, error: 'step_not_found' });
        await supabaseAdmin.from('email_send_queue').update({ status: 'failed', error_message: 'step_not_found' }).eq('id', item.id);
        continue;
      }

      let threadId = item.thread_id;
      if (!threadId) {
        const { data: existing } = await supabaseAdmin
          .from('email_threads')
          .select('id')
          .eq('campaign_id', item.campaign_id)
          .eq('lead_id', item.lead_id)
          .eq('sending_inbox_id', item.sending_inbox_id)
          .maybeSingle();
        if (existing?.id) {
          threadId = existing.id;
        } else {
          const { data: created } = await supabaseAdmin
            .from('email_threads')
            .insert({
              account_id: item.account_id,
              campaign_id: item.campaign_id,
              lead_id: item.lead_id,
              sending_inbox_id: item.sending_inbox_id,
              subject: (step as any).subject_template,
            })
            .select('id')
            .single();
          threadId = created?.id ?? null;
        }
        if (threadId) await supabaseAdmin.from('email_send_queue').update({ thread_id: threadId }).eq('id', item.id);
      }

      if (!threadId) {
        results.push({ id: item.id, sent: false, error: 'thread_create_failed' });
        await supabaseAdmin.from('email_send_queue').update({ status: 'failed', error_message: 'thread_create_failed' }).eq('id', item.id);
        continue;
      }

      const subject = ((step as any).subject_template || '').replace(/\{\{name\}\}/gi, (lead as any)?.name || '');
      const bodyRaw = (step as any).body_template || '';
      const bodyPlain = bodyRaw.replace(/<[^>]+>/g, '').trim();

      const { data: msgRow } = await supabaseAdmin
        .from('email_messages')
        .insert({
          thread_id: threadId,
          direction: 'out',
          subject,
          body_plain: bodyPlain,
          body_html: bodyRaw,
        })
        .select('id')
        .single();
      const messageId = (msgRow as any)?.id;
      if (!messageId) {
        results.push({ id: item.id, sent: false, error: 'message_insert_failed' });
        await supabaseAdmin.from('email_send_queue').update({ status: 'failed', error_message: 'message_insert_failed' }).eq('id', item.id);
        continue;
      }

      const bodyHtml = injectTrackingIntoHtml(bodyRaw, baseUrl, messageId);
      const from = (inbox as any)?.email_address;
      if (!from) {
        results.push({ id: item.id, sent: false, error: 'inbox_not_found' });
        await supabaseAdmin.from('email_send_queue').update({ status: 'failed', error_message: 'inbox_not_found' }).eq('id', item.id);
        continue;
      }

      const sendResult = await sendEmail(
        item.sending_inbox_id,
        { to: leadEmail, subject, bodyHtml, bodyPlain, from },
        (inbox as any)?.credentials_ref ?? null
      );

      await supabaseAdmin
        .from('email_messages')
        .update({
          provider_message_id: sendResult.providerMessageId,
          sent_at: sendResult.sentAt,
        })
        .eq('id', messageId);

      await supabaseAdmin.from('email_events').insert({
        account_id: item.account_id,
        campaign_id: item.campaign_id,
        lead_id: item.lead_id,
        thread_id: threadId,
        message_id: messageId,
        event_type: 'sent',
        meta: { provider_message_id: sendResult.providerMessageId },
      });

      await supabaseAdmin.from('email_send_queue').update({ status: 'sent', error_message: null, locked_at: null }).eq('id', item.id);
      await supabaseAdmin.from('email_threads').update({ last_message_at: sendResult.sentAt }).eq('id', threadId);

      await enqueueNextStepAfterSend({
        accountId: item.account_id,
        campaignId: item.campaign_id,
        currentStepId: item.step_id,
        leadId: item.lead_id,
        sendingInboxId: item.sending_inbox_id,
        threadId,
      });

      results.push({ id: item.id, sent: true });
    } catch (err: any) {
      const attempt = item.attempt + 1;
      const tooMany = attempt >= item.max_attempts;
      await supabaseAdmin
        .from('email_send_queue')
        .update({
          status: tooMany ? 'dead_letter' : 'queued',
          error_message: err?.message || 'send_error',
          attempt,
          run_after: tooMany ? undefined : backoffRunAfter(attempt),
          locked_at: null,
        })
        .eq('id', item.id);
      results.push({ id: item.id, sent: false, error: err?.message || 'send_error' });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
