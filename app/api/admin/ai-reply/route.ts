import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabaseAdmin";
import { sendSms } from "@/lib/sms";
import { runAi } from "@/lib/runAi";
import { addFooter } from "@/lib/messagingCompliance";
import { pickGentleReminder, renderIntro, firstNameOf as parseFirstName } from "@/lib/reminderTemplates";

export const dynamic = "force-dynamic";

function firstNameOf(name?: string | null) {
  const parsed = parseFirstName(name);
  return parsed ?? null;
}

function decodeUtf8(b64?: string | null) {
  if (!b64) return "";
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

type LeadDetails = {
  leadId: string | null;
  firstName: string | null;
  fullName: string | null;
  reminderPauseUntil: Date | null;
};

async function getLeadFirstName(sb: any, phone: string): Promise<LeadDetails> {
  const { data } = await sb
    .from("leads")
    .select("id,name,reminder_pause_until")
    .eq("phone", phone)
    .maybeSingle();

  return {
    leadId: data?.id ?? null,
    fullName: data?.name ?? null,
    firstName: firstNameOf(data?.name) ?? null,
    reminderPauseUntil: data?.reminder_pause_until ? new Date(data.reminder_pause_until) : null,
  };
}

async function isNewThread(sb: any, phone: string) {
  const sinceIso = new Date(Date.now() - 7 * 864e5).toISOString();

  const [outRes, inRes] = await Promise.all([
    sb
      .from("messages_out")
      .select("provider_sid", { count: "exact", head: true })
      .eq("to_phone", phone)
      .gte("created_at", sinceIso),
    sb
      .from("messages_in")
      .select("provider_sid", { count: "exact", head: true })
      .eq("from_phone", phone)
      .gte("created_at", sinceIso),
  ]);

  const outCount = typeof outRes?.count === "number" ? outRes.count : Array.isArray(outRes?.data) ? outRes.data.length : 0;
  const inCount = typeof inRes?.count === "number" ? inRes.count : Array.isArray(inRes?.data) ? inRes.data.length : 0;
  return (outCount + inCount) === 0;
}

export async function POST(req: NextRequest) {
  const adminKey = (req.headers.get("x-admin-key") || "").trim();
  if (!process.env.ADMIN_API_KEY || adminKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const debug = req.headers.get("x-debug") === "1";
  const sendContextRaw = req.headers.get("x-send-context") || "";
  const sendContext = sendContextRaw ? sendContextRaw.toLowerCase() : undefined;
  const fixedB64 = req.headers.get("x-fixed-reply-b64");
  const fixedHeader = req.headers.get("x-fixed-reply");
  const reminderSeqHeader = req.headers.get("x-reminder-seq");
  const parsedReminderSeq = reminderSeqHeader ? Number.parseInt(reminderSeqHeader, 10) : NaN;
  const reminderSeq = Number.isFinite(parsedReminderSeq) && parsedReminderSeq > 0 ? parsedReminderSeq : undefined;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const from = typeof body.from === "string" ? body.from.trim() : ""; // lead phone
  const to = typeof body.to === "string" ? body.to.trim() : ""; // our number
  const inboundText = typeof body.body === "string" ? body.body : "";

  if (!from || !to) {
    return NextResponse.json({ ok: false, error: "missing from/to" }, { status: 400 });
  }

  const fixedReply = (() => {
    const decoded = decodeUtf8(fixedB64);
    if (decoded) return decoded.trim();
    if (typeof fixedHeader === "string" && fixedHeader.trim()) return fixedHeader.trim();
    if (typeof body.fixed_reply === "string" && body.fixed_reply.trim()) return body.fixed_reply.trim();
    if (typeof body.fixed_reply_b64 === "string") {
      const decodedBody = decodeUtf8(body.fixed_reply_b64);
      if (decodedBody) return decodedBody.trim();
    }
    return "";
  })();

  const sb = createClient();

  const [leadDetails, newThread] = await Promise.all([
    getLeadFirstName(sb, from),
    isNewThread(sb, from),
  ]);

  if (sendContext === "reminder" && leadDetails.reminderPauseUntil && leadDetails.reminderPauseUntil.getTime() > Date.now()) {
    return NextResponse.json({ ok: true, held: true, reason: "paused" });
  }

  let chosen_branch: "fixed" | "intro" | "reminder" | "ai" = "ai";
  let text = "";

  if (fixedReply) {
    chosen_branch = "fixed";
    text = fixedReply;
  } else if (sendContext === "reminder") {
    chosen_branch = "reminder";
    text = pickGentleReminder(leadDetails.firstName);
  } else if (newThread || /^\(seed\)\s*hi/i.test(inboundText || "")) {
    chosen_branch = "intro";
    text = renderIntro(leadDetails.firstName);
  } else {
    chosen_branch = "ai";
    try {
      text = await runAi({
        fromPhone: from,
        toPhone: to,
        userText: inboundText,
        firstName: leadDetails.firstName,
        fullName: leadDetails.fullName,
      });
    } catch (err) {
      console.error("runAi failed", err);
      text = "Thanks for reaching out!";
    }
  }

  text = (text || "").trim();
  if (!text) {
    text = "Thanks for reaching out!";
  }

  const requireFooter = chosen_branch === "reminder";
  const finalText = addFooter(text, {
    requireFooter,
    occasionalModulo: 3,
    sentCountHint: reminderSeq,
  });

  const sendResult = await sendSms({ from: to, to: from, body: finalText });

  await sb.from("messages_out").insert({
    provider_sid: (sendResult as any)?.sid ?? null,
    provider_status: (sendResult as any)?.status ?? "queued",
    from_phone: to,
    to_phone: from,
    body: finalText,
    sent_by: "ai",
    gate_log: {
      category: requireFooter ? "reminder" : newThread ? "initial_outreach" : "response",
      chosen_branch,
      reminder_seq: requireFooter ? (reminderSeq ?? null) : null,
      is_new_thread: newThread,
    },
  });

  const payload: any = {
    ok: true,
    reply: finalText,
    chosen_branch,
    isNewThread: newThread,
  };

  if (debug) {
    payload.debug = {
      sendContext,
      reminderSeq: reminderSeq ?? null,
      requireFooter,
      sendResult,
    };
  }

  return NextResponse.json(payload);
}
