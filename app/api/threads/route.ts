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

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string) =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), ms)),
  ]);

const formatPhone = (phone: string | null | undefined) => (phone ? phone : null);

export async function GET(req: Request) {
  const controller = new AbortController();
  const totalTimeout = setTimeout(() => controller.abort(), 10_000);

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: 'missing Supabase env' },
        { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
      );
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false },
        global: {
          fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
        },
      },
    );

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
      withTimeout(
        supabase
          .from('messages_out')
          .select('created_at, body, to_phone')
          .gte('created_at', fromIso)
          .lt('created_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(5000),
        9_000,
        'messages_out',
      ),
      withTimeout(
        supabase
          .from('messages_in')
          .select('created_at, body, from_phone')
          .gte('created_at', fromIso)
          .lt('created_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(5000),
        9_000,
        'messages_in',
      ),
    ]);

    if (outboundRes.error) throw outboundRes.error;
    if (inboundRes.error) throw inboundRes.error;

    const threadsMap = new Map<string, { last_message: string; last_at: string }>();

    (outboundRes.data ?? []).forEach((row) => {
      const phone = formatPhone(row.to_phone);
      if (!phone) return;
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, { last_message: row.body ?? '', last_at: row.created_at });
      }
    });

    (inboundRes.data ?? []).forEach((row) => {
      const phone = formatPhone(row.from_phone);
      if (!phone) return;
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, { last_message: row.body ?? '', last_at: row.created_at });
      }
    });

    const phones = Array.from(threadsMap.keys());
    let nameMap = new Map<string, string | null>();
    if (phones.length) {
      const { data: leadRows, error: leadError } = await withTimeout(
        supabase
          .from('leads')
          .select('phone, name')
          .in('phone', phones),
        9_000,
        'leads',
      );
      if (leadError) throw leadError;
      nameMap = new Map((leadRows ?? []).map((row) => [row.phone, row.name ?? null]));
    }

    const threads = Array.from(threadsMap.entries())
      .map(([phone, payload]) => ({
        lead_phone: phone,
        lead_name: nameMap.get(phone) ?? null,
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
      { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } finally {
    clearTimeout(totalTimeout);
  }
}
