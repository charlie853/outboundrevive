// app/api/ui/leads/[id]/send/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabaseUserClientFromReq(req: NextRequest) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headers = m ? { Authorization: `Bearer ${m[1]}` } : {} as Record<string, string>;
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

export async function POST(req: NextRequest, { params }: any) {
  try {
    const leadId = (params?.id as string);
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    const { supabase } = supabaseUserClientFromReq(req);
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = userRes.user;
    const accountId = (user.user_metadata as any)?.account_id as string | undefined;
    if (!accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const message = (body?.message || '').toString().trim();
    if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 });

    const db = admin();
    const { data: lead, error: leadErr } = await db
      .from('leads')
      .select('id, account_id')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (lead.account_id !== accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Emergency stop gate
    {
      const { data: acct } = await db.from('accounts').select('outbound_paused').eq('id', accountId).maybeSingle();
      if (acct?.outbound_paused) return NextResponse.json({ error: 'account_paused' }, { status: 423 });
    }

    const { data: inserted, error: insErr } = await db
      .from('messages_out')
      .insert({
        lead_id: leadId,
        body: message,
        sent_by: 'operator',
        operator_id: user.id
      })
      .select('id')
      .single();

    if (insErr) {
      return NextResponse.json({ error: 'DB insert failed', detail: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: inserted!.id });
  } catch (e: any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message }, { status: 500 });
  }
}
