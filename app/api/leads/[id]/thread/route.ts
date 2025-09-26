import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  // admin guard
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = ctx.params.id;

  // outbounds
  const { data: outs, error: e1 } = await supabase
    .from('outbound_messages')
    .select('sid,body,status,created_at')
    .eq('lead_id', id);

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  // inbound replies
  const { data: ins, error: e2 } = await supabase
    .from('replies')
    .select('message_sid,body,intent,created_at')
    .eq('lead_id', id);

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const items = [
    ...(outs || []).map(o => ({
      dir: 'out' as const,
      at: o.created_at,
      body: o.body,
      sid: o.sid,
      status: o.status
    })),
    ...(ins || []).map(r => ({
      dir: 'in' as const,
      at: r.created_at,
      body: r.body,
      sid: r.message_sid || null,
      intent: r.intent || null
    }))
  ].sort((a, b) => new Date(a.at as any).getTime() - new Date(b.at as any).getTime());

  return NextResponse.json({ items });
}