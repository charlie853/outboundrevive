import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { accountId, error } = await getUserAndAccountFromRequest(req, { requireUser: true });
  if (!accountId || error) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const windowFilter = searchParams.get('window');
  const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));

  let query = supabaseAdmin
    .from('scores_next_buy')
    .select(`
      score,
      window,
      reason_json,
      updated_at,
      leads!inner(
        id,
        name,
        phone,
        email,
        status,
        crm_status,
        crm_stage,
        booked
      )
    `)
    .eq('account_id', accountId)
    .order('score', { ascending: false })
    .limit(limit);

  if (windowFilter) {
    query = query.eq('window', windowFilter);
  }

  const { data, error: dbError } = await query;
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  const payload = (data || []).map((row: any) => ({
    score: row.score,
    window: row.window_bucket ?? row.window,
    reasons: row.reason_json,
    updated_at: row.updated_at,
    lead: row.leads,
  }));

  return NextResponse.json({ data: payload });
}

