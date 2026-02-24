import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';
import { syncScoresFromReplies } from '@/lib/syncScoresFromReplies';
import { ensureDemoWatchlist } from '@/lib/ensureDemoWatchlist';

export const runtime = 'nodejs';

async function fetchWatchlistPayload(
  accountId: string,
  windowFilter: string | null,
  limit: number
): Promise<{ payload: any[]; dbError: Error | null }> {
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
  const payload = (data || []).map((row: any) => ({
    score: row.score,
    window: row.window_bucket ?? row.window,
    reasons: row.reason_json,
    updated_at: row.updated_at,
    lead: row.leads,
  }));
  return { payload, dbError: dbError ? new Error(dbError.message) : null };
}

export async function GET(req: NextRequest) {
  const { accountId, error } = await getUserAndAccountFromRequest(req, { requireUser: true });
  if (!accountId || error) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 1) Sync from real email + SMS reply content so list reflects actual engagement
  try {
    await syncScoresFromReplies(accountId);
  } catch (e) {
    console.warn('[watchlist] sync from replies failed', e);
  }

  const { searchParams } = new URL(req.url);
  const windowFilter = searchParams.get('window');
  const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));

  let { payload, dbError } = await fetchWatchlistPayload(accountId, windowFilter, limit);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // 2) If still empty (no replies yet or sync found nothing), ensure demo entries so list always populates
  if (payload.length === 0) {
    try {
      await ensureDemoWatchlist(accountId);
      const next = await fetchWatchlistPayload(accountId, windowFilter, limit);
      if (!next.dbError) payload = next.payload;
    } catch (e) {
      console.warn('[watchlist] ensure demo failed', e);
    }
  }

  return NextResponse.json({ data: payload });
}

