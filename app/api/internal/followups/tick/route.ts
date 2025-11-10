import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

function addDays(ts: Date, days: number) {
  return new Date(ts.getTime() + days*86400*1000);
}

function isoMinus(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

async function checkReminderCaps(toPhone: string) {
  const DAILY = parseInt(process.env.REMINDER_CAP_DAILY ?? '1', 10);
  const WEEKLY = parseInt(process.env.REMINDER_CAP_WEEKLY ?? '3', 10);

  const bypassCsv = (process.env.CAPS_DISABLE_FOR || '')
    .split(/[\s,]+/)
    .filter(Boolean);
  if (bypassCsv.includes(toPhone)) return { held: false, dayCount: 0, weekCount: 0 };

  const dayStart = isoMinus(24);
  const weekStart = isoMinus(24 * 7);

  const dayQ = db
    .from('messages_out')
    .select('id', { count: 'exact', head: true })
    .eq('to_phone', toPhone)
    .gte('created_at', dayStart)
    .contains('gate_log', { category: 'reminder' });

  const weekQ = db
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

async function isNewThread(toPhone: string): Promise<boolean> {
  const since = isoDaysAgo(14);
  const { data, error } = await db
    .from('messages_out')
    .select('id')
    .eq('to_phone', toPhone)
    .gte('created_at', since)
    .limit(1);

  if (error) {
    console.warn('[followups] intro check error → treat as old thread', error.message);
    return false;
  }
  return !data || data.length === 0;
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

    // cache pause
    const pausedCache = new Map<string, boolean>();
    const fromNumberCache = new Map<string, string | null>();
    for (const c of due) {
      const lead_id = c.lead_id as string;
      const acct = c.account_id as string;

      if (!pausedCache.has(acct)) {
        const { data: a } = await db.from('accounts').select('outbound_paused').eq('id', acct).maybeSingle();
        pausedCache.set(acct, !!a?.outbound_paused);
      }
      if (pausedCache.get(acct)) {
        results.push({ lead_id, skipped: true, reason: 'account_paused' });
        continue;
      }

      // 2) Build a “q” from the last inbound or fallback and fetch lead details
      const [lastIn, leadRes] = await Promise.all([
        db.from('messages_in').select('body,created_at').eq('lead_id', lead_id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
        db.from('leads').select('id,phone').eq('id', lead_id).maybeSingle(),
      ]);

      const leadPhone = leadRes.data?.phone?.trim();
      if (!leadPhone) {
        results.push({ lead_id, skipped: true, reason: 'missing_phone' });
        continue;
      }

      const lastInbound = lastIn.data?.body?.trim() || '';
      const q = lastInbound || 'Quick follow-up regarding your interest.';

      // cache account from-number for logging held messages
      let fromNumber = fromNumberCache.get(acct);
      if (fromNumber === undefined) {
        const { data: cfg } = await db
          .from('account_sms_config')
          .select('from_number')
          .eq('account_id', acct)
          .maybeSingle();
        fromNumber = cfg?.from_number || null;
        fromNumberCache.set(acct, fromNumber);
      }

      // 3) Draft with Knowledge Pack (no immediate send)
      const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
      const admin = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();

      const draftPayload = (limitChars: number) => ({
        account_id: acct,
        q,
        k,
        max_chars: limitChars,
        send: false,
        lead_id,
        operator_id
      });

      const fetchDraft = async (limitChars: number) => {
        const resp = await fetch(`${base}/api/internal/knowledge/draft`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-admin-token': admin },
          body: JSON.stringify(draftPayload(limitChars))
        });
        if (!resp.ok) return {};
        return resp.json().catch(() => ({}));
      };

      let currentCap = max_chars;
      let draftRes: any = await fetchDraft(currentCap);
      let draftText = String(draftRes?.draft?.text || '').trim();
      if (!draftText) {
        results.push({ lead_id, skipped: true, reason: 'no_draft' });
        continue;
      }

      // Respect daily/weekly caps before sending
      let cap = { held: false, dayCount: 0, weekCount: 0 };
      try {
        cap = await checkReminderCaps(leadPhone);
      } catch (err: any) {
        console.warn('[followups] reminder cap check error → skip cap', err?.message || err);
      }
      if (cap.held) {
        const holdReason = 'reminder_cap';
        await db.from('messages_out').insert({
          lead_id,
          from_phone: fromNumber,
          to_phone: leadPhone,
          body: draftText,
          status: 'held',
          provider: 'twilio',
          provider_status: 'held',
          sent_by: 'system',
          gate_log: { category: 'reminder', reason: holdReason, dayCount: cap.dayCount, weekCount: cap.weekCount }
        });
        results.push({ lead_id, skipped: true, reason: holdReason, dayCount: cap.dayCount, weekCount: cap.weekCount });
        continue;
      }

      const newThread = await isNewThread(leadPhone);

      const applyCompliance = (text: string) => {
        let out = text.trim();
        if (newThread && !/charlie/i.test(out)) {
          out = `Hey—it’s Charlie from OutboundRevive. ${out}`;
        }
        if (out.length > 320) out = out.slice(0, 320).trim();
        return out;
      };

      const sendOnce = async (text: string) => {
        const payload = {
          leadIds: [lead_id],
          message: text,
          replyMode: true,
          operator_id,
          account_id: acct,
          lead_id,
          body: text,
          gate_context: 'reminder',
        };
        const resp = await fetch(`${base}/api/sms/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-admin-token': admin },
          body: JSON.stringify(payload)
        });
        const json = await resp.json().catch(() => ({}));
        return { ok: resp.ok, json };
      };

      let finalText = applyCompliance(draftText);
      let sendAttempt = await sendOnce(finalText);
      let sendResult = Array.isArray(sendAttempt.json?.results) ? sendAttempt.json.results[0] : null;

      if ((!sendResult || !sendResult.sid) && sendResult?.error === 'too_long_with_footer') {
        currentCap = Math.max(120, currentCap - 40);
        draftRes = await fetchDraft(currentCap);
        draftText = String(draftRes?.draft?.text || '').trim() || draftText;
        finalText = applyCompliance(draftText);
        sendAttempt = await sendOnce(finalText);
        sendResult = Array.isArray(sendAttempt.json?.results) ? sendAttempt.json.results[0] : sendResult;
      }

      const wasSent = !!sendResult?.sid;
      const sentSid = wasSent ? sendResult.sid : null;
      const sendError = sendResult?.error || sendAttempt.json?.error || (sendAttempt.ok ? null : 'send_failed');

      // 4) Log + reschedule
      const attempt = Number(c.attempt ?? 0) + 1;
      const done = attempt >= Number(c.max_attempts ?? 42);

      let next_at: string | null = null;
      if (!done) {
        // cadence is now in hours, not days
        const plan = Array.isArray(c.cadence) && c.cadence.length ? c.cadence : [12,24,36,48,60,72,84,96,108,120,132,144,156,168,180,192,204,216,228,240,252,264,276,288,300,312,324,336,348,360,372,384,396,408,420,432,444,456,468,480,492,504];
        const stepHours = plan[Math.min(attempt-1, plan.length-1)] || 12; // clamp to last cadence value (12h default)
        const nextTime = new Date(Date.now() + stepHours * 60 * 60 * 1000);
        next_at = nextTime.toISOString();
      }

      await db.from('ai_followup_log').insert({
        account_id: acct,
        lead_id,
        attempt,
        planned_at: c.next_at ?? now.toISOString(),
        sent_sid: sentSid,
        status: wasSent ? 'sent' : 'skipped',
        reason: wasSent ? null : (sendError || 'not_sent')
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

      results.push({ lead_id, attempt, sent_sid: sentSid, next_at, done, error: sendError ?? null });
      processed++;
    }

    return NextResponse.json({ ok: true, picked: due.length, processed, results });
  } catch (e:any) {
    return NextResponse.json({ error: 'tick_crash', detail: e?.message || String(e) }, { status: 500 });
  }
}
