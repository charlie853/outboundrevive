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

    const { account_id, lead_id, body, run_after, dedup_key } = await req.json().catch(() => ({}));
    if (!account_id || !lead_id || !body) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

    // optional dedup: if a queued item with same dedup_key exists in future window, skip
    if (dedup_key) {
      const { data: exists } = await supabaseAdmin
        .from('send_queue')
        .select('id')
        .eq('account_id', account_id)
        .eq('lead_id', lead_id)
        .eq('status', 'queued')
        .eq('dedup_key', dedup_key)
        .limit(1);
      if (exists && exists.length) return NextResponse.json({ ok: true, deduped: true, id: exists[0].id });
    }

    const { data, error } = await supabaseAdmin
      .from('send_queue')
      .insert({ account_id, lead_id, body, run_after: run_after || new Date().toISOString(), dedup_key: dedup_key || null })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: 'DB error', detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}


