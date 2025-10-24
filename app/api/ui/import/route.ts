// app/api/ui/import/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

async function forwardCsv(csv: string, base: string, token: string) {
  const r = await fetch(`${base}/api/import/csv`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/csv',
      'x-admin-token': token,
    },
    body: csv,
    cache: 'no-store',
  });
  const json = await r.json().catch(() => ({}));
  return NextResponse.json(json, { status: r.status });
}

export async function POST(req: NextRequest) {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  if (!token) return NextResponse.json({ error: 'ADMIN_TOKEN not set' }, { status: 500 });

  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  const ctype = req.headers.get('content-type') || '';

  try {
    // Case A: raw text/csv
    if (ctype.startsWith('text/csv')) {
      const csv = await req.text();
      if (!csv.trim()) return NextResponse.json({ error: 'Empty CSV' }, { status: 400 });
      return forwardCsv(csv, base, token);
    }

    // Case B: multipart form with a file
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      const text = form.get('csv');

      if (file && typeof file === 'object' && 'text' in file) {
        const csv = await (file as File).text();
        if (!csv.trim()) return NextResponse.json({ error: 'Empty file' }, { status: 400 });
        return forwardCsv(csv, base, token);
      }

      if (typeof text === 'string' && text.trim()) {
        return forwardCsv(text, base, token);
      }

      return NextResponse.json({ error: 'Provide a file field named "file" or a "csv" text field' }, { status: 400 });
    }

    // Case C: JSON with { csv: "..." } (handy for dev)
    if (ctype.startsWith('application/json')) {
      const body = await req.json().catch(() => ({}));
      const csv = String(body?.csv || '');
      if (!csv.trim()) return NextResponse.json({ error: 'Missing csv' }, { status: 400 });
      return forwardCsv(csv, base, token);
    }

    return NextResponse.json({ error: 'Unsupported Content-Type' }, { status: 415 });
  } catch (e: any) {
    console.error('[ui/import] error', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
