import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;
  const { id } = await params;

  const { data: thread, error: threadError } = await supabaseAdmin
    .from('email_threads')
    .select(`
      id,
      account_id,
      campaign_id,
      lead_id,
      sending_inbox_id,
      provider_thread_id,
      subject,
      labels,
      assignee_id,
      assigned_at,
      last_message_at,
      created_at,
      email_campaigns(name),
      leads(name, email),
      email_sending_inboxes(email_address)
    `)
    .eq('id', id)
    .eq('account_id', accountId)
    .single();

  if (threadError || !thread) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: messages, error: msgError } = await supabaseAdmin
    .from('email_messages')
    .select('id, direction, subject, body_plain, body_html, sent_at, opened_at, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true });

  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 });

  return NextResponse.json({ thread, messages: messages ?? [] });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (Array.isArray(body.labels)) update.labels = body.labels;
  if (body.assignee_id !== undefined) {
    update.assignee_id = body.assignee_id === null || body.assignee_id === '' ? null : body.assignee_id;
    update.assigned_at = body.assignee_id ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'no changes' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('email_threads')
    .update(update)
    .eq('id', id)
    .eq('account_id', accountId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
