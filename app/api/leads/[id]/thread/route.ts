import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: any) {
  // Check authentication and get account ID
  const accountId = await requireAccountAccess();
  if (!accountId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params?.id as string;

  // First verify the lead belongs to this account
  const { data: lead, error: leadError } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle();

  if (leadError || !lead) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  // outbounds
  const { data: outs, error: e1 } = await supabaseAdmin
    .from('outbound_messages')
    .select('sid,body,status,created_at')
    .eq('lead_id', id);

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // inbound replies
  const { data: ins, error: e2 } = await supabaseAdmin
    .from('replies')
    .select('message_sid,body,intent,created_at')
    .eq('lead_id', id);

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const items = [
    ...(outs || []).map(o => ({
      dir: 'out' as const,
      at: o.created_at,
      body: o.body,
      sid: o.sid,
      status: o.status
    })),
    ...(ins || []).map(r => ({
      dir: 'in' as const,
      at: r.created_at,
      body: r.body,
      sid: r.message_sid || null,
      intent: r.intent || null
    }))
  ].sort((a, b) => new Date(a.at as any).getTime() - new Date(b.at as any).getTime());

  return NextResponse.json({ items });
}
