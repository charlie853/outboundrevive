import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const adminHeader = (req.headers.get('x-admin-token') || '').trim();
    const adminWant = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
    if (!adminHeader || !adminWant || adminHeader !== adminWant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { error } = await supabaseAdmin
      .from('tenant_billing')
      .update({ segments_used: 0, cycle_start: thisMonthStart.toISOString(), cycle_end: nextMonthStart.toISOString(), updated_at: now.toISOString() })
      .neq('account_id', '00000000-0000-0000-0000-000000000000');
    if (error) return NextResponse.json({ error: 'DB error', detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}


