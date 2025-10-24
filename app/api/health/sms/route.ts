import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function GET() {
  const since = new Date(Date.now() - 15*60*1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('messages_out')
    .select('status,error_code,created_at')
    .gte('created_at', since);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const total = data?.length || 0;
  const bad   = (data || []).filter(d => (d.status === 'undelivered' || d.status === 'failed') || !!d.error_code).length;
  const rate  = total ? (bad / total) : 0;

  return NextResponse.json({
    window_minutes: 15,
    total, bad, error_rate: rate,
    throttled: rate >= 0.1 // 10% threshold for now
  });
}
