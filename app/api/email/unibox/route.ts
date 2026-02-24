import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * List threads (replies view). Query: campaign_id, label, assignee_id, limit.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaign_id') || undefined;
  const label = searchParams.get('label') || undefined;
  const assigneeId = searchParams.get('assignee_id') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

  let q = supabaseAdmin
    .from('email_threads')
    .select(`
      id,
      campaign_id,
      lead_id,
      sending_inbox_id,
      subject,
      labels,
      assignee_id,
      assigned_at,
      last_message_at,
      created_at,
      email_campaigns(name),
      leads(name, email)
    `)
    .eq('account_id', accountId)
    .order('last_message_at', { ascending: false })
    .limit(limit);

  if (campaignId) q = q.eq('campaign_id', campaignId);
  if (assigneeId) q = q.eq('assignee_id', assigneeId);
  if (label) q = q.contains('labels', [label]);

  const { data, error } = await q;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ threads: data ?? [] });
}
