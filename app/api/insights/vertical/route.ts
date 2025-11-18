import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { accountId, error } = await getUserAndAccountFromRequest(req, { requireUser: true });
  if (!accountId || error) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [scoresRes, factsRes, offersRes] = await Promise.all([
    supabaseAdmin.from('scores_next_buy').select('window_bucket').eq('account_id', accountId),
    supabaseAdmin.from('conv_facts').select('key').eq('account_id', accountId),
    supabaseAdmin.from('offer_sends').select('accepted, revenue_attributed').eq('account_id', accountId),
  ]);

  if (scoresRes.error) return NextResponse.json({ error: scoresRes.error.message }, { status: 500 });
  if (factsRes.error) return NextResponse.json({ error: factsRes.error.message }, { status: 500 });
  if (offersRes.error) return NextResponse.json({ error: offersRes.error.message }, { status: 500 });

  const watchlistCounts = (scoresRes.data || []).reduce<Record<string, number>>((acc, row) => {
    const bucket = row.window_bucket || 'unknown';
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});

  const factKeys = new Set((factsRes.data || []).map((f) => f.key));
  const microCoverage = {
    mileage_band: factKeys.has('mileage_band'),
    timing_intent: factKeys.has('timing_intent'),
    drivers_in_household: factKeys.has('drivers_in_household'),
    collected_keys: factKeys.size,
  };

  const offerStats = (offersRes.data || []).reduce(
    (acc, row) => {
      acc.total += 1;
      if (row.accepted) acc.accepted += 1;
      acc.revenue += Number(row.revenue_attributed || 0);
      return acc;
    },
    { total: 0, accepted: 0, revenue: 0 }
  );

  return NextResponse.json({
    watchlist: watchlistCounts,
    micro_surveys: microCoverage,
    offers: offerStats,
  });
}

