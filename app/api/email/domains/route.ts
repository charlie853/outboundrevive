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
    .from('email_domains')
    .select('id, domain, dns_status, tracking_domain, verified_at, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ domains: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  const body = await req.json().catch(() => ({}));
  const domain = typeof body.domain === 'string' ? body.domain.trim().toLowerCase() : null;
  if (!domain) return NextResponse.json({ error: 'domain required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('email_domains')
    .insert({
      account_id: accountId,
      domain,
      dns_status: {},
    })
    .select('id, domain, dns_status, tracking_domain, verified_at, created_at')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Domain already exists for this account' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
