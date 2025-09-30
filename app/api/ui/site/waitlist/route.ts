import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabaseUserClientFromReq(req: NextRequest) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headers = m ? { Authorization: `Bearer ${m[1]}` } : {} as Record<string,string>;
  return createClient(url, anon, { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false }, global: { headers } });
}
const admin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession:false } });

async function isSiteAdmin(userId: string) {
  try {
    const db = admin();
    const { data: ua } = await db.from('user_accounts').select('role').eq('user_id', userId).in('role', ['owner','admin']).maybeSingle();
    if (ua) return true;
  } catch {}
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = supabaseUserClientFromReq(req);
    const { data: ures } = await supabase.auth.getUser();
    const userId = ures?.user?.id;
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const ok = await isSiteAdmin(userId);
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data, error } = await admin()
      .from('site_waitlist')
      .select('created_at, email, source, utm_source, utm_medium, utm_campaign, referrer')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });
    return NextResponse.json({ items: data || [] });
  } catch (e:any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message }, { status: 500 });
  }
}

