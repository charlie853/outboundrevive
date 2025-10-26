import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabaseAdmin";
import { runAi } from "@/lib/runAi";

export const dynamic = "force-dynamic";

function twiml(message?: string) {
  if (!message) return `<?xml version="1.0" encoding="UTF-8"?><Response/>`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc(message)}</Message></Response>`;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const form = await req.formData();
  const from = (form.get("From") || "").toString();
  const to = (form.get("To") || "").toString();
  const body = (form.get("Body") || "").toString().trim();
  const norm = body
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  if (!from || !to) {
    return new Response(twiml(), { headers: { "Content-Type": "text/xml" } });
  }

  await supabase
    .from("messages_in")
    .insert({ from_phone: from, to_phone: to, body })
    .catch(() => {});

  if (norm === "PAUSE") {
    const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("leads").update({ reminder_pause_until: until }).eq("phone", from);
    return new Response(twiml(`Okay — I’ll pause reminders for 30 days. Reply RESUME anytime.`), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  if (norm === "RESUME") {
    await supabase
      .from("leads")
      .update({ reminder_pause_until: null, opted_out: false })
      .eq("phone", from);
    return new Response(twiml(`Got it — reminders are back on.`), {
      headers: { "Content-Type": "text/xml" },
    });
  }

  // Silent compliance gates (do not advertise STOP)
  if (["STOP", "UNSUBSCRIBE", "CANCEL", "QUIT", "END"].includes(norm)) {
    await supabase
      .from("leads")
      .update({ reminder_pause_until: null, opted_out: true })
      .eq("phone", from);
    return new Response(twiml(), { headers: { "Content-Type": "text/xml" } });
  }

  if (["START", "UNSTOP"].includes(norm)) {
    await supabase
      .from("leads")
      .update({ reminder_pause_until: null, opted_out: false })
      .eq("phone", from);
    return new Response(twiml(), { headers: { "Content-Type": "text/xml" } });
  }

  if (norm === "HELP") {
    return new Response(
      twiml("Help: reply PAUSE to pause reminders; RESUME to continue. For support, text us here."),
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  // Normal inbound → call AI directly and reply via TwiML
  let reply = "";
  try {
    reply = await runAi({ fromPhone: from, toPhone: to, userText: body });
  } catch (e) {
    reply = "Thanks — happy to help. Want me to share a quick booking link?";
  }

  // Persist an outbound log for traceability (Twilio will deliver this reply)
  try {
    await supabase.from("messages_out").insert({
      from_phone: to,
      to_phone: from,
      body: reply,
      provider_sid: null,
      provider_status: "sent",
      gate_log: { category: "response", chosen_branch: "ai", via: "twiml" },
      sent_by: "ai",
    });
  } catch {}

  return new Response(twiml(reply), { headers: { "Content-Type": "text/xml" } });
}
