// app/api/ui/followups/prefs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reuse this helper everywhere you accept Bearer tokens from curl / client
function supabaseUserClientFromReq(req: NextRequest) {
  const url = process.env.SUPABASE_URL!;
  const anon = process.env.SUPABASE_ANON_KEY!; // server copy (not NEXT_PUBLIC)
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const headers: Record<string, string> = {};
  if (m && m[1]) headers.Authorization = `Bearer ${m[1]}`;

  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers },
  });

  return { supabase, token: m?.[1] || null };
}

const admin = () =>
  createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

async function getAccountIdFromUser(req: NextRequest) {
  const { supabase } = supabaseUserClientFromReq(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  const meta: any = data.user.user_metadata || {};
  return meta.account_id || null;
}

export async function GET(req: NextRequest) {
  const accountId = await getAccountIdFromUser(req);
  if (!accountId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = admin();
  const { data, error } = await db
    .from('account_followup_prefs')
    .select('*')
    .eq('account_id', accountId)
    .single();

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: 'DB error', detail: error.message }, { status: 500 });
  }

  // If not found, return sensible defaults
  if (!data) {
    return NextResponse.json({
      account_id: accountId,
      freq_max_per_day: 20,
      freq_max_per_week: 100,
      min_gap_minutes: 10,
      quiet_start: '06:00',
      quiet_end: '22:00',
      timezone: 'America/New_York',
      updated_at: null,
    });
  }

  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const accountId = await getAccountIdFromUser(req);
  if (!accountId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const {
    freq_max_per_day,
    freq_max_per_week,
    min_gap_minutes,
    quiet_start,
    quiet_end,
    timezone,
  } = body ?? {};

  // Basic validation
  if (
    [freq_max_per_day, freq_max_per_week, min_gap_minutes, quiet_start, quiet_end, timezone].some(
      (v) => v === undefined
    )
  ) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const db = admin();
  const { data, error } = await db
    .from('account_followup_prefs')
    .upsert(
      {
        account_id: accountId,
        freq_max_per_day,
        freq_max_per_week,
        min_gap_minutes,
        quiet_start,
        quiet_end,
        timezone,
      },
      { onConflict: 'account_id' }
    )
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: 'DB error', detail: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
