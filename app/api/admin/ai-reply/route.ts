export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { generateReply } from './generateReply';
import { sendSms } from '@/lib/twilio';

function publicBaseFromRequest(req: NextRequest): string {
  const envBase =
    (process.env.PUBLIC_BASE && process.env.PUBLIC_BASE.trim()) ||
    (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim()) ||
    (process.env.NEXT_PUBLIC_BASE && process.env.NEXT_PUBLIC_BASE.trim()) ||
    '';
  if (envBase) return envBase;
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

export async function POST(req: NextRequest) {
  const debug = req.headers.get('x-debug') === '1';

  // Admin auth
  const provided = req.headers.get('x-admin-key') || '';
  if (!process.env.ADMIN_API_KEY || provided !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Parse + normalize
  let payload: any = {};
  try { payload = await req.json(); } catch {}
  const from = String(payload.from ?? payload.From ?? '').trim();
  const to   = String(payload.to   ?? payload.To   ?? '').trim();
  const body = String(payload.body ?? payload.Body ?? '').trim();

  if (!from || !to || !body) {
    return NextResponse.json({ ok: false, error: 'missing from/to/body' }, { status: 400 });
  }

  const base = publicBaseFromRequest(req);
  const brandName = 'OutboundRevive';
  const bookingLink = process.env.CAL_LINK || 'https://cal.com/charlie-fregozo-v8sczt/30min';

  // (optional) resolve lead for logging
  let lead_id: string | null = null;
  try {
    const { data: lead } = await supabaseAdmin
      .from('leads').select('id').eq('phone', from).maybeSingle();
    lead_id = lead?.id || null;
  } catch {}

  // Generate reply (LLM JSON when possible)
  const ai = await generateReply({ userBody: body, fromPhone: from, toPhone: to, brandName, bookingLink });
  let replyText = ai.message;

  // Block if globally suppressed
  try {
    const { data: sup } = await supabaseAdmin
      .from("global_suppressions").select("phone").eq("phone", from).maybeSingle();
    if (sup?.phone) {
      return NextResponse.json({ ok: true, suppressed: true, strategy: ai.kind, reply: "[suppressed]", send_result: null, base_used: base, ...(debug ? { ai_debug: ai } : {}) });
    }
  } catch {}

  // Apply footer + actions from JSON contract
  if (ai.kind === "json") {
    const needsFooter = ai.parsed?.needs_footer === true;
    if (needsFooter && !replyText.includes("Txt STOP to opt out")) {
      replyText += "\nTxt STOP to opt out";
    }
    const acts = Array.isArray(ai.parsed?.actions) ? ai.parsed.actions : [];
    for (const act of acts) {
      const t = (act?.type || act)?.toString?.() || "";
      if (/^suppress_number$/i.test(t)) {
        await supabaseAdmin.from("global_suppressions").upsert({ phone: from });
      }
    }
  }


  // Send via Twilio
  let sent: any = null;
  try {
    sent = await sendSms({
      to: from,
      body: replyText,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
      statusCallback: base ? `${base}/api/webhooks/twilio/status` : undefined,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'twilio_send_failed', detail: e?.message || String(e) },
      { status: 502 }
    );
  }

  // Log outbound (best-effort)
  try {
    await supabaseAdmin.from('messages_out').insert({
      lead_id,
      to_phone: from,
      from_phone: to,
      body: replyText,
      provider: 'twilio',
      provider_sid: sent?.sid || null,
      status: sent?.status || null,
    });
  } catch (e) {
    console.warn('[ai-reply] messages_out insert failed', e);
  }

  return NextResponse.json({
    ok: true,
    strategy: ai.kind,
    reply: replyText,
    send_result: sent,
    base_used: base,
    ...(debug ? { ai_debug: ai } : {}),
  });
}
