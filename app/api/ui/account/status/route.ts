import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedVerticals = new Set(['general', 'auto', 'aesthetics_wellness', 'home_services', 'retail', 'other']);

function normalizeVertical(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const slug = value.trim().toLowerCase().replace(/\s+/g, '_');
  if (allowedVerticals.has(slug)) return slug;
  return undefined;
}

// Use the same pattern as /api/ui/leads - read Authorization from request headers
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

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getAccountIdForUser(service: any, userId: string) {
  const { data } = await service
    .from('user_data')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.account_id as string | undefined;
}

export async function GET(req: NextRequest) {
  const service = svc();
  const { supabase } = supabaseUserClientFromReq(req);
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  // Try user_metadata first (like /api/ui/leads does), then fall back to user_data table
  let accountId = (ures.user.user_metadata as any)?.account_id as string | undefined;
  if (!accountId) {
    accountId = await getAccountIdForUser(service, ures.user.id);
  }
  if (!accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await service
    .from('accounts')
    .select('outbound_paused, caps_enabled, cadences_enabled, new_charts_enabled, vertical')
    .eq('id', accountId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ 
    account_id: accountId,
    outbound_paused: !!data?.outbound_paused,
    caps_enabled: !!(data as any)?.caps_enabled,
    cadences_enabled: !!(data as any)?.cadences_enabled,
    new_charts_enabled: !!(data as any)?.new_charts_enabled,
    vertical: data?.vertical || 'general',
  });
}

export async function PUT(req: NextRequest) {
  const service = svc();
  const { supabase } = supabaseUserClientFromReq(req);
  const { data: ures, error: uerr } = await supabase.auth.getUser();
  if (uerr || !ures?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  // Try user_metadata first, then fall back to user_data table
  let accountId = (ures.user.user_metadata as any)?.account_id as string | undefined;
  if (!accountId) {
    accountId = await getAccountIdForUser(service, ures.user.id);
  }
  if (!accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, any> = {};

  if (body.hasOwnProperty('outbound_paused')) update.outbound_paused = !!body.outbound_paused;
  const desiredVertical = normalizeVertical(body.vertical);
  if (desiredVertical) update.vertical = desiredVertical;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no_changes' }, { status: 400 });
  }

  const { data, error } = await service
    .from('accounts')
    .update(update)
    .eq('id', accountId)
    .select('outbound_paused, vertical')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ 
    outbound_paused: !!data?.outbound_paused,
    vertical: data?.vertical || 'general',
  });
}
