import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Inbound = { created_at: string; body: string; message_sid: string | null; intent: string | null };
type Outbound = { created_at: string; body: string; sid: string | null; status: string | null };

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const leadId = params.id;
  if (!leadId) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  try {
    const [{ data: ins, error: inErr }, { data: outs, error: outErr }] = await Promise.all([
      supabase
        .from('replies')
        .select('created_at, body, message_sid, intent')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true }),
      supabase
        .from('messages_out')
        .select('created_at, body, sid, status')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true }),
    ]);

    if (inErr) {
      console.error('[thread] inbound select error', inErr);
      return NextResponse.json({ error: inErr.message }, { status: 500 });
    }
    if (outErr) {
      console.error('[thread] outbound select error', outErr);
      return NextResponse.json({ error: outErr.message }, { status: 500 });
    }

    const inbound = (ins || []).map((r: Inbound) => ({
      dir: 'in' as const,
      at: r.created_at,
      body: r.body,
      sid: r.message_sid,
      intent: r.intent,
    }));

    const outbound = (outs || []).map((m: Outbound) => ({
      dir: 'out' as const,
      at: m.created_at,
      body: m.body,
      sid: m.sid,
      status: m.status,
    }));

    const items = [...inbound, ...outbound].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
    );

    return NextResponse.json({ items });
  } catch (e: any) {
    console.error('[thread] exception', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}