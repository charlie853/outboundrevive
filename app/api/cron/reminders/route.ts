import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { minutesNowInTZ } from '@/app/api/sms/send/route';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // Optional: restrict with admin token
    const adminHeader = (req.headers.get('x-admin-token') || '').trim();
    const adminWant = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
    if (!adminHeader || !adminWant || adminHeader !== adminWant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1) Fetch active accounts
    const { data: accounts } = await supabaseAdmin
      .from('accounts')
      .select('id');

    const touched: Array<{ account_id: string; lead_id: string; campaign_id: string } > = [];

    for (const acct of accounts || []) {
      const accountId = acct.id as string;

      // 2) Active campaigns and settings
      const { data: campaigns } = await supabaseAdmin
        .from('campaigns')
        .select('id,name')
        .eq('account_id', accountId)
        .eq('is_active', true);

      if (!campaigns || campaigns.length === 0) continue;

      for (const camp of campaigns) {
        const campaignId = camp.id as string;
        const { data: setting } = await supabaseAdmin
          .from('campaign_cadence_settings')
          .select('max_touches,min_spacing_hours,cooldown_hours')
          .eq('account_id', accountId)
          .eq('campaign_id', campaignId)
          .maybeSingle();

        const maxTouches = setting?.max_touches ?? 3;
        const minSpacingH = setting?.min_spacing_hours ?? 24;
        const cooldownH = setting?.cooldown_hours ?? 48;

        // 3) Pick leads that qualify: no inbound since last outbound for cooldown hours; touches sent < max; not opted_out
        const sinceIso = new Date(Date.now() - cooldownH * 3600 * 1000).toISOString();

        const { data: leads } = await supabaseAdmin
          .rpc('leads_needing_followup', { p_account_id: accountId, p_campaign_id: campaignId, p_since_iso: sinceIso, p_max_touches: maxTouches, p_min_spacing_hours: minSpacingH });

        for (const lead of leads || []) {
          touched.push({ account_id: accountId, lead_id: lead.id, campaign_id: campaignId });
          // Minimal enqueue: call existing sms send route via internal fetch could be added here.
        }
      }
    }

    return NextResponse.json({ scheduled: touched.length, details: touched });
  } catch (e:any) {
    console.error('cron/reminders error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";
import { createClient } from "@/lib/supabaseAdmin";
import { gentleReminder, firstNameOf } from "@/lib/reminderTemplates";

export const dynamic = "force-dynamic";

const REMINDER_WINDOW_MINS = 10;

function ensureAuth(req: NextRequest) {
  const headerKey = (req.headers.get("x-cron-key") || "").trim();
  const queryKey = (req.nextUrl.searchParams.get("key") || "").trim();
  if (req.headers.has("x-vercel-cron")) return true;
  const expected = (process.env.CRON_KEY || "").trim();
  return !!expected && (headerKey === expected || queryKey === expected);
}

function toMinutes(dt: DateTime) {
  return dt.hour * 60 + dt.minute;
}

function parseTimes(csv: string) {
  return csv.split(",").map(s => s.trim()).filter(Boolean);
}

function minutesFromHHMM(hhmm: string) {
  const [hh, mm] = hhmm.split(":").map(Number);
  return hh * 60 + mm;
}

function withinSlot(nowMinutes: number, slots: string[]) {
  return slots.some(slot => Math.abs(nowMinutes - minutesFromHHMM(slot)) <= REMINDER_WINDOW_MINS);
}

function withinQuietHours(nowMinutes: number, quiet: string) {
  const [start, end] = quiet.split("-").map(minutesFromHHMM);
  if (start <= end) {
    return nowMinutes >= start && nowMinutes < end;
  }
  return nowMinutes >= start || nowMinutes < end;
}

export async function GET(req: NextRequest) {
  if (!ensureAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const supabase = createClient();

  const tz = process.env.BUSINESS_TZ || "America/Los_Angeles";
  const dailySlots = parseTimes(process.env.REMINDER_DAILY_TIMES || "10:00,14:00,17:30");
  const quietWindow = process.env.QUIET_HOURS_LOCAL || "22:00-08:00";
  const minSinceOutMin = parseInt(process.env.REMINDER_MIN_SINCE_OUTBOUND_MIN || "180", 10);
  const minSinceInMin = parseInt(process.env.REMINDER_MIN_SINCE_INBOUND_MIN || "60", 10);
  const capDaily = parseInt(process.env.REMINDER_CAP_DAILY || "3", 10);
  const capWeekly = parseInt(process.env.REMINDER_CAP_WEEKLY || "12", 10);

  const now = DateTime.now().setZone(tz);
  const nowMinutes = toMinutes(now);

  if (!withinSlot(nowMinutes, dailySlots)) {
    return NextResponse.json({ ok: true, skipped: "outside_timeslot" });
  }

  if (withinQuietHours(nowMinutes, quietWindow)) {
    return NextResponse.json({ ok: true, skipped: "quiet_hours" });
  }

  const sinceWeekIso = DateTime.utc().minus({ days: 7 }).toISO();

  const { data: recentOuts, error: outErr } = await supabase
    .from("messages_out")
    .select("to_phone, body, created_at, gate_log")
    .gte("created_at", sinceWeekIso)
    .order("created_at", { ascending: false });

  if (outErr) {
    return NextResponse.json({ ok: false, error: outErr.message }, { status: 500 });
  }

  const latestByPhone = new Map<string, any>();
  for (const row of recentOuts || []) {
    if (!latestByPhone.has(row.to_phone)) {
      latestByPhone.set(row.to_phone, row);
    }
  }

  const results: any[] = [];

  for (const [phone, lastOut] of latestByPhone) {
    if (lastOut?.gate_log?.category === "reminder") {
      results.push({ to_phone: phone, skipped: true, reason: "last_message_is_reminder" });
      continue;
    }

    const lastOutAt = DateTime.fromISO(lastOut.created_at).toUTC();
    const minutesSinceOut = DateTime.utc().diff(lastOutAt, "minutes").minutes;
    if (minutesSinceOut < minSinceOutMin) {
      results.push({ to_phone: phone, skipped: true, reason: "waiting_min_since_outbound", waitMin: minSinceOutMin - minutesSinceOut });
      continue;
    }

    const { data: lead } = await supabase
      .from("leads")
      .select("name, reminder_pause_until")
      .eq("phone", phone)
      .maybeSingle();

    if (lead?.reminder_pause_until && new Date(lead.reminder_pause_until).getTime() > Date.now()) {
      results.push({ to_phone: phone, skipped: true, reason: "paused" });
      continue;
    }

    const { data: inbound } = await supabase
      .from("messages_in")
      .select("created_at")
      .eq("from_phone", phone)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastInbound = inbound && inbound.length ? DateTime.fromISO(inbound[0].created_at).toUTC() : null;
    if (lastInbound && DateTime.utc().diff(lastInbound, "minutes").minutes < minSinceInMin) {
      results.push({ to_phone: phone, skipped: true, reason: "waiting_min_since_inbound" });
      continue;
    }

    const dayStartIso = DateTime.utc().minus({ days: 1 }).toISO();
    const weekStartIso = DateTime.utc().minus({ days: 7 }).toISO();

    const [{ count: dayReminders }, { count: weekReminders }] = await Promise.all([
      supabase
        .from("messages_out")
        .select("id", { count: "exact", head: true })
        .eq("to_phone", phone)
        .gte("created_at", dayStartIso)
        .contains("gate_log", { category: "reminder" }),
      supabase
        .from("messages_out")
        .select("id", { count: "exact", head: true })
        .eq("to_phone", phone)
        .gte("created_at", weekStartIso)
        .contains("gate_log", { category: "reminder" }),
    ]);

    if ((dayReminders || 0) >= capDaily || (weekReminders || 0) >= capWeekly) {
      results.push({ to_phone: phone, skipped: true, reason: "cap_reached", dayCount: dayReminders, weekCount: weekReminders });
      continue;
    }

    const since = lastInbound ? lastInbound.toUTC().toISO() : weekStartIso;
    const { count: priorReminders } = await supabase
      .from("messages_out")
      .select("id", { count: "exact", head: true })
      .eq("to_phone", phone)
      .gte("created_at", since)
      .contains("gate_log", { category: "reminder" });

    const first = firstNameOf(lead?.name);
    const body = gentleReminder(first, priorReminders || 0);
    const reminderSeq = (priorReminders || 0) + 1;

    if (dry) {
      results.push({ to_phone: phone, preview: body, reminderSeq });
      continue;
    }

    const b64 = Buffer.from(body, "utf8").toString("base64");
    const resp = await fetch(`${process.env.BASE}/api/admin/ai-reply`, {
      method: "POST",
      headers: {
        "x-admin-key": process.env.ADMIN_API_KEY!,
        "x-send-context": "reminder",
        "x-fixed-reply-b64": b64,
        ...(reminderSeq ? { "x-reminder-seq": String(reminderSeq) } : {}),
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: phone, to: process.env.TWILIO_FROM, body: "(system) reminder" }),
    })
      .then(r => r.json())
      .catch(e => ({ error: e?.message || "send_error" }));

    results.push({ to_phone: phone, sent: !resp.error, error: resp.error || null, reminderSeq });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
