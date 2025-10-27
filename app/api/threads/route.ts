import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: Request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    },
  });

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '10', 10), 1), 50);
    const rangeParam = (searchParams.get('range') ?? '7d').toLowerCase();
    const now = new Date();
    const windowMs = rangeParam === '24h' ? 24 * 60 * 60 * 1000 : rangeParam === '30d' ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const start = new Date(now.getTime() - windowMs);

    const nowIso = now.toISOString();
    const startIso = start.toISOString();

    console.log('THREADS_START', { limit, range: rangeParam });

    const [outbound, inbound] = await Promise.all([
      supabase
        .from('messages_out')
        .select('created_at, body, to_phone')
        .gte('created_at', startIso)
        .lt('created_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('messages_in')
        .select('created_at, body, from_phone')
        .gte('created_at', startIso)
        .lt('created_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (outbound.error) throw outbound.error;
    if (inbound.error) throw inbound.error;

    const threadsMap = new Map<string, { lead_phone: string; last_message: string; last_at: string }>();

    (outbound.data ?? []).forEach((row) => {
      const phone = row.to_phone;
      if (!phone) return;
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, {
          lead_phone: phone,
          last_message: row.body ?? '',
          last_at: row.created_at,
        });
      }
    });

    (inbound.data ?? []).forEach((row) => {
      const phone = row.from_phone;
      if (!phone) return;
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, {
          lead_phone: phone,
          last_message: row.body ?? '',
          last_at: row.created_at,
        });
      }
    });

    const phones = Array.from(threadsMap.keys()).slice(0, 200);
    let nameMap = new Map<string, string | null>();
    if (phones.length) {
      const { data: leadRows, error: leadError } = await supabase
        .from('leads')
        .select('phone, name')
        .in('phone', phones);
      if (leadError) throw leadError;
      nameMap = new Map((leadRows ?? []).map((row) => [row.phone, row.name ?? null]));
    }

    const threads = Array.from(threadsMap.values())
      .map((thread) => ({
        lead_phone: thread.lead_phone,
        lead_name: nameMap.get(thread.lead_phone) ?? null,
        last_message: thread.last_message,
        last_at: thread.last_at,
      }))
      .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
      .slice(0, limit);

    console.log('THREADS_DONE', { count: threads.length });

    return NextResponse.json(
      { ok: true, threads },
      { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } catch (error) {
    console.error('[threads] error', error);
    const message = error instanceof Error ? error.message : 'unknown';
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
