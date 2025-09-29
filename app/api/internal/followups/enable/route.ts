import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession:false } });

function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const account_id: string = body.account_id || body.accountId;
    const lead_id: string = body.lead_id || body.leadId;
    const operator_id: string | null = body.operator_id || body.operatorId || null;
    const cadence: number[] | null = Array.isArray(body.cadence) ? body.cadence : null; // e.g. [2,5,10]
    const start_in_hours = Number(body.start_in_hours ?? 24); // schedule first follow-up in 24h by default

    if (!account_id || !lead_id) return NextResponse.json({ error: 'missing_params', need: ['account_id','lead_id'] }, { status: 400 });

    const next_at = new Date(Date.now() + start_in_hours*3600*1000).toISOString();

    const { data, error } = await db.from('ai_followup_cursor').upsert({
      account_id, lead_id, operator_id,
      status: 'active',
      attempt: 0,
      cadence: cadence ?? undefined,
      next_at
    }, { onConflict: 'lead_id' }).select('lead_id,next_at,status,attempt').single();

    if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, cursor: data });
  } catch (e:any) {
    return NextResponse.json({ error: 'enable_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}