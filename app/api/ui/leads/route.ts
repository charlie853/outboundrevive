// Lists leads for the logged-in user's account
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabaseUserClientFromReq(req: NextRequest) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headers: Record<string, string> = {};
  if (m && m[1]) headers.Authorization = `Bearer ${m[1]}`;
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers }
  });
  return { supabase };
}

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }
  });

export async function GET(req: NextRequest) {
  try {
    const { supabase } = supabaseUserClientFromReq(req);
    const { data: ures, error: uerr } = await supabase.auth.getUser();
    if (uerr || !ures?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const accountId = (ures.user.user_metadata as any)?.account_id as string | undefined;
    if (!accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(+(url.searchParams.get('limit') || 200), 500));

    const db = admin();
    const { data, error } = await db
      .from('leads')
      .select('id,name,phone,status,created_at,replied,intent,opted_out,delivery_status,error_code,last_message_sid,appointment_set_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
    return NextResponse.json({ data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message }, { status: 500 });
  }
}
