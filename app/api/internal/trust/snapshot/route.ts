// app/api/internal/trust/snapshot/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const DEFAULT_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

export async function GET(req: NextRequest) {
  // admin guard
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get('account_id') || DEFAULT_ACCOUNT_ID;

  // read settings
  const { data: cfg, error: cfgErr } = await db
    .from('app_settings')
    .select('auto_throttle,error_threshold,error_window_min')
    .eq('id','default')
    .maybeSingle();
  if (cfgErr) return NextResponse.json({ error: 'settings_read_failed' }, { status: 500 });

  const windowMin = Number(cfg?.error_window_min ?? 15);
  const threshold = Number(cfg?.error_threshold ?? 5);
  const since = new Date(Date.now() - windowMin * 60 * 1000).toISOString();

  // failures by code in window
  const { data, error } = await db
    .from('messages_out')
    .select('provider_error_code')
    .eq('account_id', account_id)
    .eq('provider_status', 'failed')
    .gte('created_at', since);
  if (error) return NextResponse.json({ error: 'query_failed' }, { status: 500 });

  const byCode: Record<string, number> = {};
  for (const r of (data || [])) {
    const code = r.provider_error_code || 'unknown';
    byCode[code] = (byCode[code] || 0) + 1;
  }
  const totalFailed = (data || []).length;
  const shouldThrottle = totalFailed >= threshold;

  // flip flag if needed
  let auto_throttle = !!cfg?.auto_throttle;
  let changed = false;
  if (auto_throttle !== shouldThrottle) {
    const { error: updErr } = await db
      .from('app_settings')
      .update({ auto_throttle: shouldThrottle })
      .eq('id','default');
    if (!updErr) { auto_throttle = shouldThrottle; changed = true; }
  }

  return NextResponse.json({
    account_id,
    since,
    window_min: windowMin,
    total_failed: totalFailed,
    by_code: byCode,
    threshold,
    auto_throttle,
    changed
  });
  
}
