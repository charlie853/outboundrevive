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

export async function getCaps({
  leadId,
  toPhone,
  dayWindowISO,
  weekWindowISO,
}: {
  leadId?: string;
  toPhone?: string;
  dayWindowISO: string;
  weekWindowISO: string;
}) {
  const applyWhere = (q: any, sinceISO: string) => {
    let query = q.gte('created_at', sinceISO);
    if (leadId) query = query.eq('lead_id', leadId);
    else if (toPhone) query = query.eq('to_phone', toPhone);
    query = query.eq('provider', 'twilio');
    query = query.not('provider_sid', 'is', null);
    return query;
  };

  const dayQuery = applyWhere(
    supabaseAdmin.from('messages_out').select('id', { count: 'exact', head: true }),
    dayWindowISO
  );
  const dayRes = await dayQuery;

  const weekQuery = applyWhere(
    supabaseAdmin.from('messages_out').select('id', { count: 'exact', head: true }),
    weekWindowISO
  );
  const weekRes = await weekQuery;

  return {
    dayCount: dayRes.count ?? 0,
    weekCount: weekRes.count ?? 0,
  };
}

export async function checkCaps({
  leadId,
  toPhone,
}: {
  leadId?: string;
  toPhone?: string;
}): Promise<{ allowed: boolean; dayCount: number; weekCount: number }> {
  const now = new Date();
  const dayWindowISO = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const weekWindowISO = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const { dayCount, weekCount } = await getCaps({ leadId, toPhone, dayWindowISO, weekWindowISO });
  return { allowed: dayCount < DAILY_CAP && weekCount < WEEKLY_CAP, dayCount, weekCount };
}
