import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { countSegments } from "@/lib/messaging/segments";
import { toE164US } from "@/lib/phone";
import * as fs from "fs";
import * as path from "path";

/** Twilio posts x-www-form-urlencoded; we must disable Next's JSON parser. */
export const config = { api: { bodyParser: false } };

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const LLM_MODEL = process.env.LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
const BOOKING_LINK = (process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || process.env.CAL_URL || "").trim();
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
async function parseTwilioForm(req: NextApiRequest): Promise<{From:string;To:string;Body:string}> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString("utf8");
  const params = new URLSearchParams(raw);
  return {
    From: params.get("From") || "",
    To: params.get("To") || "",
    Body: (params.get("Body") || "").trim(),
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
  let fallbackMsg = "Thanks for reaching out.";
  
  if (contextLower.includes("price") || contextLower.includes("cost") || contextLower.includes("much")) {
    fallbackMsg = `Happy to help with pricing. We have plans from $299/mo. Want me to share details or grab a time to chat? ${templateVars.booking_link || ''}`.trim();
  } else if (contextLower.includes("book") || contextLower.includes("schedule") || contextLower.includes("call") || contextLower.includes("time")) {
    fallbackMsg = `Let's schedule a time. ${templateVars.booking_link || 'Reply with two times that work for you.'}`.trim();
  } else if (contextLower.includes("who") || contextLower.includes("what is this")) {
    fallbackMsg = `It's Charlie from OutboundRevive with ${templateVars.brand}—following up on your earlier inquiry. Happy to help schedule a time or answer questions.`;
  } else {
    fallbackMsg = `Thanks for the message. I can help with scheduling or answer questions about ${templateVars.brand}. What works best for you?`;
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
  
  return s;
}

// === Persist INBOUND message to messages_in ===
async function persistIn(leadId: string, body: string, fromPhone: string, toPhone: string) {
  if (!leadId || !body) return;

  try {
    const segments = countSegments(body || "");
    const { error } = await supabaseAdmin
      .from("messages_in")
      .insert({
        lead_id: leadId,
        account_id: ACCOUNT_ID,
        body,
        provider_from: fromPhone,
        provider_to: toPhone,
        created_at: new Date().toISOString(),
        segments
      });

    if (error) {
      console.error("messages_in insert failed:", error);
    } else {
      console.log("messages_in insert ok for lead", leadId);
      // Increment tenant_billing.segments_used for inbound, counting toward cap
      try {
        const nowIso = new Date().toISOString();
        const { data: bill } = await supabaseAdmin
          .from('tenant_billing')
          .select('segments_used')
          .eq('account_id', ACCOUNT_ID)
          .maybeSingle();
        if (bill) {
          await supabaseAdmin
            .from('tenant_billing')
            .update({ segments_used: (bill.segments_used || 0) + segments, updated_at: nowIso })
            .eq('account_id', ACCOUNT_ID);
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
async function persistOut(leadId: string, body: string, needsFooterFlag: boolean) {
  if (!SUPABASE_URL || !SRK || !ACCOUNT_ID || !body || !leadId) return;

  try {
    const finalBody = needsFooterFlag && !body.includes("Reply PAUSE")
      ? `${body} Reply PAUSE to stop`
      : body;
    const segments = countSegments(finalBody);

  const payload = [{
      lead_id: leadId,
    account_id: ACCOUNT_ID,
      body: finalBody,
    sent_by: "ai",
    segments
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

    if (!resp.ok) {
  const text = await resp.text();
    console.error("messages_out insert failed", resp.status, text);
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

  const { From, To, Body } = await parseTwilioForm(req);
  const inboundBody = typeof Body === "string" ? Body : String(Body || "");
  const accountId = ACCOUNT_ID || "11111111-1111-1111-1111-111111111111";

  // Get or create lead
  let leadId: string | null = null;
  let firstName = "there";
  
  try {
    console.log("Looking up lead with account_id:", accountId, "phone:", From);
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .select("id,name,opted_out")
      .eq("account_id", accountId)
      .eq("phone", From)
      .maybeSingle();
    
    if (leadError) {
      console.error("Lead lookup error:", leadError);
    }
    
    if (lead) {
      console.log("Lead found:", lead.id, lead.name);
      leadId = lead.id;
      firstName = (lead.name || "").split(" ")[0] || "there";
      
      // Check opt-out status
      if (lead.opted_out) {
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
  await persistIn(leadId, inboundBody, From, To);

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
    await persistOut(leadId, msg, false);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
    return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
  }

  if (/^pause/.test(text)) {
    const msg = "You're paused and won't receive further messages. Reply START to resume.";
    await persistOut(leadId, msg, false);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
    return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
  }

  if (text === "help") {
    const msg = "Help: booking & support via this number. Reply PAUSE to stop. Reply START to resume.";
    await persistOut(leadId, msg, false);
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(msg)}</Message></Response>`;
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
  
  const templateVars: Record<string, string> = {
    brand: BRAND,
    first_name: firstName,
    booking_link: BOOKING_LINK,
    time1,
    time2,
    service: "appointment scheduling", // Could be dynamic
    pricing_range: "$299-$599/mo",
    key_factors: "volume and features",
    entry_option: "Lite at $299/mo",
    differentiator: "AI-powered lead revival",
    "insurers/financing": "major providers"
  };

  const threadContext = await getThreadContext(leadId, inboundBody);
  let llmOutput: LLMOutputContract;
  
  try {
    llmOutput = await generateWithLLM(threadContext, templateVars, needsIntroFlag);
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

  await persistOut(leadId, finalMessage, shouldAddFooter);

  // TwiML response
  const twimlBody = shouldAddFooter && !finalMessage.includes("Reply PAUSE")
    ? `${finalMessage} Reply PAUSE to stop`
    : finalMessage;
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(twimlBody)}</Message></Response>`;
  return res.status(200).setHeader("Content-Type","text/xml").send(twiml);
}
