import { supabaseAdmin } from '@/lib/supabaseServer';

export const FOOTER_TEXT = 'Txt STOP to opt out';
export const FOOTER_REFRESH_DAYS = 30;     // show footer if not sent in last 30 days
export const INTRO_WINDOW_DAYS = 14;       // treat as new thread if no outbound in last 14 days

function isoMinus(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

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

export async function checkReminderCaps(toPhone: string) {
  const DAILY = parseInt(process.env.REMINDER_CAP_DAILY ?? '1', 10);
  const WEEKLY = parseInt(process.env.REMINDER_CAP_WEEKLY ?? '3', 10);

  const bypassCsv = (process.env.CAPS_DISABLE_FOR || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (bypassCsv.includes(toPhone)) return { held: false, dayCount: 0, weekCount: 0 };

  const dayStart = isoMinus(24);
  const weekStart = isoMinus(24 * 7);

  const dayQ = supabaseAdmin
    .from('messages_out')
    .select('id', { count: 'exact', head: true })
    .eq('to_phone', toPhone)
    .gte('created_at', dayStart)
    .contains('gate_log', { category: 'reminder' });

  const weekQ = supabaseAdmin
    .from('messages_out')
    .select('id', { count: 'exact', head: true })
    .eq('to_phone', toPhone)
    .gte('created_at', weekStart)
    .contains('gate_log', { category: 'reminder' });

  const [{ count: dayCount, error: dayErr }, { count: weekCount, error: weekErr }] = await Promise.all([dayQ, weekQ]);
  if (dayErr) throw dayErr;
  if (weekErr) throw weekErr;

  const held = (typeof dayCount === 'number' && dayCount >= DAILY) ||
               (typeof weekCount === 'number' && weekCount >= WEEKLY);

  return {
    held,
    dayCount: dayCount ?? 0,
    weekCount: weekCount ?? 0,
  };
}
