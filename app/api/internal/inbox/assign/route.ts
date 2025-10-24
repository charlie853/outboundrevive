import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const adminToken = req.headers.get('x-admin-token') || '';
    if (!process.env.ADMIN_TOKEN || adminToken !== process.env.ADMIN_TOKEN) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const { lead_id, operator_id } = await req.json();
    if (!lead_id || !operator_id) {
      return NextResponse.json({ error: 'missing_params' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('lead_assignments')
      .upsert({ lead_id, operator_id }, { onConflict: 'lead_id' });

    if (error) {
      return NextResponse.json({ error: 'assign_failed', details: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: 'exception', details: String(e) }, { status: 500 });
  }
}
