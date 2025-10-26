// app/api/admin/ai-reply/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sendSms } from "@/lib/twilio";
import { generateReply } from "./generateReply";
import { introCopy, firstNameOf } from "@/lib/reminderTemplates";
import { shouldAddFooter, FOOTER_TEXT } from "@/lib/messagingCompliance";

async function reminderCounts(supabase: typeof supabaseAdmin, lead_id: string | null, to_phone: string) {
  const dayStart = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const weekStart = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const baseDay = supabase
    .from("messages_out")
    .select("id", { head: true, count: "exact" })
    .contains("gate_log", { category: "reminder" })
    .gte("created_at", dayStart);

  const baseWeek = supabase
    .from("messages_out")
    .select("id", { head: true, count: "exact" })
    .contains("gate_log", { category: "reminder" })
    .gte("created_at", weekStart);

  const dayQ = lead_id ? baseDay.eq("lead_id", lead_id) : baseDay.eq("to_phone", to_phone);
  const weekQ = lead_id ? baseWeek.eq("lead_id", lead_id) : baseWeek.eq("to_phone", to_phone);

  const [dayRes, weekRes] = await Promise.all([dayQ, weekQ]);

  if (dayRes.error) throw dayRes.error;
  if (weekRes.error) throw weekRes.error;

  return {
    dayCount: dayRes.count ?? 0,
    weekCount: weekRes.count ?? 0,
    dayStart,
    weekStart,
  };
}

export async function POST(req: NextRequest) {
  const debug = req.headers.get("x-debug") === "1";
  const sendContext = (req.headers.get("x-send-context") || "response").toLowerCase(); // "response" | "reminder"
  const fixedReply = req.headers.get("x-fixed-reply");

  // Admin auth
  const provided = req.headers.get("x-admin-key") || "";
  if (!process.env.ADMIN_API_KEY || provided !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Parse
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const from = String(payload.from || "").trim(); // lead's phone
  const to   = String(payload.to   || "").trim(); // your Twilio number
  const body = String(payload.body || "").trim();
  if (!from || !to || !body) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }
  const baseUsed = process.env.PUBLIC_BASE || "";

  let lead_id: string | null = null;
  let leadFirstName: string | undefined;
  try {
    const { data: leadRow, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id,name")
      .eq("phone", from)
      .maybeSingle();
    if (leadErr) console.warn("[ai-reply] lead lookup warn:", leadErr.message);
    leadFirstName = firstNameOf(leadRow?.name);
    lead_id = leadRow?.id ?? null;
  } catch (e: any) {
    console.warn("[ai-reply] lead lookup error:", e?.message || e);
  }

  const sinceIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [{ count: recentOutCount = 0 }, { count: recentInCount = 0 }] = await Promise.all([
    supabaseAdmin
      .from("messages_out")
      .select("id", { count: "exact", head: true })
      .eq("to_phone", from)
      .gte("created_at", sinceIso),
    supabaseAdmin
      .from("messages_in")
      .select("id", { count: "exact", head: true })
      .eq("from_phone", from)
      .gte("created_at", sinceIso),
  ]);
  const isNewThread = (recentOutCount + recentInCount) === 0;

  let replyText: string | null = null;
  let ai: any = null;
  let branch = "ai";

  if (fixedReply) {
    replyText = fixedReply;
    branch = "fixed";
  }

  if (!replyText && sendContext === "response" && isNewThread) {
    replyText = introCopy(leadFirstName);
    branch = "intro";
  }

  if (!replyText) {
    const brandName = "OutboundRevive";
    const bookingLink = process.env.CAL_LINK || "";
    ai = await generateReply({
      userBody: body,
      fromPhone: from,
      toPhone: to,
      brandName,
      bookingLink,
    });
    replyText = (ai?.message || "").trim();
    branch = "ai";
    if (!replyText) {
      return NextResponse.json({ ok: false, error: "empty_reply" }, { status: 500 });
    }
  }

  if (await shouldAddFooter(from) && !/opt out/i.test(replyText)) {
    replyText += `\n${FOOTER_TEXT}`;
  }

  if (replyText.length > 320) {
    replyText = replyText.slice(0, 320).trim();
  }

  if (sendContext === "reminder") {
    const caps = {
      daily: parseInt(process.env.REMINDER_CAP_DAILY || "1", 10),
      weekly: parseInt(process.env.REMINDER_CAP_WEEKLY || "3", 10),
    };

    try {
      const counts = await reminderCounts(supabaseAdmin, lead_id, from);

      if ((caps.daily > 0 && counts.dayCount >= caps.daily) ||
          (caps.weekly > 0 && counts.weekCount >= caps.weekly)) {
        if (debug && ai) (ai as any)._cap_meta = { caps, ...counts, reason: "reminder_cap" };
        return NextResponse.json({
          ok: true,
          held: true,
          reason: "reminder_cap",
          dayCount: counts.dayCount,
          weekCount: counts.weekCount,
        });
      }

      if (debug && ai) (ai as any)._cap_meta = { caps, ...counts, reason: null };
    } catch (err: any) {
      console.error("[ai-reply] reminder cap check error → proceeding", err?.message || err);
    }
  }

  // Send via Twilio helper (uses MessagingServiceSid)
  let sent: { sid?: string; status?: string } | null = null;
  try {
    sent = await sendSms({ to: from, body: replyText });
  } catch (e: any) {
    console.error("[ai-reply] twilio send ERROR", e?.message || e);
    return NextResponse.json({ ok: false, error: "twilio_send_failed" }, { status: 502 });
  }

  const gateCategory = sendContext === "reminder" ? "reminder" : "response";

  console.log("OUTBOX_CHOSEN", {
    sendContext,
    branch,
    preview: replyText.slice(0, 80),
  });

  const outboxPayload = {
    lead_id,
    from_phone: to,
    to_phone: from,
    body: replyText,
    provider: "twilio",
    provider_sid: sent?.sid ?? null,
    provider_status: sent?.status ?? "queued",
    sent_by: "ai",
    gate_log: { category: gateCategory },
  };

  console.log("OUTBOX_INSERT_TRY", outboxPayload);
  const { error: insertErr } = await supabaseAdmin.from("messages_out").insert(outboxPayload);
  if (insertErr) {
    console.error("OUTBOX_INSERT_ERROR", insertErr.message, outboxPayload);
    if (debug && ai) (ai as any)._db_error = insertErr.message || "insert_error";
  } else {
    console.log("OUTBOX_INSERT_OK", outboxPayload.provider_sid || "<no-sid>");
  }

  return NextResponse.json({
    ok: true,
    strategy: ai?.kind || ai?.strategy || "text",
    reply: replyText,
    send_result: sent,
    base_used: baseUsed,
    ...(debug ? { ai_debug: ai } : {}),
  });
}
