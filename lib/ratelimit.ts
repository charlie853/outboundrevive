import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Derive an identity key: prefers admin token; falls back to IP
function identityFromHeaders(h: Headers) {
  const adm = h.get('x-admin-token') || '';
  if (adm) return 'adm:' + adm.slice(0, 16); // don’t store full token
  const fwd = (h.get('x-forwarded-for') || '').split(',')[0].trim();
  const ip  = fwd || h.get('x-real-ip') || 'unknown';
  return 'ip:' + ip;
}

export async function checkRateLimit(
  headers: Headers,
  bucket: string,
  limit: number,
  windowSec: number
) {
  const who = identityFromHeaders(headers);
  const rlKey = `${bucket}:${who}`;

  const now = Date.now();
  const windowStartMs = Math.floor(now / (windowSec * 1000)) * (windowSec * 1000);
  const windowStartISO = new Date(windowStartMs).toISOString();

  // 1) read current
  const { data: existing } = await db
    .from('rate_limits')
    .select('count')
    .eq('rl_key', rlKey)
    .eq('window_start', windowStartISO)
    .maybeSingle();

  if (!existing) {
    const { error: insErr } = await db
      .from('rate_limits')
      .insert({ rl_key: rlKey, window_start: windowStartISO, count: 1 });
    if (insErr) {
      console.error('[ratelimit] insert error', insErr);
      // fail-open (allow once) if DB hiccups
    }
    return true;
  }

  if (existing.count >= limit) return false;

  const { error: updErr } = await db
    .from('rate_limits')
    .update({ count: existing.count + 1 })
    .eq('rl_key', rlKey)
    .eq('window_start', windowStartISO);

  if (updErr) console.error('[ratelimit] update error', updErr);
  return true;
}