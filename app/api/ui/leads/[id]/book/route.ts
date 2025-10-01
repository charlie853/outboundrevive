// app/api/ui/leads/[id]/book/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function supabaseUserClientFromReq(req: NextRequest) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!;
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headers = m ? { Authorization: `Bearer ${m[1]}` } : {};
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers }
  });
  return { supabase, token: m?.[1] || null };
}

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }
  });

export async function POST(req: NextRequest, { params }: any) {
  try {
    const leadId = params?.id as string;
    if (!leadId) return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });

    const { supabase } = supabaseUserClientFromReq(req);
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = userRes.user;
    const accountId = (user.user_metadata as any)?.account_id as string | undefined;
    if (!accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const bookedRaw = (body?.bookedAt || body?.booked_at || body?.starts_at || body?.startsAt || '').toString().trim();
    if (!bookedRaw) return NextResponse.json({ error: 'bookedAt required' }, { status: 400 });
    const bookedAt = new Date(bookedRaw);
    if (isNaN(bookedAt.getTime())) return NextResponse.json({ error: 'invalid bookedAt' }, { status: 400 });

    const db = admin();

    // Ensure lead belongs to this account
    const { data: lead, error: leadErr } = await db
      .from('leads')
      .select('id, account_id')
      .eq('id', leadId)
      .single();
    if (leadErr || !lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (lead.account_id !== accountId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Insert appointment
    const { data: appt, error: apptErr } = await db
      .from('appointments')
      .insert({
        account_id: accountId,
        lead_id: leadId,
        booked_at: bookedAt.toISOString(),
        notes: body?.notes || null
      })
      .select('id, lead_id, booked_at')
      .single();
    if (apptErr) return NextResponse.json({ error: 'DB insert failed', detail: apptErr.message }, { status: 500 });

    // Stamp the lead
    const { data: stamped, error: updErr } = await db
      .from('leads')
      .update({ appointment_set_at: bookedAt.toISOString(), booked: true })
      .eq('id', leadId)
      .eq('account_id', accountId)
      .select('id, appointment_set_at')
      .single();
    if (updErr) return NextResponse.json({ error: 'Lead update failed', detail: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, appointment: appt, lead: stamped });
  } catch (e: any) {
    return NextResponse.json({ error: 'unexpected', detail: e?.message }, { status: 500 });
  }
}
