import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Inbound = { created_at: string; body: string; provider_sid: string | null };
type Outbound = { created_at: string; body: string; sid: string | null; status: string | null; intent: string | null };

export async function GET(
  _req: NextRequest,
  { params }: any
) {
  const leadId = params?.id as string;
  if (!leadId) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  try {
    // Fetch messages and lead details in parallel
    const [
      { data: ins, error: inErr },
      { data: outs, error: outErr },
      { data: lead, error: leadErr }
    ] = await Promise.all([
      supabase
        .from('messages_in')
        .select('created_at, body, provider_sid')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true }),
      supabase
        .from('messages_out')
        .select('created_at, body, sid, status, intent')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true }),
      // NEW: Fetch lead enrichment details
      supabase
        .from('leads')
        .select('id, name, phone, email, company, role, lead_type, crm_source, crm_url, status, opted_out, last_inbound_at, last_outbound_at')
        .eq('id', leadId)
        .single(),
    ]);

    if (inErr) {
      console.error('[thread] inbound select error', inErr);
      return NextResponse.json({ error: inErr.message }, { status: 500 });
    }
    if (outErr) {
      console.error('[thread] outbound select error', outErr);
      return NextResponse.json({ error: outErr.message }, { status: 500 });
    }
    if (leadErr) {
      console.error('[thread] lead select error', leadErr);
      return NextResponse.json({ error: leadErr.message }, { status: 500 });
    }

    const inbound = (ins || []).map((r: Inbound) => ({
      dir: 'in' as const,
      at: r.created_at,
      body: r.body,
      sid: r.provider_sid,
      intent: null,
    }));

    const outbound = (outs || []).map((m: Outbound) => ({
      dir: 'out' as const,
      at: m.created_at,
      body: m.body,
      sid: m.sid,
      status: m.status,
      intent: m.intent,
    }));

    // Sort by timestamp, then by direction (in before out) for same-second messages
    const items = [...inbound, ...outbound].sort((a, b) => {
      const aTime = new Date(a.at).getTime();
      const bTime = new Date(b.at).getTime();
      if (aTime !== bTime) return aTime - bTime;
      // Tiebreaker: inbound before outbound
      if (a.dir === 'in' && b.dir === 'out') return -1;
      if (a.dir === 'out' && b.dir === 'in') return 1;
      return 0;
    });

    // NEW: Return both thread items and lead metadata
    return NextResponse.json({ 
      items,
      lead: lead || null,
    });
  } catch (e: any) {
    console.error('[thread] exception', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
