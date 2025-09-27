// app/api/internal/consent/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const DEFAULT_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  // admin guard
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get('account_id') || ''; // blank = all
  const fromISO = searchParams.get('from') || '1970-01-01';
  const toISO   = searchParams.get('to')   || new Date().toISOString();

  // Build a simple buffered CSV (fine for tens of thousands of rows).
  // If you expect millions, we can switch to true streaming with a ReadableStream.
  const header = [
    'event_type',          // sms_marketing_granted | revoked | help | start | stop etc.
    'phone',
    'source',              // inbound_sms | crm | import | ui | …
    'account_id',
    'created_at'
  ].join(',') + '\n';

  const rows: string[] = [header];

  // page through results to avoid single huge payloads
  const pageSize = 5000;
  let from = 0;
  while (true) {
    let q = db
      .from('consent_events')
      .select('type,phone,source,account_id,created_at', { count: 'exact' })
      .gte('created_at', fromISO)
      .lte('created_at', toISO)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (account_id) q = q.eq('account_id', account_id);

    const { data, error } = await q;
    if (error) {
      console.error('[consent/export] query error', error);
      return NextResponse.json({ error: 'query_failed' }, { status: 500 });
    }

    for (const r of (data || [])) {
      rows.push([
        csvEscape(r.type),
        csvEscape(r.phone),
        csvEscape(r.source || ''),
        csvEscape(r.account_id || DEFAULT_ACCOUNT_ID),
        csvEscape(r.created_at)
      ].join(',') + '\n');
    }

    if (!data || data.length < pageSize) break; // done
    from += pageSize;
  }

  const body = rows.join('');
  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="consent_${account_id || 'all'}_${fromISO}_${toISO}.csv"`
    }
  });
}