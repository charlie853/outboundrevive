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

  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .select('id, name, status, settings, created_at, updated_at')
    .eq('id', id)
    .eq('account_id', accountId)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
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
  if (typeof body.name === 'string') update.name = body.name.trim();
  if (body.settings && typeof body.settings === 'object') update.settings = body.settings;
  if (['draft', 'active', 'paused', 'completed'].includes(body.status)) update.status = body.status;

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'no changes' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('email_campaigns')
    .update(update)
    .eq('id', id)
    .eq('account_id', accountId)
    .select('id, name, status, settings, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;
  const { id } = await params;

  const { error } = await supabaseAdmin
    .from('email_campaigns')
    .delete()
    .eq('id', id)
    .eq('account_id', accountId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
