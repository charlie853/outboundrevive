import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

const WINDOWS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

const clampRange = (value: string | null) => {
  const normalized = (value ?? '').toLowerCase();
  if (normalized === '24h') return '24h';
  if (normalized === '30d') return '30d';
  return '7d';
};

export async function GET(req: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json(
        { ok: false, error: 'missing Supabase env' },
        { status: 500, headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
      );
    }

    const supabase = createClient(url, key, {
      auth: { persistSession: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
      },
    });

    const { searchParams } = new URL(req.url);
    if (searchParams.get('ping') === '1') {
      console.log('THREADS_PING');
      return NextResponse.json({ ok: true, pong: true });
    }

    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '10', 10), 1), 50);
    const rangeKey = clampRange(searchParams.get('range'));
    const windowMs = WINDOWS[rangeKey];

    const now = new Date();
    const from = new Date(now.getTime() - windowMs);

    const nowIso = now.toISOString();
    const fromIso = from.toISOString();

    console.log('THREADS_START', { limit, range: rangeKey });

    const [outboundRes, inboundRes] = await Promise.all([
      supabase
        .from('messages_out')
        .select('created_at, body, to_phone')
        .gte('created_at', fromIso)
        .lt('created_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('messages_in')
        .select('created_at, body, from_phone')
        .gte('created_at', fromIso)
        .lt('created_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (outboundRes.error) throw outboundRes.error;
    if (inboundRes.error) throw inboundRes.error;

    const threadsMap = new Map<string, { last_message: string; last_at: string }>();

    (outboundRes.data ?? []).forEach((row) => {
      const phone = row.to_phone;
      if (!phone) return;
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, {
          last_message: row.body ?? '',
          last_at: row.created_at,
        });
      }
    });

    (inboundRes.data ?? []).forEach((row) => {
      const phone = row.from_phone;
      if (!phone) return;
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, {
          last_message: row.body ?? '',
          last_at: row.created_at,
        });
      }
    });

    const phones = Array.from(threadsMap.keys());
    let leadMap = new Map<string, string | null>();
    if (phones.length) {
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads')
        .select('phone, name')
        .in('phone', phones);
      if (leadsError) throw leadsError;
      leadMap = new Map((leadsData ?? []).map((row) => [row.phone, row.name ?? null]));
    }

    const threads = Array.from(threadsMap.entries())
      .map(([phone, payload]) => ({
        lead_phone: phone,
        lead_name: leadMap.get(phone) ?? null,
        last_message: payload.last_message,
        last_at: payload.last_at,
      }))
      .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
      .slice(0, limit);

    console.log('THREADS_DONE', { count: threads.length });

    return NextResponse.json(
      { ok: true, threads },
      { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    console.error('THREADS_ERR', error);
    const message = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
