import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const lead_id = searchParams.get('lead_id');
  const limit   = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

  if (!lead_id) return NextResponse.json({ error: 'missing_lead_id' }, { status: 400 });

  const [{ data: inbound,  error: e1 }, { data: outbound, error: e2 }] = await Promise.all([
    supabaseAdmin
      .from('messages_in')
      .select('created_at, body, provider_from, provider_to, provider_sid')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from('messages_out')
      .select('created_at, body, provider_status, sid')
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  if (e1 || e2) return NextResponse.json({ error: 'query_failed', details: e1?.message || e2?.message }, { status: 500 });

  // Merge and sort descending by created_at
  const merged = [
    ...(inbound  || []).map((m: any) => ({ dir: 'in',  ...m })),
    ...(outbound || []).map((m: any) => ({ dir: 'out', ...m })),
  ].sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);

  return NextResponse.json({ lead_id, messages: merged, took_ms: Date.now() - t0 });
}