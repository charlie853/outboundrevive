import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';
import { ensureDemoWatchlist } from '@/lib/ensureDemoWatchlist';
import {
  buildWatchlistFromMessages,
  persistWatchlistToDb,
} from '@/lib/buildWatchlistFromMessages';

export const runtime = 'nodejs';

async function fetchWatchlistFromDb(
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

  const { searchParams } = new URL(req.url);
  const windowFilter = searchParams.get('window');
  const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)));

  // 1) Build list by reading SMS (Messaging tab) + email reply content and scoring with signals
  let payload: any[] = [];
  try {
    const fromMessages = await buildWatchlistFromMessages(accountId, {
      windowFilter,
      limit,
    });
    if (fromMessages.length > 0) {
      await persistWatchlistToDb(accountId, fromMessages);
      payload = fromMessages.map((item) => ({
        score: item.score,
        window: item.window,
        reasons: item.reasons,
        updated_at: item.updated_at,
        lead: item.lead,
      }));
    }
  } catch (e) {
    console.warn('[watchlist] build from messages failed', e);
  }

  // 2) If no messages/replies yet, ensure demo entries and read from DB
  if (payload.length === 0) {
    try {
      await ensureDemoWatchlist(accountId);
      const fromDb = await fetchWatchlistFromDb(accountId, windowFilter, limit);
      if (!fromDb.dbError) payload = fromDb.payload;
    } catch (e) {
      console.warn('[watchlist] ensure demo failed', e);
    }
  }

  return NextResponse.json({ data: payload });
}

