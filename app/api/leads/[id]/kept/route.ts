import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: any) {
  // Check authentication and get account ID
  const accountId = await requireAccountAccess();
  if (!accountId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const leadId = params?.id as string;
    const body = await req.json().catch(() => ({}));
    const kept = typeof body.kept === 'boolean' ? body.kept : true;

    const { data, error } = await supabaseAdmin
      .from('leads')
      .update({ kept })
      .eq('id', leadId)
      .eq('account_id', accountId)
      .select('id, booked, kept')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
