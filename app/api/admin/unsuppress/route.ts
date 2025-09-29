import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // admin guard
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let { phone, leadId } = body as { phone?: string; leadId?: string };

    if (!phone && leadId) {
      const { data, error } = await supabase
        .from('leads')
        .select('phone')
        .eq('id', leadId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      phone = data?.phone || undefined;
    }

    if (!phone) {
      return NextResponse.json({ error: 'Provide phone or leadId' }, { status: 400 });
    }

    // 1) remove from global_suppressions
    const { error: delErr } = await supabase
      .from('global_suppressions')
      .delete()
      .eq('phone', phone);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    // 2) clear opted_out on lead(s) with this phone
    const { data: updData, error: updErr } = await supabase
      .from('leads')
      .update({ opted_out: false })
      .eq('phone', phone)
      .select('id');

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({
      phone,
      cleared: true,
      leads_updated: updData?.map(r => r.id) ?? []
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}