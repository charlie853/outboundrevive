import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { countSegments } from "@/lib/messaging/segments";
import { toE164US } from "@/lib/phone";
import { determineLeadBucket } from "@/lib/leads/classify";
import * as fs from "fs";
import * as path from "path";

/** Twilio posts x-www-form-urlencoded; we must disable Next's JSON parser. */
export const config = { api: { bodyParser: false } };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";

// Booking link priority: Use 30-min intro call link, never the secret link
// Priority order: BOOKING_URL > CAL_BOOKING_URL > CAL_PUBLIC_URL (skip CAL_URL if it's a secret link)
const BOOKING_LINK = (() => {
  const candidates = [
    process.env.BOOKING_URL,
    process.env.CAL_BOOKING_URL,
    process.env.CAL_PUBLIC_URL,
  ].filter(Boolean).map(s => s!.trim());
  
  // Filter out any secret links
  const validLink = candidates.find(link => !link.includes('/secret/'));
  if (validLink) {
    console.log('[inbound] Using booking link:', validLink.slice(0, 50) + '...');
    return validLink;
  }
  
  // If all links are secret links, log warning and return empty
  if (candidates.length > 0) {
    console.warn('[inbound] All booking links contain /secret/, not using any link');
  }
  return '';
})();

const BRAND = process.env.BRAND || "OutboundRevive";
const ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Florida & Oklahoma NPAs for state-specific caps
const FL_NPAS = new Set(['239', '305', '321', '352', '386', '407', '561', '727', '754', '772', '786', '813', '850', '863', '904', '941', '954']);
const OK_NPAS = new Set(['405', '539', '580', '918']);

// === Load System Prompt (no caching - always fresh) ===
function loadSystemPrompt(): string {
  // 1. Try file first (version-controlled source of truth)
  try {
    const filePath = path.join(process.cwd(), "prompts", "sms_system_prompt.md");
    const content = fs.readFileSync(filePath, "utf8");
    console.log("Loaded system prompt from file, length:", content.length);
    return content;
  } catch (err) {
    console.error("Failed to load system prompt from file:", err);
  }
  
  // 2. Fallback to env if file not found
  if (process.env.SMS_SYSTEM_PROMPT) {
    console.log("Using SMS_SYSTEM_PROMPT from env (fallback)");
    return process.env.SMS_SYSTEM_PROMPT;
  }
  
  // 3. Final fallback
  return "You are Charlie from OutboundRevive. Be brief, helpful, and book appointments.";
}

// === Template Variable Substitution ===
function applyTemplateVars(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value || "");
  }
  return result;
}

// === Generate next time slots ===
function generateTimeSlots(): { time1: string; time2: string } {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0); // 2 PM
  
  const dayAfter = new Date(now);
  dayAfter.setDate(dayAfter.getDate() + 2);
  dayAfter.setHours(10, 0, 0, 0); // 10 AM
  
  const fmt = (d: Date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const hrs = d.getHours();
    const ampm = hrs >= 12 ? 'p' : 'a';
    const hr12 = hrs % 12 || 12;
    return `${days[d.getDay()]} ${hr12}${ampm}`;
  };
  
  return { time1: fmt(tomorrow), time2: fmt(dayAfter) };
}

// === JSON Output Contract ===
type LLMOutputContract = {
  intent?: string;
  confidence?: number;
  message: string;
  needs_footer?: boolean;
  actions?: Array<{type: string; [key: string]: any}>;
  hold_until?: string | null;
  policy_flags?: {
    quiet_hours_block?: boolean;
    state_cap_block?: boolean;
    footer_appended?: boolean;
    opt_out_processed?: boolean;
  };
};

// === Parse Twilio form ===
type ParsedTwilioForm = {
  From: string;
  To: string;
  Body: string;
  MessageSid?: string;
};

async function parseTwilioForm(req: NextApiRequest): Promise<ParsedTwilioForm> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString("utf8");
  const params = new URLSearchParams(raw);
  return {
    From: params.get("From") || "",
    To: params.get("To") || "",
    Body: (params.get("Body") || "").trim(),
    MessageSid: params.get("MessageSid") || params.get("SmsSid") || undefined,
  };
}

// === XML escaper for TwiML ===
function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function insertWithOptionalSegments(
  table: 'messages_in' | 'messages_out',
  row: Record<string, any>
) {
  let payload = { ...row };
  let { data, error } = await supabaseAdmin.from(table).insert([payload]);

  if (error && typeof error.message === 'string' && error.message.includes("'segments'")) {
    console.warn(`[twilio/inbound] ${table} insert retry without segments column`, error.message);
    const { segments, ...rest } = payload;
    ({ data, error } = await supabaseAdmin.from(table).insert([rest]));
  }

  return { data, error };
}

// === Check if intro is needed (thread context) ===
async function needsIntro(leadId: string): Promise<boolean> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabaseAdmin
      .from("messages_out")
      .select("body,created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(5);
    
    if (!data || data.length === 0) return true; // First message
    
    // Check if last message was >30 days ago
    if (data[0].created_at && new Date(data[0].created_at) < new Date(thirtyDaysAgo)) {
      return true;
    }
    
    // Check if we already introduced in recent messages
    const hasRecentIntro = data.some(msg => 
      msg.body?.includes("Charlie from OutboundRevive")
    );
    
    return !hasRecentIntro;
  } catch {
    return true; // Default to introducing if can't check
  }
}

// === Check if footer is needed based on last_footer_at ===
async function needsFooter(leadId: string): Promise<boolean> {
  try {
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("last_footer_at")
      .eq("id", leadId)
      .maybeSingle();
    
    if (!lead) return true; // Default to true if lead not found
    
    // If never sent footer, need it now
    if (!lead.last_footer_at) return true;
    
    // Check if 30+ days since last footer
    const lastFooterDate = new Date(lead.last_footer_at);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    return lastFooterDate < thirtyDaysAgo;
  } catch (err) {
    console.error("needsFooter check failed:", err);
    return true; // Default to adding footer on error
  }
}

// === Check quiet hours ===
function isQuietHours(phone: string): boolean {
  // Extract NPA (area code)
  const npa = phone.replace(/^\+?1?/, "").slice(0, 3);
  const isFlOrOk = FL_NPAS.has(npa) || OK_NPAS.has(npa);
  
  // For simplicity, using UTC hour as proxy (production should use proper timezone)
  const hour = new Date().getUTCHours();
  
  // FL/OK: 8a-8p = hours 13-1 UTC (EST-5), others 8a-9p
  if (isFlOrOk) {
    return hour < 13 || hour >= 1; // Simplified check
  }
  return hour < 13 || hour >= 2;
}

// === Check daily cap ===
async function checkDailyCap(leadId: string, phone: string): Promise<boolean> {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, count } = await supabaseAdmin
      .from("messages_out")
      .select("id", { count: "exact", head: false })
      .eq("lead_id", leadId)
      .gte("created_at", since24h);
    
    const npa = phone.replace(/^\+?1?/, "").slice(0, 3);
    const isFlOrOk = FL_NPAS.has(npa) || OK_NPAS.has(npa);
    
    const cap = isFlOrOk ? 3 : 1;
    return (count || 0) >= cap;
  } catch {
    return false; // Don't block on error
  }
}

// === Check if sent booking link in last 24h ===
async function sentBookingLinkInLast24h(leadId: string, bookingUrl: string): Promise<boolean> {
  if (!leadId || !bookingUrl) return false;
  try {
    const sinceISO = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("messages_out")
      .select("body,created_at")
      .eq("lead_id", leadId)
      .gte("created_at", sinceISO)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error || !data) return false;
    return data.some(row => typeof row.body === "string" && row.body.includes(bookingUrl));
  } catch {
    return false;
  }
}

// === Get recent thread context ===
async function getThreadContext(leadId: string, inboundText: string): Promise<string> {
  try {
    const { data: messages } = await supabaseAdmin
      .from("messages_out")
      .select("body,created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(3);
    
    if (!messages || messages.length === 0) {
      return `New inbound from lead: "${inboundText}"`;
    }
    
    const thread = messages.reverse().map(m => `AI: ${m.body}`).join("\n");
    return `Thread:\n${thread}\nNew inbound: "${inboundText}"`;
  } catch {
    return `Inbound: "${inboundText}"`;
  }
}

// === Call LLM with JSON output contract ===
async function generateWithLLM(
  userContext: string,
  templateVars: Record<string, string>,
  needsIntroFlag: boolean
): Promise<LLMOutputContract> {
  if (!OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY missing");
    throw new Error("OPENAI_API_KEY missing");
  }

  const systemPrompt = applyTemplateVars(loadSystemPrompt(), templateVars);
  console.log("System prompt loaded, length:", systemPrompt.length, "first 200 chars:", systemPrompt.slice(0, 200));
  
  const systemWithContext = `${systemPrompt}\n\nContext: needs_intro=${needsIntroFlag}\n\nIMPORTANT: You MUST return valid JSON matching this exact structure:\n{\n  "intent": "book|pricing_request|availability|general|...",\n  "confidence": 0.8,\n  "message": "your response text here",\n  "needs_footer": true,\n  "actions": [],\n  "hold_until": null,\n  "policy_flags": {}\n}`;

  const body = {
    model: LLM_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemWithContext },
      { role: "user", content: userContext }
    ],
    max_tokens: 400
  };

  console.log("Calling OpenAI with model:", LLM_MODEL, "context:", userContext.slice(0, 100));

  let attempt = 0;
  while (attempt < 2) {
    attempt++;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
      headers: { 
        "Content-Type": "application/json", 
        "Authorization": `Bearer ${OPENAI_API_KEY}` 
      },
    body: JSON.stringify(body)
  });

    if (!r.ok) {
      const errText = await r.text();
      console.error("OpenAI API error:", r.status, errText);
      throw new Error(`OpenAI API failed: ${r.status}`);
    }

  const j = await r.json();
    const rawText = j?.choices?.[0]?.message?.content?.trim() || "{}";
    
    console.log("LLM raw response (attempt", attempt, "):", rawText.slice(0, 200));
    
    try {
      const parsed = JSON.parse(rawText) as LLMOutputContract;
      if (parsed.message && parsed.message.length > 0) {
        console.log("Successfully parsed LLM output:", { intent: parsed.intent, msg_len: parsed.message.length });
        return parsed;
      } else {
        console.warn("Parsed JSON but no message field");
      }
    } catch (parseErr) {
      console.error("LLM JSON parse failed, attempt", attempt, "error:", parseErr, "raw:", rawText.slice(0, 300));
      if (attempt === 1) {
        // Re-ask for valid JSON
        body.messages.push(
          { role: "assistant", content: rawText },
          { role: "user", content: "Return ONLY valid JSON matching the output contract structure. Include the 'message' field with your response text." }
        );
        continue;
      }
    }
  }
  
  // Final fallback - try to be context-aware
  console.error("LLM failed after 2 attempts, using context-aware fallback");
  
  // Extract intent from user context for better fallback
  const contextLower = userContext.toLowerCase();
  let fallbackMsg = "Appreciate the reply. I’m here if you need anything.";
  
  if (contextLower.includes("price") || contextLower.includes("cost") || contextLower.includes("much")) {
    fallbackMsg = "Totally get it—plans start at $299/mo and scale with volume. Want a quick rundown?";
  } else if (contextLower.includes("book") || contextLower.includes("schedule") || contextLower.includes("call") || contextLower.includes("time")) {
    const linkLine = templateVars.booking_link
      ? `Can hold ${templateVars.time1 || 'tomorrow afternoon'} or ${templateVars.time2 || 'later this week'}, or grab a spot here: ${templateVars.booking_link}`
      : "I can set something up—any times that work well for you?";
    fallbackMsg = linkLine;
  } else if (contextLower.includes("who") || contextLower.includes("what is this")) {
    fallbackMsg = `Charlie from OutboundRevive here—helping ${templateVars.brand} keep follow-ups quick and off your plate. Happy to keep this easy for you.`;
  } else {
    fallbackMsg = "All good—I’m here to help revive old leads and free up your team whenever you’re ready.";
  }
  
  return {
    intent: "fallback",
    confidence: 0,
    message: fallbackMsg,
    needs_footer: true
  };
}

// === Post-process message ===
function postProcessMessage(
  msg: string,
  bookingLink: string,
  gateHit: boolean
): string {
  let s = msg.trim();
  
  // Strip robotic openers
  s = s.replace(/^\s*(Happy to help|Got it|Thanks for reaching out)[\s—,-:]*/i, "").trim();
  
  // Remove filler like "I hope you're doing well"
  s = s.replace(/i hope you(?:'| a)re doing (?:well|great)[,!.\s]*/gi, '').trim();
  s = s.replace(/hope your (?:day|week)(?: is)? going (?:well|great)[,!.\s]*/gi, '').trim();
  s = s.replace(/chat about your goals/gi, '').trim();
  s = s.replace(/checking in to see if now is a better time/gi, '').trim();
  s = s.replace(/i know timing can be tricky[—\-]?\s*/gi, '').trim();
  s = s.replace(/timing can be tricky[—\-]?\s*/gi, '').trim();

  // If gate hit (sent link in last 24h), remove any booking link
  if (gateHit && bookingLink) {
    s = s.replace(new RegExp(bookingLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), "").trim();
    s = s.replace(/\s+/g, " ");
  }
  
  // Enforce link-last rule if link present
  if (bookingLink && s.includes(bookingLink)) {
    const core = s.replace(new RegExp(bookingLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), "").trim();
    s = core ? `${core} ${bookingLink}` : bookingLink;
  }
  
  // Clamp to 320 chars, preserving link at end
  if (s.length > 320) {
    const linkMatch = s.match(/\s(https?:\/\/\S+)\s*$/);
    if (linkMatch) {
      const link = linkMatch[1];
      const head = s.slice(0, Math.max(0, 320 - link.length - 1)).trim();
      s = `${head} ${link}`.trim();
    } else {
      s = s.slice(0, 320);
    }
  }
  
  // Flatten whitespace
  s = s.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();

  if (!s) {
    s = "Appreciate the reply—happy to help you automate follow-ups. Anything specific you want to tackle?";
  }
  
  return s;
}

export const __test__ = {
  postProcessMessage,
};

// === Persist INBOUND message to messages_in ===
async function persistIn(
  leadId: string,
  body: string,
  fromPhone: string,
  toPhone: string,
  accountId: string,
  providerSid?: string | null,
  createdAt?: string | null
) {
  if (!leadId || !body || !accountId) return;

  try {
    const segments = countSegments(body || "");
    const createdAtIso = createdAt && !Number.isNaN(Date.parse(createdAt))
      ? new Date(createdAt).toISOString()
      : new Date().toISOString();

    console.log("[twilio/inbound] persistIn attempt", {
      leadId,
      accountId,
      providerSid,
      createdAtIso,
      segments,
    });

    const { error } = await insertWithOptionalSegments("messages_in", {
      lead_id: leadId,
      account_id: accountId,
      body,
      provider_sid: providerSid ?? null,
      provider_from: fromPhone,
      provider_to: toPhone,
      created_at: createdAtIso,
      segments
    });

    if (error) {
      console.error("messages_in insert failed:", error);
      return;
    } else {
      console.log("messages_in insert ok for lead", leadId);
      try {
        const { data: latest } = await supabaseAdmin
          .from("messages_in")
          .select("id, created_at, account_id, provider_sid")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false })
          .limit(1);
        console.log("[twilio/inbound] latest messages_in row", latest?.[0]);
      } catch (debugErr) {
        console.error("[twilio/inbound] failed to load latest messages_in row", debugErr);
      }
      try {
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from('leads')
          .update({
            last_reply_body: body,
            last_reply_at: nowIso,
            last_inbound_at: nowIso,
            replied: true,
          })
          .eq('id', leadId);
      } catch (updateErr) {
        console.error('Failed to update lead reply metadata:', updateErr);
      }
      // Increment tenant_billing.segments_used for inbound, counting toward cap
      try {
        const nowIso = new Date().toISOString();
        const { data: bill } = await supabaseAdmin
          .from('tenant_billing')
          .select('segments_used')
          .eq('account_id', accountId)
          .maybeSingle();
        if (bill) {
          await supabaseAdmin
            .from('tenant_billing')
            .update({ segments_used: (bill.segments_used || 0) + segments, updated_at: nowIso })
            .eq('account_id', accountId);
        }
      } catch (capErr) {
        console.error('tenant_billing inbound update failed', capErr);
      }
    }
  } catch (err) {
    console.error("persistIn error:", err);
  }
}

// === Persist outbound message and update last_footer_at ===
async function persistOut(leadId: string, body: string, needsFooterFlag: boolean, accountId: string) {
  if (!SUPABASE_URL || !SRK || !body || !leadId || !accountId) return;

  try {
    const finalBody = needsFooterFlag && !body.includes("Reply PAUSE")
      ? `${body} Reply PAUSE to stop`
      : body;
    const segments = countSegments(finalBody);

    const { error } = await insertWithOptionalSegments("messages_out", {
      lead_id: leadId,
      account_id: accountId,
      body: finalBody,
      sent_by: "ai",
      segments,
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error("messages_out insert failed", error);
      return;
    }

    console.log("messages_out insert ok");
    
    // Update last_footer_at if footer was added
    if (needsFooterFlag && finalBody.includes("Reply PAUSE")) {
      await supabaseAdmin
        .from("leads")
        .update({ last_footer_at: new Date().toISOString() })
        .eq("id", leadId);
      console.log("Updated last_footer_at for lead", leadId);
    }
  } catch (err) {
    console.error("persistOut error:", err);
  }
}

// === Main handler ===
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { From, To, Body, MessageSid } = await parseTwilioForm(req);
  const FromE164 = toE164US(From) || From;
  const ToE164 = toE164US(To) || To;
  const inboundBody = typeof Body === "string" ? Body : String(Body || "");
  let accountId = ACCOUNT_ID || "11111111-1111-1111-1111-111111111111";

  // Get or create lead
  let leadId: string | null = null;
  let firstName = "there";
  
  let leadRecord: any = null;
  try {
    console.log("Looking up lead by phone:", FromE164);
    const { data, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id,name,opted_out,account_id,lead_type,crm_status,crm_stage,crm_description,crm_owner,crm_owner_email,crm_last_activity_at,last_inbound_at,last_sent_at,company")
      .eq("phone", FromE164)
      .maybeSingle();

    if (leadError) {
      console.error("Lead lookup error:", leadError);
    }

    leadRecord = data ?? null;

    if (leadRecord) {
      console.log("Lead found:", leadRecord.id, leadRecord.name);
      leadId = leadRecord.id;
      firstName = (leadRecord.name || "").split(" ")[0] || "there";
      if (leadRecord.account_id) {
        accountId = leadRecord.account_id;
      }

      if (leadRecord.opted_out) {
        console.log("Lead has opted out, returning empty TwiML");
        res.status(200).setHeader("Content-Type", "text/xml")
          .send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
        return;
      }
    } else {
      console.log("No lead found in query result");
    }
  } catch (err) {
    console.error("lead lookup failed with exception:", err);
  }
  
  if (!leadId) {
    console.error("No lead found for phone:", From, "account_id:", accountId);
    const msg = "Thanks for reaching out. We'll get back to you shortly.";
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
    return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
  }

  // === PERSIST INBOUND MESSAGE ===
  // Save every inbound message to messages_in table so it shows in threads
  await persistIn(leadId, inboundBody, FromE164, ToE164, accountId, MessageSid);

  // === Handle compliance keywords ===
  const text = inboundBody.trim().toLowerCase().replace(/\W+/g, "");
  
  if (/^(stop|stopall|unsubscribe|cancel|end|quit|remove)/.test(text)) {
    try {
      const { data: updateResult } = await supabaseAdmin
        .from("leads")
        .update({
          opted_out: true,
          last_reply_body: inboundBody,
          last_inbound_at: new Date().toISOString(),
        })
        .eq("id", leadId)
        .select();
      
      if (updateResult && updateResult.length > 0) {
        console.log("STOP: opted out lead", leadId);
      } else {
        console.warn("STOP: update returned no rows for lead", leadId);
      }
    } catch (err) {
      console.error("STOP: update failed", err);
    }

    const msg = "You're paused and won't receive further messages. Reply START to resume.";
    await persistOut(leadId, msg, false, accountId);
    // Cancel queued cadence runs for this lead
    try {
      await supabaseAdmin
        .from('cadence_runs')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: 'opt_out' })
        .eq('lead_id', leadId)
        .eq('status', 'scheduled');
    } catch (e) { console.error('cancel cadence_runs on STOP failed', e); }
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
    return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
  }

  if (/^pause/.test(text)) {
    const msg = "You're paused and won't receive further messages. Reply START to resume.";
    await persistOut(leadId, msg, false, accountId);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
    return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
  }

  if (text === "help") {
    const msg = "Help: booking & support via this number. Reply PAUSE to stop. Reply START to resume.";
    await persistOut(leadId, msg, false, accountId);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
    return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
  }

  if (text === "start") {
    try {
      await supabaseAdmin
        .from('leads')
        .update({ opted_out: false, last_inbound_at: new Date().toISOString(), last_reply_body: inboundBody })
        .eq('id', leadId);
    } catch (e) { console.error('START update failed', e); }
    const msg = "You're resumed. How can I help with scheduling or questions?";
    await persistOut(leadId, msg, false, accountId);
    const twiml = `<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
    return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
  }

  // === Check quiet hours & daily caps (non-reply mode) ===
  // For inbound replies, we skip these checks
  const isInboundReply = true; // This is an inbound webhook, so it's always a reply context
  
  if (!isInboundReply) {
    if (isQuietHours(From)) {
      console.log("Quiet hours block for", From);
      res.status(200).setHeader("Content-Type", "text/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
    return;
  }

    if (await checkDailyCap(leadId, From)) {
      console.log("Daily cap hit for", leadId);
      res.status(200).setHeader("Content-Type", "text/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      return;
    }
  }

  // === Generate LLM response ===
  const needsIntroFlag = await needsIntro(leadId);
  const needsFooterFlag = await needsFooter(leadId);
  const { time1, time2 } = generateTimeSlots();
  
  // Prepare lead context variables BEFORE using them in templateVars
  const leadBucket = determineLeadBucket({
    lead_type: leadRecord?.lead_type,
    crm_status: leadRecord?.crm_status,
    crm_stage: leadRecord?.crm_stage,
    crm_description: leadRecord?.crm_description,
  });
  const leadStatus = leadRecord?.crm_status?.trim() || "";
  const leadStage = leadRecord?.crm_stage?.trim() || "";
  const leadNotes = leadRecord?.crm_description?.trim() || "";
  const leadOwner = leadRecord?.crm_owner?.trim() || "";
  
  const templateVars: Record<string, string> = {
    brand: BRAND,
    first_name: firstName,
    lead_first_name: firstName,
    booking_link: BOOKING_LINK,
    time1,
    time2,
    service: "appointment scheduling", // Could be dynamic
    pricing_range: "$299-$599/mo",
    key_factors: "volume and features",
    entry_option: "Lite at $299/mo",
    differentiator: "AI-powered lead revival",
    "insurers/financing": "major providers",
    lead_bucket: leadBucket.label,
    lead_bucket_reason: leadBucket.reason,
    lead_status: leadStatus,
    lead_stage: leadStage,
    lead_notes: leadNotes,
    lead_owner: leadOwner,
  };

  const baseThreadContext = await getThreadContext(leadId, inboundBody);
  const bucketContextSegments = [
    `Lead bucket: ${leadBucket.label}`,
    leadBucket.reason ? `Bucket rationale: ${leadBucket.reason}` : '',
    leadStatus ? `CRM status: ${leadStatus}` : '',
    leadStage ? `CRM stage: ${leadStage}` : '',
    leadOwner ? `Owner: ${leadOwner}` : '',
    leadNotes ? `CRM notes: ${leadNotes}` : '',
  ].filter(Boolean);
  const llmContext = [bucketContextSegments.join('\n'), baseThreadContext].filter(Boolean).join('\n\n');
  let llmOutput: LLMOutputContract;
  
  try {
    llmOutput = await generateWithLLM(llmContext, templateVars, needsIntroFlag);
    console.log("LLM output:", JSON.stringify({ intent: llmOutput.intent, message_length: llmOutput.message?.length }));
  } catch (err) {
    console.error("LLM generation failed:", err);
    
    // Context-aware fallback
    const inboundLower = inboundBody.toLowerCase();
    let fallbackMsg = "Thanks for reaching out.";
    
    if (inboundLower.includes("price") || inboundLower.includes("cost") || inboundLower.includes("much")) {
      fallbackMsg = `Happy to help with pricing. We have plans from $299/mo. Want me to share details or grab a time to chat? ${BOOKING_LINK || ''}`.trim();
    } else if (inboundLower.includes("book") || inboundLower.includes("schedule") || inboundLower.includes("call") || inboundLower.includes("time")) {
      fallbackMsg = `Let's schedule a time. ${BOOKING_LINK || 'Reply with two times that work for you.'}`.trim();
    } else if (inboundLower.includes("who") || inboundLower.includes("what is this")) {
      fallbackMsg = `It's Charlie from OutboundRevive with ${BRAND}—following up on your earlier inquiry. Happy to help schedule a time or answer questions.`;
    } else {
      fallbackMsg = `Thanks for the message. I can help with scheduling or answer questions about ${BRAND}. What works best for you?`;
    }
    
    llmOutput = {
      message: fallbackMsg,
      needs_footer: true
    };
  }

  // === No link gate - always send link if present ===
  const linkGateHit = false; // User wants links sent every time

  // === Post-process ===
  let finalMessage = postProcessMessage(llmOutput.message, BOOKING_LINK, linkGateHit);
  
  // Apply footer if needed - ONLY use server-side logic (ignore LLM needs_footer)
  // Server handles 30-day gating via needsFooterFlag
  const shouldAddFooter = needsFooterFlag;

  // === Log & persist ===
  console.log(JSON.stringify({
    route: "twilio/inbound",
    lead_id: leadId,
    from: From,
    intent: llmOutput.intent,
    needs_intro: needsIntroFlag,
    needs_footer: shouldAddFooter,
    link_gated: linkGateHit,
    final_length: finalMessage.length
  }));

  await persistOut(leadId, finalMessage, shouldAddFooter, accountId);

  // TwiML response
  const twimlBody = shouldAddFooter && !finalMessage.includes("Reply PAUSE")
    ? `${finalMessage} Reply PAUSE to stop`
    : finalMessage;
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(twimlBody)}</Message></Response>`;
  return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
}
