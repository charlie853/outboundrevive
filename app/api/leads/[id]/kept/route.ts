import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function requireAdmin(req: NextRequest) {
  const token = req.headers.get('x-admin-token') || '';
  return !!token && token === (process.env.ADMIN_TOKEN || '');
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!requireAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const leadId = params.id;
    const body = await req.json().catch(() => ({}));
    const kept = typeof body.kept === 'boolean' ? body.kept : true;

    const { data, error } = await supabase
      .from('leads')
      .update({ kept })
      .eq('id', leadId)
      .select('id, booked, kept')
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}