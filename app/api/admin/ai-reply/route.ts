// app/api/admin/ai-reply/route.ts
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sendSms } from "@/lib/twilio";
import { generateReply } from "./generateReply";
import { checkReminderCaps } from "@/lib/compliance";

export async function POST(req: NextRequest) {
  const debug = req.headers.get("x-debug") === "1";
  const sendContext = (req.headers.get("x-send-context") || "response").toLowerCase(); // "response" | "reminder"

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

  // Reminder-only caps (conversation replies are NOT capped)
  if (sendContext === "reminder") {
    try {
      const cap = await checkReminderCaps(from);
      if (cap.held) {
        return NextResponse.json({ ok: true, held: true, reason: "reminder_cap", dayCount: cap.dayCount, weekCount: cap.weekCount });
      }
    } catch (e: any) {
      // Fail-open on cap check errors (but log them)
      console.error("[ai-reply] reminder cap check error → proceeding", e?.message || e);
    }
  }

  // Generate AI reply (your existing function; returns text + optional ai_debug)
  const ai = await generateReply({ from, to, body, debug });
  const replyText = ai?.message || ai?.reply || "";

  // Send via Twilio helper (uses MessagingServiceSid)
  let sent: { sid?: string; status?: string } | null = null;
  try {
    sent = await sendSms({ to: from, body: replyText });
  } catch (e: any) {
    console.error("[ai-reply] twilio send ERROR", e?.message || e);
    return NextResponse.json({ ok: false, error: "twilio_send_failed" }, { status: 502 });
  }

  // Persist outbox with category tag so counts stay clean
  try {
    await supabaseAdmin.from("messages_out").insert({
      from_phone: to,           // Twilio number (sender)
      to_phone: from,           // Lead number (recipient)
      body: replyText,
      provider_sid: sent?.sid ?? null,
      provider: "twilio",
      provider_status: "queued",
      sent_by: "ai",
      gate_log: { category: sendContext === "reminder" ? "reminder" : "response" },
    });
  } catch (e: any) {
    console.error("[ai-reply] messages_out insert ERROR", e?.message || e);
    // non-fatal
  }

  return NextResponse.json({
    ok: true,
    strategy: ai?.kind || ai?.strategy || "text",
    reply: replyText,
    send_result: sent,
    ...(debug ? { ai_debug: ai } : {}),
  });
}
