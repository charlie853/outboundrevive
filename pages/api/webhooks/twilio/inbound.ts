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
    to_phone: fromPhone,     // replying to sender
    from_phone: toPhone,     // your Twilio number
    body,
    sent_by: "ai"
  }];

  await fetch(`${SUPABASE_URL}/rest/v1/messages_out`, {
    method: "POST",
    headers: {
      "apikey": SRK,
      "Authorization": `Bearer ${SRK}`,
      "Content-Type": "application/json",
      "Prefer": "return=minimal"
    },
    body: JSON.stringify(payload)
  }).catch(() => {});
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
  const aiReply = await generateWithLLM(Body);

  // TwiML reply (so the user sees it immediately)
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(aiReply)}</Message></Response>`;

  // Fire-and-forget persistence
  persistOut(From, To, aiReply).catch(()=>{});

  return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
}
