import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get('account_id') || '11111111-1111-1111-1111-111111111111';
  const minutes = Math.max(parseInt(searchParams.get('minutes') || '5', 10), 1);
  const limit   = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  // Pull from the flags view, but recompute the time window on the server side too (portable safety)
  const { data, error } = await supabaseAdmin
    .from('v_threads_flags')
    .select('*')
    .eq('account_id', account_id)
    .order('last_activity_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500 });

  const now = Date.now();
  const rows = (data || []).filter((r: any) => {
    const awaiting =
      r.last_in_at &&
      (!r.last_out_at || r.last_in_at > r.last_out_at) &&
      now - new Date(r.last_in_at).getTime() > minutes * 60 * 1000;

    const failed = r.last_send_failed === true;

    // Only surface threads that actually need an operator
    return (!r.opted_out) && (awaiting || failed);
  });

  return NextResponse.json({ rows: rows.slice(0, limit), took_ms: Date.now() - t0 });
}
