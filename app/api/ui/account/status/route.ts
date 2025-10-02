import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function supabaseUserClientFromReq() {
  const c = await cookies();
  const h = await headers();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { get: (n: string) => c.get(n)?.value },
      global: { headers: { Authorization: h.get('authorization') ?? '' } }
    }
  );
}

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getAccountIdForUser(service: any, userId: string) {
  const { data } = await service
    .from('user_accounts')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.account_id as string | undefined;
}

export async function GET() {
  const supa = await supabaseUserClientFromReq();
  const { data: ures } = await supa.auth.getUser();
  if (!ures?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = svc();
  const accountId = await getAccountIdForUser(service, ures.user.id);
  if (!accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data } = await service
    .from('accounts')
    .select('outbound_paused')
    .eq('id', accountId)
    .maybeSingle();
  return NextResponse.json({ outbound_paused: !!data?.outbound_paused });
}

export async function PUT(req: NextRequest) {
  const supa = await supabaseUserClientFromReq();
  const { data: ures } = await supa.auth.getUser();
  if (!ures?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const service = svc();
  const accountId = await getAccountIdForUser(service, ures.user.id);
  if (!accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const desired = !!body.outbound_paused;

  const { data, error } = await service
    .from('accounts')
    .update({ outbound_paused: desired })
    .eq('id', accountId)
    .select('outbound_paused')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'update_failed', detail: error.message }, { status: 500 });
  return NextResponse.json({ outbound_paused: !!data?.outbound_paused });
}
