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
    .from('email_subsequence_rules')
    .select('id, campaign_id, trigger_type, trigger_value, target_flow, created_at')
    .eq('campaign_id', campaignId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
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
  const trigger_type = body.trigger_type === 'keyword' ? 'keyword' : 'label';
  const trigger_value = typeof body.trigger_value === 'string' ? body.trigger_value.trim() : '';
  const target_flow = typeof body.target_flow === 'string' ? body.target_flow.trim() : 'stop';
  if (!trigger_value) return NextResponse.json({ error: 'trigger_value required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('email_subsequence_rules')
    .insert({ campaign_id: campaignId, trigger_type, trigger_value, target_flow })
    .select('id, campaign_id, trigger_type, trigger_value, target_flow, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
