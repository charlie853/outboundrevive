import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get('account_id') || '11111111-1111-1111-1111-111111111111';
  const q          = (searchParams.get('q') || '').trim();
  const limit      = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const offset     = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  let query = supabaseAdmin
    .from('v_threads')
    .select('*')
    .eq('account_id', account_id)
    .order('last_activity_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // !!! - Search will be unreliable if over 500 threads
  // This should do 1- Grab all threads where ilike for name matches, and then 2- grab all threads where ilike phone number matches. 
  // Potential phone numbers should also be processed somehow to make it match the phone schema that would appear in the database
  if (q) {
    // Supabase can't OR across text fields in a view via ilike easily; fetch + filter here for now
    const { data, error } = await supabaseAdmin
      .from('v_threads')
      .select('*')
      .eq('account_id', account_id)
      .order('last_activity_at', { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500 });
    const needle = q.toLowerCase();
    const filtered = (data || []).filter(
      (r: any) =>
        String(r.name || '').toLowerCase().includes(needle) ||
        String(r.phone || '').toLowerCase().includes(needle)
    );
    return NextResponse.json({ rows: filtered.slice(offset, offset + limit), took_ms: Date.now() - t0 });
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'query_failed', details: error.message }, { status: 500 });
  return NextResponse.json({ rows: data || [], took_ms: Date.now() - t0 });
}
