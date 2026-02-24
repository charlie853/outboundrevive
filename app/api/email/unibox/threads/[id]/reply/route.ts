import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';
import { sendEmail } from '@/lib/email/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Send a manual reply in a thread. Body: { body_plain, body_html? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;
  const { id: threadId } = await params;

  const body = await req.json().catch(() => ({}));
  const bodyPlain = typeof body.body_plain === 'string' ? body.body_plain.trim() : null;
  const bodyHtml = typeof body.body_html === 'string' ? body.body_html : (bodyPlain ? bodyPlain.replace(/\n/g, '<br>') : null);
  if (!bodyPlain) return NextResponse.json({ error: 'body_plain required' }, { status: 400 });

  const { data: thread, error: threadError } = await supabaseAdmin
    .from('email_threads')
    .select('id, account_id, campaign_id, lead_id, sending_inbox_id, subject')
    .eq('id', threadId)
    .eq('account_id', accountId)
    .single();

  if (threadError || !thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('email, name')
    .eq('id', (thread as any).lead_id)
    .single();
  const toEmail = (lead as any)?.email;
  if (!toEmail) return NextResponse.json({ error: 'Lead has no email' }, { status: 400 });

  const { data: inbox } = await supabaseAdmin
    .from('email_sending_inboxes')
    .select('id, email_address, credentials_ref')
    .eq('id', (thread as any).sending_inbox_id)
    .single();
  const from = (inbox as any)?.email_address;
  if (!from) return NextResponse.json({ error: 'Inbox not found' }, { status: 500 });

  const subject = `Re: ${((thread as any).subject || 'Reply').replace(/^Re:\s*/i, '')}`;

  let providerMessageId: string;
  let sentAt: string;
  try {
    const result = await sendEmail(
      (thread as any).sending_inbox_id,
      { to: toEmail, subject, bodyHtml: bodyHtml || bodyPlain, bodyPlain, from },
      (inbox as any)?.credentials_ref ?? null
    );
    providerMessageId = result.providerMessageId;
    sentAt = result.sentAt;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Send failed' }, { status: 500 });
  }

  const { data: msgRow, error: insertError } = await supabaseAdmin
    .from('email_messages')
    .insert({
      thread_id: threadId,
      direction: 'out',
      provider_message_id: providerMessageId,
      subject,
      body_plain: bodyPlain,
      body_html: bodyHtml || bodyPlain,
      sent_at: sentAt,
    })
    .select('id')
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await supabaseAdmin.from('email_threads').update({ last_message_at: sentAt }).eq('id', threadId);
  await supabaseAdmin.from('email_events').insert({
    account_id: accountId,
    campaign_id: (thread as any).campaign_id,
    lead_id: (thread as any).lead_id,
    thread_id: threadId,
    message_id: (msgRow as any).id,
    event_type: 'sent',
    meta: { manual_reply: true, provider_message_id: providerMessageId },
  });

  return NextResponse.json({ id: (msgRow as any).id, sent_at: sentAt });
}
