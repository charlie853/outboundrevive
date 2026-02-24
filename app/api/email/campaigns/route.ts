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
    .from('email_campaigns')
    .select('id, name, status, settings, created_at, updated_at')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : null;
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const settings = body.settings && typeof body.settings === 'object' ? body.settings : {};
  const status = body.status && ['draft', 'active', 'paused', 'completed'].includes(body.status) ? body.status : 'draft';

  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .insert({ account_id: accountId, name, status, settings })
    .select('id, name, status, settings, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
