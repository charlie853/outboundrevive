import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function sinceDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export async function GET(_req: NextRequest) {
  try {
    const since = sinceDays(7);

    // Sent in last 7 days
    const sent = await db
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', since);

    // Any reply in last 7 days
    const replies = await db
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('last_reply_at', since);

    // Booked/Kept flags (using last_reply_at as the activity timestamp)
    const booked = await db
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('booked', true)
      .gte('last_reply_at', since);

    const kept = await db
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('kept', true)
      .gte('last_reply_at', since);

    return NextResponse.json({
      since,
      sent: sent.count ?? 0,
      replies: replies.count ?? 0,
      booked: booked.count ?? 0,
      kept: kept.count ?? 0
    });
  } catch (e: any) {
    console.error('[METRICS] last7d error:', e?.message || e);
    return NextResponse.json({ error: 'metrics error' }, { status: 500 });
  }
}