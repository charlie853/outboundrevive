import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  const { data, error } = await supabaseAdmin
    .from('email_sending_inboxes')
    .select('id, account_id, domain_id, provider, email_address, warmup_status, daily_limit, health_score, last_synced_at, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inboxes: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  const body = await req.json().catch(() => ({}));
  const provider = typeof body.provider === 'string' && ['gmail', 'microsoft', 'smtp'].includes(body.provider) ? body.provider : null;
  const emailAddress = typeof body.email_address === 'string' ? body.email_address.trim().toLowerCase() : null;
  const domainId = body.domain_id || null;
  const dailyLimit = typeof body.daily_limit === 'number' && body.daily_limit > 0 ? body.daily_limit : 50;

  if (!provider || !emailAddress) {
    return NextResponse.json({ error: 'provider and email_address required' }, { status: 400 });
  }

  const credentialsRef = typeof body.credentials_ref === 'string' ? body.credentials_ref.trim() || null : null;

  const { data, error } = await supabaseAdmin
    .from('email_sending_inboxes')
    .insert({
      account_id: accountId,
      domain_id: domainId || null,
      provider,
      email_address: emailAddress,
      credentials_ref: credentialsRef,
      daily_limit: dailyLimit,
      warmup_status: {},
    })
    .select('id, account_id, domain_id, provider, email_address, warmup_status, daily_limit, health_score, last_synced_at, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
