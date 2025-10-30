import { supabaseAdmin } from '@/lib/supabaseServer';

// Resolve booking URL with per-tenant override; falls back to env aliases
export async function getBookingUrl(accountId?: string | null): Promise<string> {
  let fromDb: string | null = null;
  if (accountId) {
    try {
      const { data } = await supabaseAdmin
        .from('accounts')
        .select('booking_url')
        .eq('id', accountId)
        .maybeSingle();
      fromDb = (data?.booking_url || '').trim() || null;
    } catch {}
  }
  if (fromDb) return fromDb;

  const envs = [
    process.env.BOOKING_URL,
    process.env.CAL_BOOKING_URL,
    process.env.CAL_PUBLIC_URL,
    process.env.CAL_URL,
  ];
  for (const v of envs) {
    const s = (v || '').trim();
    if (s) return s;
  }
  return '';
}


