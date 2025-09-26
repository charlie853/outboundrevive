import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// simple US-centric normalizer (same as you used before)
function toE164Loose(raw?: string | null) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\+\d{8,15}$/.test(s)) return s;
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const rec: any = {};
    header.forEach((h, idx) => { rec[h] = (cols[idx] ?? '').trim(); });
    rows.push(rec);
  }
  return rows;
}

export async function POST(req: NextRequest) {
  // Admin-only (middleware also enforces x-admin-token)
  const token = req.headers.get('x-admin-token') || '';
  if (!token || token !== (process.env.ADMIN_TOKEN || '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let csvText = '';

    const ctype = req.headers.get('content-type') || '';
    if (ctype.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'file part required' }, { status: 400 });
      }
      csvText = await (file as Blob).text();
    } else {
      // assume text/csv
      csvText = await req.text();
    }

    if (!csvText || csvText.trim() === '') {
      return NextResponse.json({ error: 'empty CSV' }, { status: 400 });
    }

    const parsed = parseCsv(csvText);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json({ error: 'no rows found' }, { status: 400 });
    }

    const cleaned = parsed.map((r) => {
      const name = (r.name || `${r.first_name || ''} ${r.last_name || ''}`).trim();
      const phone = toE164Loose(r.phone);
      const email = (r.email || '').toString().trim() || null;
      return phone ? { name: name || null, phone, email, status: 'pending' as const } : null;
    }).filter(Boolean) as Array<{ name: string | null; phone: string; email: string | null; status: 'pending' }>;

    if (cleaned.length === 0) {
      return NextResponse.json({ error: 'no valid phone numbers after parsing' }, { status: 400 });
    }

    const { data, error } = await db
      .from('leads')
      .upsert(cleaned, { onConflict: 'phone' })
      .select();

    if (error) {
      console.error('[import/csv] upsert error', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      rows_in: parsed.length,
      rows_valid: cleaned.length,
      inserted_or_updated: data?.length ?? 0,
      sample: data?.slice(0, 5) ?? []
    });
  } catch (e: any) {
    console.error('[import/csv] error', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}