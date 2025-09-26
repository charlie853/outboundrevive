// app/api/threads/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const leadId = params.id;
  if (!leadId) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  // Outbound (your sent messages)
  const { data: outs, error: oErr } = await supabase
    .from('messages')
    .select('created_at, body, sid:message_sid, status')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });

  // Inbound (their replies)
  const { data: ins, error: iErr } = await supabase
    .from('replies')
    .select('created_at, body, message_sid, intent')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });

  if (oErr || iErr) {
    return NextResponse.json({ error: oErr?.message || iErr?.message || 'DB error' }, { status: 500 });
  }

  const items = [
    ...(outs || []).map((m) => ({
      dir: 'out' as const,
      at: m.created_at,
      body: m.body,
      sid: m.sid,
      status: m.status,
    })),
    ...(ins || []).map((r) => ({
      dir: 'in' as const,
      at: r.created_at,
      body: r.body,
      sid: r.message_sid,
      intent: r.intent,
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return NextResponse.json({ items });
}