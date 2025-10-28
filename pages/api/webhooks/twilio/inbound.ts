import type { NextApiRequest, NextApiResponse } from "next";

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

async function wasLinkSentInLast24h(accountId: string, toPhone: string): Promise<boolean> {
  try {
    const base = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!base || !key) return false;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const url =
      `${base}/rest/v1/messages_out` +
      `?account_id=eq.${encodeURIComponent(accountId)}` +
      `&to_phone=eq.${encodeURIComponent(toPhone)}` +
      `&created_at=gte.${encodeURIComponent(since)}` +
      `&select=body&order=created_at.desc&limit=50`;

    const r = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return false;
    const rows: Array<{ body?: string }> = await r.json();
    return rows.some(
      (row) => typeof row.body === "string" && CAL_RE.test(row.body!)
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

  // Hard compliance (still allowed while keeping LLM for everything else)
  const low = Body.toLowerCase().replace(/\W+/g, "");
  if (["stop","stopall","unsubscribe","end","quit","cancel","remove"].includes(low)) {
    const msg = "You’re unsubscribed. Reply START to resume.";
    await persistOut(From, To, msg);
    return res
      .status(200)
      .setHeader("Content-Type","text/xml")
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`);
  }
  if (low === "help") {
    const msg = "Help: booking & support via this number. Reply PAUSE to stop; START to resume.";
    await persistOut(From, To, msg);
    return res
      .status(200)
      .setHeader("Content-Type","text/xml")
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`);
  }
  if (low === "pause") {
    const msg = "You’re paused—no more messages. Reply START to resume.";
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
  const accountId =
    process.env.DEFAULT_ACCOUNT_ID ||
    ((req as any)?.body?.account_id as string | undefined) ||
    (typeof req.query.account_id === "string"
      ? req.query.account_id
      : Array.isArray(req.query.account_id)
      ? req.query.account_id[0]
      : undefined) ||
    "11111111-1111-1111-1111-111111111111";
  const inboundBody = typeof Body === "string" ? Body : String(Body || "");
  const isScheduleLike = SCHED_RE.test(inboundBody) || SCHED_RE.test(aiReply);
  const gateHit = bookingLink ? await wasLinkSentInLast24h(accountId, From) : false;

  let finalReply = (aiReply ?? "").toString();
    // Special case: exact “who is this”
  if (/^\s*who\s+is\s+this\??\s*$/i.test(inboundBody)) {
    finalReply = "Charlie from OutboundRevive.";
  }

  // TwiML reply (so the user sees it immediately)
  finalReply = ensureBookingLinkAtEnd(req, finalReply);
  // Flatten whitespace so the SMS is a single clean line (helps tests and carriers)
  finalReply = (finalReply || '').replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(finalReply)}</Message></Response>`;

  // Fire-and-forget persistence
  persistOut(From, To, finalReply).catch(()=>{});

  return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
}

/** Ensure booking link is present and last when inbound looks like scheduling. */
function ensureBookingLinkAtEnd(req: any, finalReply: string): string {
  try {
    const inbound = (req as any)?.body?.Body;
    const inboundText = (typeof inbound === 'string' ? inbound : '').trim();

    // Leave exact whois reply untouched
    if (/^\s*Charlie\s+from\s+Outbound\s*Revive\.\s*$/i.test(finalReply)) return finalReply;

    const scheduleLike = /\b(book|schedule|resched|re\s*book|zoom|call|meet(ing)?|slot|time(s)?|availability|available|tomorrow|today|next\s+week|this\s+week|calendar|calendly)\b/i
      .test(inboundText);

    const bookingLink = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || process.env.CAL_URL || '').trim();
    if (!scheduleLike || !bookingLink) return finalReply;

    // Replace {{booking_link}} token if present
    finalReply = finalReply.replace(/\{\{\s*booking_link\s*\}\}/ig, bookingLink).trim();

    // If no URL is present, append the link; ensure link is last
    if (!/https?:\/\/\S+/i.test(finalReply)) {
      const sep = /[.!?]\s*$/.test(finalReply) || finalReply === '' ? ' ' : ': ';
      finalReply = (finalReply + sep + bookingLink).trim();
    } else {
      // Dedupe and make the last token the link
      const urls = finalReply.match(/https?:\/\/\S+/gi) || [];
      const last = urls[urls.length - 1];
      finalReply = finalReply.replace(/https?:\/\/\S+/gi, '').trim();
      finalReply = (finalReply ? finalReply + ' ' : '') + last;
    }

    // Clamp ≤320 chars while preserving trailing link
    if (finalReply.length > 320) {
      const m = finalReply.match(/\s(https?:\/\/\S+)\s*$/);
      if (m) {
        const link = m[1];
        const head = finalReply.slice(0, Math.max(0, 320 - link.length - 1)).trim();
        finalReply = (head ? head + ' ' : '') + link;
      } else {
        finalReply = finalReply.slice(0, 320);
      }
    }

    return finalReply;
  } catch {
    return finalReply;
  }
}
