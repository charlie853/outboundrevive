import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseServer";

/** Twilio posts x-www-form-urlencoded; we must disable Next's JSON parser. */
export const config = { api: { bodyParser: false } };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL   = process.env.OPENAI_MODEL || "gpt-4o-mini";

const BOOKING =
  (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || process.env.CAL_URL || "").trim();
const SYS_PROMPT = (process.env.SMS_SYSTEM_PROMPT || "").trim();
const BRAND      = "OutboundRevive";
const ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// === SMS post-processing helpers (humanize + link rules) ===
const SCHED_RE = /\b(zoom|call|meet|meeting|book|schedule|resched|availability|available|time|slot|tomorrow|today|this week|next week)\b/i;
const CAL_RE = /(https?:\/\/)?([a-z0-9-]+\.)*cal\.com\/\S+/i;

function pickBookingLink(): string {
  return (
    process.env.CAL_BOOKING_URL ||
    process.env.CAL_PUBLIC_URL ||
    process.env.CAL_URL ||
    ""
  ).trim();
}

function stripBannedOpeners(s: string): string {
  return s
    .replace(/^\s*(Happy to help|Got it|Thanks for reaching out)[\s—,-:]*/i, "")
    .trim();
}

function removeThreeBulletTic(s: string): string {
  return s.replace(/3[- ]?bullet( summary)?/gi, "").trim();
}

function extractAnyLink(s: string): string | null {
  const m = s.match(CAL_RE);
  return m ? m[0] : null;
}

function withoutLinks(s: string): string {
  return s.replace(CAL_RE, "").replace(/\s+/g, " ").trim();
}

function ensureContextBlurb(s: string, inbound: string): string {
  // If reply is only a link or empty, prepend a tiny contextual line.
  const trimmed = s.trim();
  const onlyLink = CAL_RE.test(trimmed) && withoutLinks(trimmed) === "";
  if (!onlyLink) return s;

  const leadIn = SCHED_RE.test(inbound)
    ? "Let’s do it—grab a time that works: "
    : "Here you go—book a time that suits you: ";
  const link = extractAnyLink(trimmed) || pickBookingLink();
  return (leadIn + link).trim();
}

function enforceOneLinkAtEnd(msg: string, bookingLink: string): string {
  // Move a single booking link to the very end; strip any duplicates/other links.
  const core = withoutLinks(msg);
  const link = bookingLink || extractAnyLink(msg) || "";
  return (core ? core + " " : "") + (link ? link : "");
}

function clampSms(msg: string, limit = 320): string {
  if (msg.length <= limit) return msg;
  // Preserve link at end if present
  const m = msg.match(/\s(https?:\/\/\S+)\s*$/);
  if (m) {
    const link = m[1];
    const head = msg.slice(0, Math.max(0, limit - link.length - 1)).trim();
    return `${head} ${link}`.trim();
  }
  return msg.slice(0, limit);
}

async function sentBookingLinkInLast24h(
  supabase: typeof supabaseAdmin,
  accountId: string,
  toPhone: string,
  bookingUrl: string
): Promise<boolean> {
  if (!accountId || !toPhone || !bookingUrl) return false;
  try {
    const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("messages_out")
      .select("body,created_at")
      .eq("account_id", accountId)
      .eq("to_phone", toPhone)
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !data) return false;
    return data.some(
      (row) => typeof row.body === "string" && row.body.includes(bookingUrl)
    );
  } catch {
    return false;
  }
}

function postProcessSms(params: {
  aiReply: string;
  inboundBody: string;
  isScheduleLike: boolean;
  gateHit: boolean; // true => sent link in last 24h
  bookingLink: string;
}): string {
  let s = params.aiReply || "";
  s = s.trim();

  // Sanitize phrasing
  s = stripBannedOpeners(s);
  s = removeThreeBulletTic(s);

  // Scheduling behavior
  if (params.isScheduleLike) {
    if (params.gateHit) {
      // Gate hit => do NOT include link; keep the sentence helpful.
      s = withoutLinks(s);
      if (!s) s = "Share two times that work and I’ll confirm.";
    } else {
      // Gate open => ensure one contextual blurb + a single link at end.
      if (!CAL_RE.test(s)) {
        // No link present -> add one
        s = ensureContextBlurb(s || params.bookingLink, params.inboundBody);
      }
      s = enforceOneLinkAtEnd(s, params.bookingLink);
    }
  } else {
    // Non-scheduling: never include raw placeholders; if LLM injected a link, ensure one at end.
    if (CAL_RE.test(s)) s = enforceOneLinkAtEnd(s, params.bookingLink);
  }

  // Final clamp
  s = clampSms(s, 320);
  return s;
}

/** Parse Twilio form body safely */
async function parseTwilioForm(req: NextApiRequest): Promise<{From:string;To:string;Body:string}> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString("utf8");
  const params = new URLSearchParams(raw);
  return {
    From: params.get("From") || "",
    To:   params.get("To")   || "",
    Body: (params.get("Body") || "").trim(),
  };
}

/** Minimal XML escaper for TwiML */
function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Call OpenAI Chat Completions with your system prompt */
async function generateWithLLM(userText: string) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

  const system = [
    SYS_PROMPT,
    `Brand: ${BRAND}.`,
    `booking_link: ${BOOKING || "(none)"} .`,
    `Rules recap: For scheduling intent output **exactly** the booking link only (no extra text).`,
    `For "who is this" output exactly: Charlie from OutboundRevive.`,
    `Max 320 chars. One message. No canned fallbacks.`
  ].filter(Boolean).join("\n");

  const body = {
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: userText }
    ],
    max_tokens: 180
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body)
  });

  const j = await r.json();
  const txt = j?.choices?.[0]?.message?.content?.trim() || "";
  return txt.slice(0, 320);
}

/** Best-effort persist to Supabase (non-blocking) */
async function persistOut(fromPhone: string, toPhone: string, body: string) {
  if (!SUPABASE_URL || !SRK || !ACCOUNT_ID || !body) return;

  const payload = [{
    account_id: ACCOUNT_ID,
    to_phone: fromPhone,
    from_phone: toPhone,
    body,
    sent_by: "ai"
  }];

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/messages_out`, {
    method: "POST",
    headers: {
      "apikey": SRK,
      "Authorization": `Bearer ${SRK}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify(payload)
  });

  const text = await resp.text();
  if (!resp.ok) {
    console.error("messages_out insert failed", resp.status, text);
    return; // don't throw; we already returned TwiML to Twilio
  }

  console.log("messages_out insert ok:", text);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { From, To, Body } = await parseTwilioForm(req);
  const inboundBody = typeof Body === "string" ? Body : String(Body || "");
  const accountId =
    process.env.DEFAULT_ACCOUNT_ID ||
    ((req as any)?.body?.account_id as string | undefined) ||
    (typeof req.query.account_id === "string"
      ? req.query.account_id
      : Array.isArray(req.query.account_id)
      ? req.query.account_id[0]
      : undefined) ||
    "11111111-1111-1111-1111-111111111111";

  const isWhoIsExact = /^\s*who\s+is\s+this\??\s*$/i.test(inboundBody || "");
  if (isWhoIsExact) {
    const finalReply = "Charlie from OutboundRevive.";
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(finalReply)}</Message></Response>`;
    await persistOut(From, To, finalReply);
    res.status(200).setHeader("Content-Type","text/xml").send(twiml);
    return;
  }

  const text = (inboundBody || "").trim();
  const STOP_RX = /^(stop|stopall|unsubscribe|cancel|end|quit|remove)\b/i;
  const PAUSE_RX = /^pause\b/i;

  if (STOP_RX.test(text)) {
    try {
      await supabaseAdmin
        .from("leads")
        .update({
          opted_out: true,
          last_reply_body: inboundBody,
          last_inbound_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .eq("phone", From);
    } catch (err) {
      console.error("lead opt-out update failed", err);
    }

    const msg = "You’re opted out and won’t receive further messages. Reply START to resume.";
    await persistOut(From, To, msg);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
    res.status(200).setHeader("Content-Type","text/xml").send(twiml);
    return;
  }

  if (PAUSE_RX.test(text)) {
    const msg = "Okay—pausing messages. Reply START to resume anytime.";
    await persistOut(From, To, msg);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
    res.status(200).setHeader("Content-Type","text/xml").send(twiml);
    return;
  }

  try {
    const { data: leadRow } = await supabaseAdmin
      .from("leads")
      .select("opted_out")
      .eq("account_id", accountId)
      .eq("phone", From)
      .limit(1)
      .maybeSingle();
    if (leadRow?.opted_out) {
      res
        .status(200)
        .setHeader("Content-Type", "text/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      return;
    }
  } catch (err) {
    console.error("lead opt-out lookup failed", err);
  }

  const low = inboundBody.toLowerCase().replace(/\W+/g, "");
  if (low === "help") {
    const msg = "Help: booking & support via this number. Reply PAUSE to stop; START to resume.";
    await persistOut(From, To, msg);
    return res
      .status(200)
      .setHeader("Content-Type","text/xml")
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`);
  }

  // LLM-only logic for everything else:
  let aiReply = (await generateWithLLM(Body) || "").trim();

  const bookingLink = pickBookingLink();

  if (bookingLink) {
    aiReply = aiReply
      .replace(/\$\{\s*cal_booking_url\s*\}/gi, bookingLink)
      .replace(/\$\{\s*booking_link\s*\}/gi, bookingLink)
      .replace(/\{\{\s*booking_link\s*\}\}/gi, bookingLink)
      .replace(/\{\{\s*CAL_URL\s*\}\}/gi, bookingLink);
  }

  // === POST-PROCESS LLM TEXT BEFORE TwiML ===
  const isScheduleLike = SCHED_RE.test(inboundBody) || SCHED_RE.test(aiReply);
  let gateHit = false;
  if (isScheduleLike && bookingLink) {
    gateHit = await sentBookingLinkInLast24h(supabaseAdmin, accountId, From, bookingLink);
  }

  let finalReply = postProcessSms({
    aiReply,
    inboundBody,
    isScheduleLike,
    gateHit,
    bookingLink,
  });

  // Flatten whitespace so the SMS is a single clean line (helps tests and carriers)
  finalReply = (finalReply || "").replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();

  const logPayload = {
    route: "twilio/inbound",
    from: From,
    to: To,
    identify_exact: isWhoIsExact,
    schedule_like: isScheduleLike,
    gated: isScheduleLike ? gateHit : undefined,
    final_has_link: /\bhttps?:\/\/\S+$/.test(finalReply),
    sample_final: finalReply.slice(0, 160),
  };
  console.log(JSON.stringify(logPayload));

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(finalReply)}</Message></Response>`;

  // Fire-and-forget persistence
  persistOut(From, To, finalReply).catch(()=>{});

  return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
}
