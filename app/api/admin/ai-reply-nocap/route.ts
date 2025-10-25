import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { sendSms } from "@/lib/twilio";
import { generateReply } from "../ai-reply/generateReply";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const key = req.headers.get("x-admin-key") || "";
  if (!process.env.ADMIN_API_KEY || key !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { from = "", to = "", body = "" } = await req.json();
  const base = process.env.PUBLIC_BASE || "";

  // 100% skip caps here
  const ai = await generateReply({ userBody: body, fromPhone: from, toPhone: to, brandName: "", bookingLink: undefined });
  const replyText = ai.message || "";

  // Send SMS
  let sent: any = null;
  try {
    sent = await sendSms({ to: from, body: replyText });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "twilio_send_failed", detail: String(e?.message || e) },
      { status: 502 }
    );
  }

  // Best-effort: record outbox
  try {
    await supabaseAdmin.from("messages_out").insert({
      from_phone: to,
      to_phone: from,
      body: replyText,
      provider_sid: sent?.sid ?? null,
      provider: "twilio",
      provider_status: "queued",
      sent_by: "ai",
    });
  } catch {}

  return NextResponse.json({
    ok: true,
    strategy: ai.kind,
    reply: replyText,
    send_result: sent,
    base_used: base,
    ai_debug: ai,
  });
}
