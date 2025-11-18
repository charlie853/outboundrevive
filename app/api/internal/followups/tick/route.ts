import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { 
  fetchThreadContext, 
  generateFollowUpMessage, 
  isWithinQuietHours,
  calculateNextSendTimeWithCompliance 
} from '@/lib/ai-followups';
import { pickMicroSurvey, recordMicroSurveyAsk } from '@/lib/micro-surveys';

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

      // 2) Fetch lead details and thread context
      const [leadRes, accountSettings] = await Promise.all([
        db.from('leads').select('id,phone,name').eq('id', lead_id).maybeSingle(),
        db.from('account_followup_settings')
          .select('preferred_send_times, quiet_hours_start, quiet_hours_end')
          .eq('account_id', acct)
          .maybeSingle(),
      ]);

      const leadPhone = leadRes.data?.phone?.trim();
      if (!leadPhone) {
        results.push({ lead_id, skipped: true, reason: 'missing_phone' });
        continue;
      }

      const leadName = leadRes.data?.name || null;
      const preferredTimes = accountSettings?.preferred_send_times || [{"hour": 10, "minute": 30}, {"hour": 15, "minute": 30}];

      // Check quiet hours before generating message
      const withinQuiet = await isWithinQuietHours(leadPhone, acct);
      if (!withinQuiet) {
        // Reschedule to next quiet window
        const attempt = Number(c.attempt ?? 0);
        const plan = Array.isArray(c.cadence) && c.cadence.length ? c.cadence : [48, 96, 168, 240];
        const stepHours = plan[Math.min(attempt, plan.length - 1)] || 48;
        const nextAt = await calculateNextSendTimeWithCompliance(stepHours, acct, leadPhone, preferredTimes);
        
        await db.from('ai_followup_cursor')
          .update({ next_at: nextAt, updated_at: new Date().toISOString() })
          .eq('lead_id', lead_id);
        
        results.push({ lead_id, skipped: true, reason: 'quiet_hours', next_at: nextAt });
        continue;
      }

      // Fetch thread context for context-aware message generation
      const { threadHistory, lastInbound, lastOutbound } = await fetchThreadContext(lead_id);

      // Get account settings for brand/booking link
      const [accountConfig, smsConfig] = await Promise.all([
        db.from('accounts').select('name, vertical').eq('id', acct).maybeSingle(),
        db.from('account_sms_config').select('from_number, booking_url').eq('account_id', acct).maybeSingle(),
      ]);

      const brand = accountConfig?.name || 'OutboundRevive';
      const vertical = accountConfig?.vertical || 'auto';
      const bookingLink = smsConfig?.booking_url || process.env.CAL_BOOKING_URL || null;

      // cache account from-number for logging held messages
      let fromNumber = fromNumberCache.get(acct);
      if (fromNumber === undefined) {
        fromNumber = smsConfig?.from_number || null;
        fromNumberCache.set(acct, fromNumber);
      }

      // 3) Generate context-aware follow-up message using AI
      const attempt = Number(c.attempt ?? 0) + 1;
      let draftText: string | null = null;
      let followupIntent: 'followup' | 'micro_survey' = 'followup';
      const microSurvey = await pickMicroSurvey(acct, lead_id, vertical);
      if (microSurvey) {
        draftText = microSurvey.template;
        followupIntent = 'micro_survey';
        await recordMicroSurveyAsk(acct, lead_id, microSurvey.key);
      } else {
        try {
          draftText = await generateFollowUpMessage({
            leadId: lead_id,
            accountId: acct,
            leadName,
            leadPhone,
            attempt,
            threadHistory,
            lastInbound,
            lastOutbound,
            brand,
            bookingLink,
          });
        } catch (err: any) {
          console.error(`[followups] Failed to generate follow-up for lead ${lead_id}:`, err);
          results.push({ lead_id, skipped: true, reason: 'ai_generation_failed', error: err.message });
          continue;
        }
      }

      if (!draftText || !draftText.trim()) {
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

      // 4) Apply basic compliance (length check)
      let finalText = draftText.trim();
      if (finalText.length > 320) {
        finalText = finalText.slice(0, 320).trim();
      }

      // 5) Send message via SMS API
      const base = process.env.PUBLIC_BASE_URL || 'http://localhost:3001';
      const admin = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();

      const gateContext = followupIntent === 'micro_survey' ? 'micro_survey' : 'followup';
      const sendOnce = async (text: string) => {
        const payload = {
          leadIds: [lead_id],
          message: text,
          replyMode: true,
          operator_id,
          account_id: acct,
          lead_id,
          body: text,
          gate_context: gateContext,
        };
        const resp = await fetch(`${base}/api/sms/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-admin-token': admin },
          body: JSON.stringify(payload)
        });
        const json = await resp.json().catch(() => ({}));
        return { ok: resp.ok, json };
      };

      const sendAttempt = await sendOnce(finalText);
      const sendResult = Array.isArray(sendAttempt.json?.results) ? sendAttempt.json.results[0] : null;

      const wasSent = !!sendResult?.sid;
      const sentSid = wasSent ? sendResult.sid : null;
      const sendError = sendResult?.error || sendAttempt.json?.error || (sendAttempt.ok ? null : 'send_failed');

      // 6) Log + reschedule with proper cadence (days-based, not hours)
      const done = attempt >= Number(c.max_attempts ?? 4);

      let next_at: string | null = null;
      if (!done) {
        // Gentle cadence: [48, 96, 168, 240] hours = [2d, 4d, 7d, 10d]
        const plan = Array.isArray(c.cadence) && c.cadence.length ? c.cadence : [48, 96, 168, 240];
        const stepHours = plan[Math.min(attempt - 1, plan.length - 1)] || 48;
        
        // Calculate next send time with quiet hours compliance and preferred times
        next_at = await calculateNextSendTimeWithCompliance(stepHours, acct, leadPhone, preferredTimes);
      }

      await db.from('ai_followup_log').insert({
        account_id: acct,
        lead_id,
        attempt,
        planned_at: c.next_at ?? now.toISOString(),
        sent_sid: sentSid,
        status: wasSent ? 'sent' : 'skipped',
        reason: wasSent ? followupIntent : (sendError || 'not_sent')
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
