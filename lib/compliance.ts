import { supabaseAdmin } from '@/lib/supabaseServer';

export const FOOTER_TEXT = 'Txt STOP to opt out';
export const FOOTER_REFRESH_DAYS = 30;     // show footer if not sent in last 30 days
export const INTRO_WINDOW_DAYS = 14;       // treat as new thread if no outbound in last 14 days
export const DAILY_CAP = 3;                // max sends per recipient per 24h
export const WEEKLY_CAP = 8;               // max sends per recipient per 7d

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

export async function shouldAddFooter(toPhone: string): Promise<boolean> {
  // include footer if we have NOT sent a footer to this number within FOOTER_REFRESH_DAYS
  const since = isoDaysAgo(FOOTER_REFRESH_DAYS);
  const { data, error } = await supabaseAdmin
    .from('messages_out')
    .select('body')
    .eq('to_phone', toPhone)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.warn('[compliance] footer check error -> being safe (include)', error);
    return true;
  }
  return !(data ?? []).some(r => r.body && /stop to opt out/i.test(r.body));
}

export async function isNewThread(toPhone: string): Promise<boolean> {
  // new thread if no outbound to this number within INTRO_WINDOW_DAYS
  const since = isoDaysAgo(INTRO_WINDOW_DAYS);
  const { data, error } = await supabaseAdmin
    .from('messages_out')
    .select('id')
    .eq('to_phone', toPhone)
    .gte('created_at', since)
    .limit(1);

  if (error) {
    console.warn('[compliance] intro check error -> treat as old thread', error);
    return false;
  }
  return !data || data.length === 0;
}

export async function checkCaps(toPhone: string): Promise<{ allowed: boolean; dayCount: number; weekCount: number; }> {
  const daySince = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const weekSince = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const daySel = await supabaseAdmin
    .from('messages_out')
    .select('id', { count: 'exact', head: true })
    .eq('to_phone', toPhone)
    .gte('created_at', daySince);

  const weekSel = await supabaseAdmin
    .from('messages_out')
    .select('id', { count: 'exact', head: true })
    .eq('to_phone', toPhone)
    .gte('created_at', weekSince);

  const dayCount = daySel.count ?? 0;
  const weekCount = weekSel.count ?? 0;

  return { allowed: dayCount < DAILY_CAP && weekCount < WEEKLY_CAP, dayCount, weekCount };
}
