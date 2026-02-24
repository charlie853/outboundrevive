import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Unsubscribe link. GET /api/email/t/unsub/[messageId]
 * Adds lead email to suppression list and redirects to thank-you or returns HTML.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return new NextResponse(null, { status: 404 });

  const { data: msg } = await supabaseAdmin
    .from('email_messages')
    .select('thread_id')
    .eq('id', id)
    .single();
  if (!msg?.thread_id) return new NextResponse('Invalid link', { status: 404 });

  const { data: thread } = await supabaseAdmin
    .from('email_threads')
    .select('account_id, lead_id')
    .eq('id', msg.thread_id)
    .single();
  if (!thread) return new NextResponse('Invalid link', { status: 404 });

  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('email')
    .eq('id', thread.lead_id)
    .single();

  const email = lead?.email?.trim().toLowerCase();
  if (email) {
    const { error } = await supabaseAdmin.from('email_suppression').insert({
      account_id: thread.account_id,
      email,
      reason: 'unsub',
    });
    if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabaseAdmin.from('email_events').insert({
    account_id: thread.account_id,
    campaign_id: thread.campaign_id,
    lead_id: thread.lead_id,
    thread_id: msg.thread_id,
    message_id: id,
    event_type: 'unsubscribed',
    meta: {},
  });

  const base = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
  const thankYouUrl = `${base}/email-unsubscribed`;
  return NextResponse.redirect(thankYouUrl, 302);
}
