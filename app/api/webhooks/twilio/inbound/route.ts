import { NextResponse } from "next/server";
import { supabaseAdmin as sb } from "@/lib/supabaseServer";
import { runAi } from "@/lib/runAi";

export const runtime = "nodejs"; // ensure Node runtime for robust form parsing

function xml(msg: string) {
  const safe = (msg || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

async function pauseRemindersUntil(phone: string, days: number) {
  const until = days > 0 ? new Date(Date.now() + days * 864e5).toISOString() : null;
  await sb.from("leads").update({ reminder_pause_until: until }).eq("phone", phone);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const from = String(form.get("From") || "");
    const to = String(form.get("To") || "");
    const body = String(form.get("Body") || "");

    if (!from || !to) {
      console.error("INBOUND_ERR missing to/from");
      return xml("Thanks—message received.");
    }

    // Normalize keywords
    const kw = body.trim().toUpperCase();

    if (kw === "PAUSE") {
      await pauseRemindersUntil(from, 30);
      return xml(`Okay — I’ll pause reminders for 30 day(s). Reply "RESUME" anytime.`);
    }
    if (kw === "RESUME" || kw === "START" || kw === "UNSTOP") {
      await pauseRemindersUntil(from, 0);
      return xml("Got it — reminders are back on.");
    }
    if (kw === "STOP") {
      await sb.from("leads").update({ opted_out_at: new Date().toISOString() }).eq("phone", from);
      return xml("You’re opted out. Reply START to re-subscribe.");
    }
    if (kw === "HELP") {
      return xml("Help: Reply RESUME to re-enable reminders. Reply STOP to opt out.");
    }

    // Log inbound first
    await sb.from("messages_in").insert({ from_phone: from, to_phone: to, body }).catch(() => {});

    // AI reply
    let replyText = "Thanks! We’ll follow up shortly.";
    try {
      replyText = await runAi({ fromPhone: from, toPhone: to, userText: body });
    } catch (e) {
      // keep fallback
    }

    // best-effort: persist outbox
    try {
      await sb.from("messages_out").insert({
        from_phone: to,
        to_phone: from,
        body: replyText,
        provider_sid: null,
        provider_status: "queued",
        gate_log: { category: "response", chosen_branch: "ai", via: "twiml" },
        sent_by: "ai",
      });
    } catch {}

    return xml(replyText);
  } catch (e) {
    console.error("INBOUND_ERR", e);
    return xml("Thanks—message received.");
  }
}
