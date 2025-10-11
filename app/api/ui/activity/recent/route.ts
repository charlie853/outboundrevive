import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function userClient() {
  const c = await cookies();
  const h = await headers();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n: string) => c.get(n)?.value }, global: { headers: { Authorization: h.get('authorization') ?? '' } } }
  );
}
function svc() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!); }

export async function GET(req: Request) {
  try {
    const supa = await userClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(req.url);
    const hours = Math.max(1, Math.min(720, Number(url.searchParams.get('hours') || '48')));
    const dir = (url.searchParams.get('dir') || 'all').toLowerCase();
    const cutoffIso = new Date(Date.now() - hours * 3600_000).toISOString();

    const db = svc();
    const { data: ua } = await db.from('user_data').select('account_id').eq('user_id', user.id).single();
    const accountId = ua?.account_id;
    if (!accountId) return NextResponse.json({ items: [] });

    const { data: leads } = await db.from('leads').select('id').eq('account_id', accountId);
    const leadIds = (leads || []).map((l: any) => l.id);
    if (!leadIds.length) return NextResponse.json({ items: [] });

    const inQ = dir !== 'out' ? db
      .from('messages_in')
      .select('id, lead_id, body, created_at')
      .in('lead_id', leadIds)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false }) : null;

    const outQ = dir !== 'in' ? db
      .from('messages_out')
      .select('id, lead_id, body, created_at, sent_at')
      .in('lead_id', leadIds)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false }) : null;

    const [inRes, outRes] = await Promise.all([inQ?.then(r=>r) ?? { data: [] }, outQ?.then(r=>r) ?? { data: [] }]);
    const ins = (inRes.data || []).map((m: any) => ({ id: m.id, dir: 'in', at: m.created_at, body: m.body, lead_id: m.lead_id }));
    const outs = (outRes.data || []).map((m: any) => ({ id: m.id, dir: 'out', at: m.sent_at || m.created_at, body: m.body, lead_id: m.lead_id }));
    const items = [...ins, ...outs].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message }, { status: 500 });
  }
}
