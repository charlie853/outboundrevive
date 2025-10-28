import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const t0 = Date.now();
  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get('account_id')?.trim() || '';
  const lead_id = searchParams.get('lead_id')?.trim() || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 500);

  if (!account_id) return NextResponse.json({ error: 'missing_account_id' }, { status: 400 });
  if (!lead_id) return NextResponse.json({ error: 'missing_lead_id' }, { status: 400 });

  const [{ data: outs, error: outErr }, { data: ins, error: inErr }] = await Promise.all([
    supabaseAdmin
      .from('messages_out')
      .select('id, created_at, body, from_phone, to_phone, sent_by, lead_id, provider_status, status, provider_sid')
      .eq('account_id', account_id)
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: true })
      .limit(limit),
    supabaseAdmin
      .from('messages_in')
      .select('id, created_at, body, from_phone, to_phone, lead_id, provider_sid')
      .eq('account_id', account_id)
      .eq('lead_id', lead_id)
      .order('created_at', { ascending: true })
      .limit(limit),
  ]);

  if (outErr || inErr) {
    const detail = outErr?.message || inErr?.message || 'query_failed';
    return NextResponse.json({ error: 'query_failed', details: detail }, { status: 500 });
  }

  const convo = [
    ...((outs ?? []).map((m: any) => ({ ...m, dir: 'out' as const }))),
    ...((ins ?? []).map((m: any) => ({ ...m, dir: 'in' as const }))),
  ]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-limit);

  return NextResponse.json({ account_id, lead_id, messages: convo, took_ms: Date.now() - t0 });
}
