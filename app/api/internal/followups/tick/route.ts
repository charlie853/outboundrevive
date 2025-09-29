import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession:false } });

function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

function addDays(ts: Date, days: number) {
  return new Date(ts.getTime() + days*86400*1000);
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const now = new Date();

  try {
    const body = await req.json().catch(() => ({}));
    const account_id: string | undefined = body.account_id || body.accountId;
    const limit = Math.max(1, Math.min(50, Number(body.limit || 25)));
    const k = Math.max(1, Math.min(10, Number(body.k || 3)));
    const max_chars = Math.max(120, Math.min(300, Number(body.max_chars || 160)));
    const operator_id: string | null = body.operator_id || body.operatorId || null;

    // 1) Pick due cursors (light lock: flip to 'processing' immediately)
    // NOTE: This is a simple, low-contention lock for dev. For high scale, use a DB function.
    const { data: due, error: dueErr } = await db
      .from('ai_followup_cursor')
      .select('lead_id, account_id, attempt, cadence, max_attempts, next_at')
      .eq('status', 'active')
      .lte('next_at', now.toISOString())
      .order('next_at', { ascending: true })
      .limit(limit);

    if (dueErr) return NextResponse.json({ error: 'db_error', detail: dueErr.message }, { status: 500 });
    if (!due?.length) return NextResponse.json({ ok: true, picked: 0, processed: 0 });

    // Flip to processing to avoid race
    const ids = due.map(r => r.lead_id);
    await db.from('ai_followup_cursor').update({ status: 'processing', updated_at: new Date().toISOString() }).in('lead_id', ids);

    let processed = 0;
    const results: any[] = [];

    for (const c of due) {
      const lead_id = c.lead_id as string;
      const acct = c.account_id as string;

      // 2) Build a “q” from the last inbound or fallback
      const [lastIn, lastOut] = await Promise.all([
        db.from('messages_in').select('body,created_at').eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('messages_out').select('body,created_at').eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      const lastInbound = lastIn.data?.body?.trim() || '';
      const q = lastInbound || 'Quick follow-up regarding your interest.';

      // 3) Draft with Knowledge Pack (and send in one hop)
      const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
      const admin = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();

      const draftReq = await fetch(`${base}/api/internal/knowledge/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': admin },
        body: JSON.stringify({
          account_id: acct,
          q,
          k,
          max_chars,
          send: true,
          lead_id,
          operator_id
        })
      });

      const draftRes = await draftReq.json().catch(() => ({}));
      const sentSid = draftRes?.sent?.results?.[0]?.sid || null;
      const tooLong = draftRes?.sent?.results?.[0]?.error === 'too_long_with_footer';

      // cheap retry if footer made it too long: shrink and resend once
      if (!sentSid && tooLong) {
        const retry = await fetch(`${base}/api/internal/knowledge/draft`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-admin-token': admin },
          body: JSON.stringify({
            account_id: acct,
            q,
            k,
            max_chars: Math.max(120, max_chars - 40),
            send: true,
            lead_id,
            operator_id
          })
        });
        const retryRes = await retry.json().catch(() => ({}));
        if (retryRes?.sent?.results?.[0]?.sid) {
          draftRes.sent = retryRes.sent;
        }
      }

      // 4) Log + reschedule
      const wasSent = !!draftRes?.sent?.results?.[0]?.sid;
      const attempt = Number(c.attempt ?? 0) + 1;
      const done = attempt >= Number(c.max_attempts ?? 5);

      let next_at: string | null = null;
      if (!done) {
        const plan = Array.isArray(c.cadence) && c.cadence.length ? c.cadence : [3,7,14];
        const stepDays = plan[Math.min(attempt-1, plan.length-1)] || 7; // clamp to last cadence value
        next_at = addDays(new Date(), stepDays).toISOString();
      }

      await db.from('ai_followup_log').insert({
        account_id: acct,
        lead_id,
        attempt,
        planned_at: c.next_at ?? now.toISOString(),
        sent_sid: draftRes?.sent?.results?.[0]?.sid ?? null,
        status: wasSent ? 'sent' : 'skipped',
        reason: wasSent ? null : (draftRes?.sent?.results?.[0]?.error || draftRes?.send_error || 'not_sent')
      });

      await db.from('ai_followup_cursor')
        .update({
          status: done ? 'done' : 'active',
          attempt,
          last_out_at: new Date().toISOString(),
          next_at,
          updated_at: new Date().toISOString()
        })
        .eq('lead_id', lead_id);

      results.push({ lead_id, attempt, sent_sid: draftRes?.sent?.results?.[0]?.sid ?? null, next_at, done });
      processed++;
    }

    return NextResponse.json({ ok: true, picked: due.length, processed, results });
  } catch (e:any) {
    return NextResponse.json({ error: 'tick_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}