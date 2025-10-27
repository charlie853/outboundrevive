import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { phone: string } }) {
  try {
    const rawPhone = params.phone ? decodeURIComponent(params.phone) : '';
    if (!rawPhone) {
      return NextResponse.json({ ok: false, error: 'missing_phone' }, { status: 400 });
    }

    const accountId = await requireAccountAccess();
    if (!accountId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const [outs, ins] = await Promise.all([
      db
        .from('messages_out')
        .select('created_at, body')
        .eq('account_id', accountId)
        .eq('to_phone', rawPhone)
        .order('created_at', { ascending: true })
        .limit(5000),
      db
        .from('messages_in')
        .select('created_at, body')
        .eq('account_id', accountId)
        .eq('from_phone', rawPhone)
        .order('created_at', { ascending: true })
        .limit(5000),
    ]);

    if (outs.error || ins.error) {
      console.error('[threads:detail] query error', outs.error, ins.error);
      return NextResponse.json({ ok: false, error: 'threads_failed' }, { status: 500 });
    }

    const messages = [
      ...(outs.data ?? []).map((row) => ({ direction: 'out' as const, body: row.body ?? '', created_at: row.created_at })),
      ...(ins.data ?? []).map((row) => ({ direction: 'in' as const, body: row.body ?? '', created_at: row.created_at })),
    ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return NextResponse.json({ ok: true, messages }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[threads:detail] unexpected error', error);
    return NextResponse.json({ ok: false, error: 'threads_failed' }, { status: 500 });
  }
}
