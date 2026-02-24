import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function assertStepAccess(accountId: string, stepId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('email_campaign_steps')
    .select('id, campaign_id')
    .eq('id', stepId)
    .maybeSingle();
  if (!data) return false;
  const { data: camp } = await supabaseAdmin
    .from('email_campaigns')
    .select('id')
    .eq('id', (data as any).campaign_id)
    .eq('account_id', accountId)
    .maybeSingle();
  return !!camp;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;
  const { stepId } = await params;

  if (!(await assertStepAccess(accountId, stepId)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if (typeof body.subject_template === 'string') update.subject_template = body.subject_template;
  if (typeof body.body_template === 'string') update.body_template = body.body_template;
  if (typeof body.delay_days === 'number') update.delay_days = body.delay_days;
  if (body.delay_time_window !== undefined) update.delay_time_window = body.delay_time_window;
  if (typeof body.order_index === 'number') update.order_index = body.order_index;

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'no changes' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('email_campaign_steps')
    .update(update)
    .eq('id', stepId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;
  const { stepId } = await params;

  if (!(await assertStepAccess(accountId, stepId)))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabaseAdmin.from('email_campaign_steps').delete().eq('id', stepId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
