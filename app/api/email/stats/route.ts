import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Aggregate stats for email: per campaign and account-level. Query: campaign_id (optional).
 */
export async function GET(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaign_id') || undefined;

  const campaignsFilter = campaignId ? { campaign_id: campaignId } : {};
  const base = supabaseAdmin.from('email_events').select('event_type, campaign_id').eq('account_id', accountId);

  let q = base as any;
  if (campaignId) q = q.eq('campaign_id', campaignId);
  const { data: events, error } = await q;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = { sent: 0, opened: 0, replied: 0, bounced: 0, unsubscribed: 0 };
  for (const e of events || []) {
    const t = (e as any).event_type;
    if (t === 'sent') counts.sent++;
    else if (t === 'opened') counts.opened++;
    else if (t === 'replied') counts.replied++;
    else if (t === 'bounced') counts.bounced++;
    else if (t === 'unsubscribed') counts.unsubscribed++;
  }

  const { count: threadCount } = await supabaseAdmin
    .from('email_threads')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .match(campaignsFilter);

  const { count: queueQueued } = await supabaseAdmin
    .from('email_send_queue')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('status', 'queued')
    .match(campaignId ? { campaign_id: campaignId } : {});

  return NextResponse.json({
    ...counts,
    threads: threadCount ?? 0,
    queue_queued: queueQueued ?? 0,
  });
}
