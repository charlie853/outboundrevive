import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type WindowKey = '24h' | '7d' | '30d';

const WINDOW_MS: Record<WindowKey, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const VALID_WINDOWS = new Set<WindowKey>(['24h', '7d', '30d']);

function resolveWindow(value: string | null): WindowKey {
  const lower = (value ?? '').toLowerCase() as WindowKey;
  return VALID_WINDOWS.has(lower) ? lower : '7d';
}

function dayKey(iso: string) {
  return new Date(iso).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || '50'), 1), 200);
    const windowKey = resolveWindow(url.searchParams.get('window'));

    const accountId = await requireAccountAccess();
    if (!accountId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const endIso = now.toISOString();
    const startIso = new Date(now.getTime() - WINDOW_MS[windowKey]).toISOString();

    const [outs, ins] = await Promise.all([
      db
        .from('messages_out')
        .select('created_at, body, to_phone')
        .eq('account_id', accountId)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(1000),
      db
        .from('messages_in')
        .select('created_at, body, from_phone')
        .eq('account_id', accountId)
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (outs.error || ins.error) {
      console.error('[threads] query error', outs.error, ins.error);
      return NextResponse.json({ ok: false, error: 'threads_failed' }, { status: 500 });
    }

    const threadsMap = new Map<
      string,
      { lead_phone: string; last_message: string; last_at: string; direction: 'in' | 'out' }
    >();

    const phoneSet = new Set<string>();

    (outs.data ?? []).forEach((row) => {
      const phone = row.to_phone;
      if (!phone) return;
      phoneSet.add(phone);
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, {
          lead_phone: phone,
          last_message: row.body ?? '',
          last_at: row.created_at,
          direction: 'out',
        });
      }
    });

    (ins.data ?? []).forEach((row) => {
      const phone = row.from_phone;
      if (!phone) return;
      phoneSet.add(phone);
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, {
          lead_phone: phone,
          last_message: row.body ?? '',
          last_at: row.created_at,
          direction: 'in',
        });
      }
    });

    const phones = Array.from(phoneSet).slice(0, 500);
    let leadMap = new Map<string, string | null>();
    if (phones.length > 0) {
      const leadsRes = await db
        .from('leads')
        .select('phone, name')
        .eq('account_id', accountId)
        .in('phone', phones);
      if (leadsRes.error) {
        console.error('[threads] lead lookup error', leadsRes.error);
      } else {
        leadMap = new Map((leadsRes.data ?? []).map((row) => [row.phone, row.name]));
      }
    }

    const threads = Array.from(threadsMap.values())
      .map((thread) => ({
        lead_phone: thread.lead_phone,
        lead_name: leadMap.get(thread.lead_phone) ?? null,
        last_message: thread.last_message,
        last_at: thread.last_at,
      }))
      .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
      .slice(0, limit);

    return NextResponse.json({ ok: true, threads }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    console.error('[threads] unexpected error', error);
    return NextResponse.json({ ok: false, error: 'threads_failed' }, { status: 500 });
  }
}
