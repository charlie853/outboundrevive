export const runtime = 'nodejs';
import { supabaseAdmin } from '@/lib/supabaseServer';
import OpenAI from "openai";

type ORJSON = {
  intent: string;
  confidence: number;
  message: string;
  needs_footer?: boolean;
  actions?: Array<Record<string, any>>;
  hold_until?: string | null;
  policy_flags?: Record<string, boolean>;
};

const SYSTEM = `
You are OutboundRevive’s SMS AI. Return ONLY JSON:
{"intent":"...", "confidence":0-1, "message":"<=320 chars", "needs_footer":true/false, "actions":[]}
Follow the OutboundRevive playbook (compliance, opt-out, quiet hours, caps, tone, booking CTA).
No prose, no backticks—JSON object only.
`;

function stripToJSON(s: string): string | null {
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) {
    const slice = s.slice(i, j + 1);
    try { JSON.parse(slice); return slice; } catch {}
  }
  return null;
}

function simpleFallback(userBody: string, brand: string, link?: string) {
  if (/stop|unsubscribe|quit|end|cancel|remove/i.test(userBody)) {
    return `You’re opted out and won’t receive more messages. Reply START to resubscribe.`;
  }
  if (/price|cost|charge/i.test(userBody)) {
    return `Quick pricing overview from ${brand}: flexible plans based on lead volume. Want me to send a quote?${link ? " " + link : ""}`;
  }
  if (/hubspot|integrate/i.test(userBody)) {
    return `${brand} supports HubSpot for lead sync & notes. Want a 10-min walkthrough?${link ? " " + link : ""}`;
  }
  return `Hey—it’s ${brand}. We help revive old leads with compliant SMS. Want a quick link to book?${link ? " " + link : ""}`;
}

async function fetchThread(from: string, to: string) {
  const { data: inbound } = await supabaseAdmin
    .from("messages_in")
    .select("from_phone,to_phone,body,created_at")
    .or(
      `and(from_phone.eq.${from},to_phone.eq.${to}),and(from_phone.eq.${to},to_phone.eq.${from})`
    )
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: outbound } = await supabaseAdmin
    .from("messages_out")
    .select("body,created_at")
    .order("created_at", { ascending: false })
    .limit(4);

  const convo: Array<{ role: "user" | "assistant"; content: string; at: string; }> = [];
  for (const m of (inbound || []).reverse()) {
    const role = (m as any).from_phone === from ? "user" : "assistant";
    convo.push({ role, content: (m as any).body, at: (m as any).created_at });
  }
  for (const m of (outbound || []).reverse()) {
    convo.push({ role: "assistant", content: (m as any).body, at: (m as any).created_at });
  }
  return convo.slice(-10);
}

export async function generateReply({
  userBody,
  fromPhone,
  toPhone,
  brandName,
  bookingLink
}: {
  userBody: string;
  fromPhone: string;
  toPhone: string;
  brandName: string;
  bookingLink?: string;
}) {
  const disabled = (process.env.LLM_DISABLE || "").trim() === "1";
  if (disabled) {
    return { kind: "text", reason: "llm_disabled", message: simpleFallback(userBody, brandName, bookingLink) } as const;
  }

  const key = (process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    return { kind: "text", reason: "missing_api_key", message: simpleFallback(userBody, brandName, bookingLink) } as const;
  }

  const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  const openai = new OpenAI({ apiKey: key });

  try {
    const thread = await fetchThread(fromPhone, toPhone);

    const response = await openai.responses.create({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      input: [
        {
          role: "system",
          content: [{ type: "text", text: SYSTEM }]
        },
        {
          role: "user",
          content: [{
            type: "text",
            text: JSON.stringify({
              brand: { name: brandName, booking_link: bookingLink || null },
              recent_thread: thread,
              contact_text: userBody
            })
          }]
        }
      ]
    });

    let out = (response as any).output_text
           || (response as any).output?.[0]?.content?.[0]?.text?.value
           || (response as any).choices?.[0]?.message?.content
           || "";

    const jsonText = stripToJSON(String(out)) || String(out);
    const parsed = JSON.parse(jsonText) as ORJSON;

    let msg = (parsed.message || "").slice(0, 320);
    console.log('[ai-reply] used=LLM input=', String(userBody).slice(0, 80));
    return { kind: "json", parsed, message: msg } as const;
  } catch (e: any) {
    return { kind: "text", reason: String(e?.message || e), message: simpleFallback(userBody, brandName, bookingLink) } as const;
  }
}
