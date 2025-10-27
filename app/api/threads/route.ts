import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

const BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BASE || !KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const headers: Record<string, string> = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  Accept: 'application/json',
  Prefer: 'count=exact',
};

async function pgrest(path: string, signal?: AbortSignal) {
  const url = `${BASE}/rest/v1/${path}`;
  const res = await fetch(url, { headers, signal, cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`REST ${res.status}: ${text}`);
  }
  return res.json().catch(() => ([]));
}

function withTimeout<T>(promise: Promise<T>, ms = 5000, label = 'op'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_TIMEOUT_${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

const clampLimit = (value: string | null) => {
  const n = Number(value ?? '20');
  if (!Number.isFinite(n) || n <= 0) return 20;
  return Math.min(Math.max(Math.floor(n), 1), 50);
};

const formatPhone = (phone: string | null | undefined) => phone ?? null;

export async function GET(req: Request) {
  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), 10_000);

  try {
    const { searchParams } = new URL(req.url);

    if (searchParams.get('ping') === '1') {
      console.log('THREADS_PING');
      return NextResponse.json({ ok: true, pong: true });
    }

    const limit = clampLimit(searchParams.get('limit'));
    console.log('THREADS_START', { limit });

    const callWithTimeout = async (path: string, label: string) => {
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      controller.signal.addEventListener('abort', onAbort, { once: true });
      try {
        return await withTimeout(pgrest(path, ac.signal), 5000, label);
      } catch (err) {
        ac.abort();
        throw err;
      } finally {
        controller.signal.removeEventListener('abort', onAbort);
      }
    };

    const [inbound, outbound] = await Promise.all([
      callWithTimeout('messages_in?select=lead_id,from_phone,body,created_at&order=created_at.desc&limit=500', 'THREADS_IN'),
      callWithTimeout('messages_out?select=lead_id,to_phone,body,created_at&order=created_at.desc&limit=500', 'THREADS_OUT'),
    ]);

    const threadsMap = new Map<string, { lead_id: string | null; last_message: string; last_at: string }>();

    (outbound as any[]).forEach((row) => {
      const phone = formatPhone(row?.to_phone);
      if (!phone) return;
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, {
          lead_id: row?.lead_id ?? null,
          last_message: row?.body ?? '',
          last_at: row?.created_at ?? new Date().toISOString(),
        });
      }
    });

    (inbound as any[]).forEach((row) => {
      const phone = formatPhone(row?.from_phone);
      if (!phone) return;
      const existing = threadsMap.get(phone);
      if (!existing || new Date(row.created_at) > new Date(existing.last_at)) {
        threadsMap.set(phone, {
          lead_id: row?.lead_id ?? null,
          last_message: row?.body ?? '',
          last_at: row?.created_at ?? new Date().toISOString(),
        });
      }
    });

    const phones = Array.from(threadsMap.keys());
    let leadNames = new Map<string, string | null>();

    if (phones.length) {
      const chunkSize = 100;
      const nameEntries: [string, string | null][] = [];
      for (let i = 0; i < phones.length; i += chunkSize) {
        const slice = phones.slice(i, i + chunkSize).map((p) => encodeURIComponent(p)).join(',');
        const path = `leads?select=phone,name&phone=in.(${slice})`;
        try {
          const rows = await callWithTimeout(path, 'THREADS_LEADS');
          (rows as any[]).forEach((row) => {
            if (row?.phone) nameEntries.push([row.phone, row?.name ?? null]);
          });
        } catch (error) {
          console.error('THREADS_NAME_ERR', error instanceof Error ? error.message : error);
          break;
        }
      }
      leadNames = new Map(nameEntries);
    }

    const threads = Array.from(threadsMap.entries())
      .map(([phone, payload]) => ({
        lead_phone: phone,
        lead_name: leadNames.get(phone) ?? null,
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
    console.error('THREADS_ERR', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'unknown' },
      { headers: { 'cache-control': 'no-store, no-cache, must-revalidate' } },
    );
  } finally {
    clearTimeout(totalTimer);
  }
}
