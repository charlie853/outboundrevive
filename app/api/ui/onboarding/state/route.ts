import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabaseUserClientFromReq(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headers: Record<string, string> = {};
  if (m && m[1]) headers.Authorization = `Bearer ${m[1]}`;
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers } });
}
const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession:false } });

export async function GET(req: NextRequest) {
  const supabase = supabaseUserClientFromReq(req);
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const accountId = (u.user.user_metadata as any)?.account_id as string | undefined;
  if (!accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const db = admin();
  const { data } = await db
    .from('onboarding_state')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();
  return NextResponse.json(data || { account_id: accountId, step: 'welcome' });
}

export async function PUT(req: NextRequest) {
  const supabase = supabaseUserClientFromReq(req);
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const accountId = (u.user.user_metadata as any)?.account_id as string | undefined;
  if (!accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const patch: any = { account_id: accountId, updated_at: new Date().toISOString() };
  const keys = ['step','business_name','website','timezone','twilio_connected','kb_ingested','crm_connected'];
  for (const k of keys) if (k in body) patch[k] = body[k];

  const db = admin();
  const { data, error } = await db
    .from('onboarding_state')
    .upsert(patch, { onConflict: 'account_id' })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
