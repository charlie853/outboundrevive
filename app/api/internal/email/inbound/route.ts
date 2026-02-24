import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { evaluateSubsequenceRules } from '@/lib/email/subsequence';
import { pushEmailReplyToCrm } from '@/lib/email/crm-sync';

export const runtime = 'nodejs';

export interface InboundEmailPayload {
  account_id: string;
  from: string;
  to: string;
  subject?: string;
  body_plain: string;
  body_html?: string;
  provider_message_id: string;
  in_reply_to?: string;
  references?: string;
  received_at?: string;
}

/**
 * Ingest an inbound reply. Called by Gmail/Graph webhook or polling cron.
 * Finds thread by in_reply_to (matches our sent message provider_message_id) or by to+from+subject.
 */
export async function POST(req: NextRequest) {
  const adminHeader = (req.headers.get('x-admin-token') || req.headers.get('authorization') || '').trim();
  const adminWant = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  if (!adminHeader || !adminWant || adminHeader !== adminWant) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as InboundEmailPayload;
  const accountId = body.account_id;
  const from = body.from?.trim();
  const to = body.to?.trim();
  const subject = body.subject?.trim() || '';
  const bodyPlain = body.body_plain ?? '';
  const bodyHtml = body.body_html ?? null;
  const providerMessageId = body.provider_message_id;
  const inReplyTo = body.in_reply_to?.trim();
  const receivedAt = body.received_at || new Date().toISOString();

  if (!accountId || !from || !to || !providerMessageId) {
    return NextResponse.json({ error: 'account_id, from, to, provider_message_id required' }, { status: 400 });
  }

  let threadId: string | null = null;
  if (inReplyTo) {
    const { data: msg } = await supabaseAdmin
      .from('email_messages')
      .select('thread_id')
      .eq('provider_message_id', inReplyTo)
      .eq('direction', 'out')
      .maybeSingle();
    if (msg?.thread_id) threadId = msg.thread_id;
  }

  if (!threadId) {
    const { data: inbox } = await supabaseAdmin
      .from('email_sending_inboxes')
      .select('id')
      .eq('account_id', accountId)
      .eq('email_address', to)
      .maybeSingle();
    if (inbox?.id) {
      const leadEmail = from.replace(/^.*<([^>]+)>$/, '$1').trim().toLowerCase();
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('account_id', accountId)
        .ilike('email', leadEmail)
        .maybeSingle();
      if (lead?.id) {
        const { data: camp } = await supabaseAdmin
          .from('email_campaigns')
          .select('id')
          .eq('account_id', accountId)
          .limit(1)
          .maybeSingle();
        if (camp?.id) {
          const { data: th } = await supabaseAdmin
            .from('email_threads')
            .select('id')
            .eq('campaign_id', camp.id)
            .eq('lead_id', lead.id)
            .eq('sending_inbox_id', inbox.id)
            .maybeSingle();
          threadId = th?.id ?? null;
        }
      }
    }
  }

  if (!threadId) {
    return NextResponse.json({ error: 'thread_not_found', message: 'No matching thread for this reply' }, { status: 200 });
  }

  const { data: msgRow, error } = await supabaseAdmin
    .from('email_messages')
    .insert({
      thread_id: threadId,
      direction: 'in',
      provider_message_id: providerMessageId,
      subject,
      body_plain: bodyPlain,
      body_html: bodyHtml,
      sent_at: receivedAt,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: thread } = await supabaseAdmin.from('email_threads').select('campaign_id, lead_id, labels').eq('id', threadId).single();
  if (thread) {
    await supabaseAdmin.from('email_threads').update({ last_message_at: receivedAt }).eq('id', threadId);
    await supabaseAdmin.from('email_events').insert({
      account_id: accountId,
      campaign_id: (thread as any).campaign_id,
      lead_id: (thread as any).lead_id,
      thread_id: threadId,
      message_id: (msgRow as any).id,
      event_type: 'replied',
      meta: {},
    });

    const labels = Array.isArray((thread as any).labels) ? (thread as any).labels : [];
    const subResult = await evaluateSubsequenceRules({
      accountId,
      campaignId: (thread as any).campaign_id,
      leadId: (thread as any).lead_id,
      threadId,
      messageId: (msgRow as any).id,
      replyBody: bodyPlain,
      labels,
    });

    await pushEmailReplyToCrm({
      accountId,
      leadId: (thread as any).lead_id,
      replyBody: bodyPlain,
      labels,
      threadId,
    }).catch(() => {});

    if (subResult.triggered && subResult.action === 'stop') {
      await supabaseAdmin
        .from('email_send_queue')
        .update({ status: 'failed', error_message: 'subsequence_stop' })
        .eq('campaign_id', (thread as any).campaign_id)
        .eq('lead_id', (thread as any).lead_id)
        .in('status', ['queued', 'processing']);
    }
  }

  return NextResponse.json({ thread_id: threadId, message_id: (msgRow as any).id });
}
