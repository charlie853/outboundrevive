import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { nextReminderVariant } from "@/lib/reminderTemplates";

const DEFAULT_INTERVALS = "24h,72h";

function parseDuration(token: string): number | null {
  const trimmed = token.trim().toLowerCase();
  if (!trimmed) return null;
  const match = /^([0-9]+)\s*([smhd])$/.exec(trimmed);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2];
  switch (unit) {
    case "s": return value * 1000;
    case "m": return value * 60 * 1000;
    case "h": return value * 60 * 60 * 1000;
    case "d": return value * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function parseIntervals(raw: string | undefined): number[] {
  const source = raw && raw.trim() ? raw : DEFAULT_INTERVALS;
  const parts = source.split(",");
  const out: number[] = [];
  for (const part of parts) {
    const ms = parseDuration(part);
    if (ms && !out.includes(ms)) out.push(ms);
  }
  return out.sort((a, b) => a - b);
}

type Candidate = {
  leadId: string | null;
  toPhone: string;
  lastOut: Date;
};

function parseTimes(timesCsv: string) {
  return timesCsv
    .split(",")
    .map(t => t.trim())
    .filter(Boolean);
}

function isWithinSlotNow(tz: string, timesCsv: string, driftMins = 10) {
  const now = DateTime.now().setZone(tz, { keepLocalTime: false });
  if (!now.isValid) return false;
  const slots = parseTimes(timesCsv);
  for (const slot of slots) {
    const [hh, mm] = slot.split(":" ).map(Number);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
    const slotTime = now.set({ hour: hh, minute: mm, second: 0, millisecond: 0 });
    if (!slotTime.isValid) continue;
    const diff = Math.abs(now.diff(slotTime, "minutes").minutes);
    if (diff <= driftMins) return true;
  }
  return false;
}

async function handler(req: Request) {
  if (!process.env.CRON_KEY) {
    console.warn("[cron/reminders] CRON_KEY not configured");
    return NextResponse.json({ ok: false, error: "cron_unconfigured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const keyFromHeader = (req.headers.get("x-cron-key") || req.headers.get("x-cron-secret") || "").trim();
  const keyFromQuery = (url.searchParams.get("key") || "").trim();
  const expected = (process.env.CRON_KEY || "").trim();
  const hasVercelCron = req.headers.get("x-vercel-cron") === "1";
  const dry = url.searchParams.has("dry") || req.headers.get("x-dry-run") === "1";
  const okKey = (!!keyFromHeader && keyFromHeader === expected) || (!!keyFromQuery && keyFromQuery === expected);

  if (!okKey && !hasVercelCron) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limitParam = url.searchParams.get("limit");
  const limit = Math.max(1, Math.min(100, limitParam ? Number(limitParam) || 25 : 25));

  const intervals = parseIntervals(process.env.REMINDER_INTERVALS);
  if (!intervals.length) {
    console.warn("[cron/reminders] no valid REMINDER_INTERVALS; skipping");
    return NextResponse.json({ ok: false, error: "no_intervals" }, { status: 500 });
  }

  const tz = process.env.BUSINESS_TZ || process.env.REMINDER_TIMEZONE || "America/Los_Angeles";
  const timesCsv = process.env.REMINDER_DAILY_TIMES || "10:00,14:00,17:30";
  const drift = Number(process.env.REMINDER_SLOT_DRIFT || process.env.REMINDER_TIME_DRIFT || 10);

  if (!isWithinSlotNow(tz, timesCsv, drift)) {
    return NextResponse.json({ ok: true, skipped: "outside_timeslot" });
  }

  const outboundRes = await supabaseAdmin
    .from("messages_out")
    .select("id,lead_id,to_phone,created_at,gate_log")
    .order("created_at", { ascending: false })
    .limit(limit * 20);

  if (outboundRes.error) {
    console.error("[cron/reminders] messages_out fetch error", outboundRes.error.message);
    return NextResponse.json({ ok: false, error: outboundRes.error.message }, { status: 500 });
  }

  const candidatesMap = new Map<string, Candidate>();
  const phones = new Set<string>();

  for (const row of outboundRes.data || []) {
    const phone = row.to_phone as string | null;
    if (!phone) continue;
    const key = (row.lead_id as string | null) || phone;
    if (!candidatesMap.has(key)) {
      candidatesMap.set(key, {
        leadId: (row.lead_id as string | null) ?? null,
        toPhone: phone,
        lastOut: new Date(row.created_at as string),
      });
      phones.add(phone);
    }
    if (candidatesMap.size >= limit) break;
  }

  if (!candidatesMap.size) {
    return NextResponse.json({ ok: true, processed: 0, results: [] });
  }

  const phoneList = Array.from(phones);

  const inboundRes = await supabaseAdmin
    .from("messages_in")
    .select("from_phone,created_at")
    .in("from_phone", phoneList)
    .order("created_at", { ascending: false });

  if (inboundRes.error) {
    console.error("[cron/reminders] messages_in fetch error", inboundRes.error.message);
    return NextResponse.json({ ok: false, error: inboundRes.error.message }, { status: 500 });
  }

  const lastInboundMap = new Map<string, Date>();
  for (const row of inboundRes.data || []) {
    const phone = row.from_phone as string | null;
    if (!phone) continue;
    if (!lastInboundMap.has(phone)) {
      lastInboundMap.set(phone, new Date(row.created_at as string));
    }
  }

  const reminderRowsRes = await supabaseAdmin
    .from("messages_out")
    .select("to_phone,created_at,gate_log")
    .in("to_phone", phoneList)
    .contains("gate_log", { category: "reminder" })
    .order("created_at", { ascending: true });

  if (reminderRowsRes.error) {
    console.error("[cron/reminders] reminder rows fetch error", reminderRowsRes.error.message);
    return NextResponse.json({ ok: false, error: reminderRowsRes.error.message }, { status: 500 });
  }

  const remindersByPhone = new Map<string, Date[]>();
  for (const row of reminderRowsRes.data || []) {
    const phone = row.to_phone as string | null;
    if (!phone) continue;
    if (!remindersByPhone.has(phone)) remindersByPhone.set(phone, []);
    remindersByPhone.get(phone)!.push(new Date(row.created_at as string));
  }

  const results: any[] = [];
  const baseUrl = process.env.PUBLIC_BASE || process.env.PUBLIC_BASE_URL || "";
  const twilioFrom = process.env.TWILIO_DEFAULT_FROM || process.env.TWILIO_FROM_NUMBER || "";

  if (!baseUrl) console.warn("[cron/reminders] PUBLIC_BASE not set; reminder dispatch may fail");
  if (!twilioFrom) console.warn("[cron/reminders] TWILIO_DEFAULT_FROM not set; reminder dispatch may fail");

  const variantIndexToday = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  const reminderBody = nextReminderVariant(variantIndexToday);
  const minGapHoursRaw = Number(process.env.REMINDER_MIN_GAP_HOURS || 3);
  const minGapHours = Number.isFinite(minGapHoursRaw) && minGapHoursRaw > 0 ? minGapHoursRaw : 3;
  const minGapMs = minGapHours * 60 * 60 * 1000;

  for (const candidate of candidatesMap.values()) {
    const { leadId, toPhone, lastOut } = candidate;
    const lastInbound = lastInboundMap.get(toPhone) || null;
    if (lastInbound && lastInbound > lastOut) {
      results.push({ to_phone: toPhone, skipped: true, reason: "recent_inbound" });
      continue;
    }

    const { data: pausedData, error: pauseErr } = await supabaseAdmin
      .from("global_suppressions")
      .select("phone")
      .eq("phone", toPhone)
      .eq("scope", "reminders")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (pauseErr) {
      console.warn('[cron/reminders] pause check warn', pauseErr.message);
    }
    if (pausedData) {
      results.push({ to_phone: toPhone, skipped: true, reason: "suppressed" });
      continue;
    }

    const reminderDates = remindersByPhone.get(toPhone) || [];
    const relevantReminders = reminderDates.filter(d => !lastInbound || d > lastInbound);
    const reminderCount = relevantReminders.length;

    if (reminderCount >= intervals.length) {
      results.push({ to_phone: toPhone, skipped: true, reason: "cadence_complete" });
      continue;
    }

    if (relevantReminders.length) {
      const lastReminder = relevantReminders[relevantReminders.length - 1];
      if (Date.now() - lastReminder.getTime() < minGapMs) {
        results.push({ to_phone: toPhone, skipped: true, reason: "min_gap", waitMs: minGapMs - (Date.now() - lastReminder.getTime()) });
        continue;
      }
    }

    const elapsed = Date.now() - lastOut.getTime();
    const requiredMs = intervals[reminderCount];
    if (elapsed < requiredMs) {
      results.push({ to_phone: toPhone, skipped: true, reason: "waiting_interval", waitMs: requiredMs - elapsed });
      continue;
    }

    if (dry) {
      results.push({ to_phone: toPhone, lead_id: leadId, action: "would_send", intervalMs: requiredMs, body: reminderBody });
      continue;
    }

    if (!baseUrl || !process.env.ADMIN_API_KEY || !twilioFrom) {
      results.push({ to_phone: toPhone, lead_id: leadId, error: "missing_config" });
      continue;
    }

    const payload = {
      from: toPhone,
      to: twilioFrom,
      body: reminderBody,
    };

    try {
      const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/api/admin/ai-reply`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": process.env.ADMIN_API_KEY,
          "x-send-context": "reminder",
        },
        body: JSON.stringify(payload),
      });

      const json = await resp.json().catch(() => ({}));
      results.push({
        to_phone: toPhone,
        lead_id: leadId,
        status: resp.status,
        ok: json?.ok ?? false,
        held: json?.held ?? false,
        reason: json?.reason ?? null,
      });
    } catch (err: any) {
      results.push({ to_phone: toPhone, lead_id: leadId, error: err?.message || "fetch_failed" });
    }
  }

  if (dry) {
    return NextResponse.json({ ok: true, mode: "dry-run", processed: results.length, results });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

export async function GET(req: Request) {
  return handler(req);
}

export async function POST(req: Request) {
  return handler(req);
}
