import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedVerticals = new Set(['general', 'auto', 'aesthetics_wellness', 'home_services', 'retail', 'other']);

function normalizeVertical(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const slug = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (allowedVerticals.has(slug)) return slug;
  return undefined;
}

function supabaseUserClientFromReq(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headers: Record<string, string> = {};
  if (m && m[1]) headers.Authorization = `Bearer ${m[1]}`;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers },
  });
}

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

async function resolveAccountId(req: NextRequest) {
  const supabase = supabaseUserClientFromReq(req);
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const accountId = (u.user.user_metadata as any)?.account_id as string | undefined;
  if (!accountId) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { accountId };
}

export async function GET(req: NextRequest) {
  const resolved = await resolveAccountId(req);
  if ('error' in resolved) return resolved.error;
  const { accountId } = resolved;
  const db = admin();

  const [stateRes, accountRes] = await Promise.all([
    db.from('onboarding_state').select('*').eq('account_id', accountId).maybeSingle(),
    db.from('accounts').select('vertical').eq('id', accountId).maybeSingle(),
  ]);

  if (stateRes.error) return NextResponse.json({ error: stateRes.error.message }, { status: 500 });
  if (accountRes.error) return NextResponse.json({ error: accountRes.error.message }, { status: 500 });

  const payload = stateRes.data || { account_id: accountId, step: 'welcome' };
  return NextResponse.json({
    ...payload,
    vertical: accountRes.data?.vertical || 'general',
  });
}

export async function PUT(req: NextRequest) {
  const resolved = await resolveAccountId(req);
  if ('error' in resolved) return resolved.error;
  const { accountId } = resolved;

  const body = await req.json().catch(() => ({}));
  const patch: any = { account_id: accountId, updated_at: new Date().toISOString() };
  const keys = ['step', 'business_name', 'website', 'timezone', 'twilio_connected', 'kb_ingested', 'crm_connected'];
  for (const k of keys) if (k in body) patch[k] = body[k];

  const desiredVertical = normalizeVertical(body.vertical);
  const db = admin();

  const [stateRes, accountRes] = await Promise.all([
    db.from('onboarding_state').upsert(patch, { onConflict: 'account_id' }).select('*').single(),
    desiredVertical
      ? db
          .from('accounts')
          .update({ vertical: desiredVertical })
          .eq('id', accountId)
          .select('vertical')
          .single()
      : db.from('accounts').select('vertical').eq('id', accountId).maybeSingle(),
  ]);

  if (stateRes.error) return NextResponse.json({ error: stateRes.error.message }, { status: 500 });
  if (accountRes.error) return NextResponse.json({ error: accountRes.error.message }, { status: 500 });

  return NextResponse.json({
    ...stateRes.data,
    vertical: accountRes.data?.vertical || 'general',
  });
}

