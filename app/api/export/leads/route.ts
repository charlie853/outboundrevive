// app/api/export/leads/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';

export const runtime = 'nodejs';

function toCsv(rows: any[]) {
  if (!rows.length) return 'id,name,phone,status,replied,intent,created_at\n';
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => esc(r[h])).join(',')),
  ];
  return lines.join('\n');
}

export async function GET(req: NextRequest) {
  // Check authentication and get account ID
  const accountId = await requireAccountAccess();
  if (!accountId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id,name,phone,status,replied,intent,created_at,sent_at,delivery_status,last_reply_at,opted_out,email,booked,kept')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const csv = toCsv(data || []);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-export.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
