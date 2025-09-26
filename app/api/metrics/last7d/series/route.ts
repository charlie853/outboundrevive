import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export async function GET() {
  try {
    // 7 days back (inclusive)
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    // Sent = leads with sent_at since
    const { count: sentCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', since);

    // Replies = leads with last_reply_at since
    const { count: repliesCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('last_reply_at', since);

    // Booked / Kept flags flipped since (rough approximation via updated rows)
    // If you want exact toggles by time, track a separate appointments table w/ timestamps.
    const { count: bookedCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('booked', true);

    const { count: keptCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('kept', true);

    return NextResponse.json({
      since,
      sent: sentCount ?? 0,
      replies: repliesCount ?? 0,
      booked: bookedCount ?? 0,
      kept: keptCount ?? 0
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}