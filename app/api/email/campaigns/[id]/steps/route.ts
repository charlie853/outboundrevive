import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function assertCampaignAccess(accountId: string, campaignId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('email_campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('account_id', accountId)
    .maybeSingle();
  return !!data;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;
  const { id: campaignId } = await params;

  if (!(await assertCampaignAccess(accountId, campaignId)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('email_campaign_steps')
    .select('id, campaign_id, order_index, subject_template, body_template, delay_days, delay_time_window, created_at')
    .eq('campaign_id', campaignId)
    .order('order_index', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ steps: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;
  const { id: campaignId } = await params;

  if (!(await assertCampaignAccess(accountId, campaignId)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const subject_template = typeof body.subject_template === 'string' ? body.subject_template : '';
  const body_template = typeof body.body_template === 'string' ? body.body_template : '';
  const delay_days = typeof body.delay_days === 'number' ? body.delay_days : 0;
  const delay_time_window = typeof body.delay_time_window === 'string' ? body.delay_time_window : null;
  const order_index = typeof body.order_index === 'number' ? body.order_index : 0;

  const { data, error } = await supabaseAdmin
    .from('email_campaign_steps')
    .insert({
      campaign_id: campaignId,
      order_index,
      subject_template,
      body_template,
      delay_days,
      delay_time_window,
    })
    .select('id, campaign_id, order_index, subject_template, body_template, delay_days, delay_time_window, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
