'use server';

import { createClient } from '@supabase/supabase-js';

// Returns a list of lead IDs that are likely pending (not opted out, not booked yet)
export async function pickPending(limit: number = 25): Promise<string[]> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !key) return [];
    const db = createClient(url, key, { auth: { persistSession: false } });

    // Heuristic: not opted-out (false or null), not booked, prefer older first
    const { data, error } = await db
      .from('leads')
      .select('id, opted_out, appointment_set_at')
      .or('opted_out.is.null,opted_out.eq.false')
      .is('appointment_set_at', null)
      .order('created_at', { ascending: true })
      .limit(Math.max(1, Math.min(1000, Number(limit) || 25)));

    if (error || !data) return [];
    return data.map((r: any) => r.id).filter(Boolean);
  } catch {
    return [];
  }
}

// Backwards-compat named export (noop)
export async function pick(): Promise<{ ok: true }> {
  return { ok: true };
}

export default pick;
