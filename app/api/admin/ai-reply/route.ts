export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { generateReply } from './generateReply';
import { sendSms } from '@/lib/twilio';
import { shouldAddFooter, isNewThread, checkCaps, FOOTER_TEXT } from '@/lib/compliance';

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
  const provided = (req.headers.get('x-admin-key') || '').trim();
  const expected = (process.env.ADMIN_API_KEY || '').trim();
  if (!expected || provided !== expected) {
    if (debug) {
      console.log('[ai-reply] admin auth mismatch', {
        provided_len: provided.length,
        expected_len: expected.length,
        match: provided === expected,
      });
    }
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  // Parse + normalize
  let payload: any = {};
  try { payload = await req.json(); } catch {}
  const from = String(payload.from ?? payload.From ?? '').trim();
  const to   = String(payload.to   ?? payload.To   ?? '').trim();
  const body = String(payload.body ?? payload.Body ?? '').trim();

  if (!from || !to || !body) {
    return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
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
      return NextResponse.json({
        ok: true,
        suppressed: true,
        strategy: ai?.kind ?? 'json',
        reply: '[suppressed]',
        send_result: null,
        base_used: base,
        ...(debug ? { ai_debug: ai } : {}),
      });
    }
  } catch {}

  // Respect daily/weekly caps per recipient (the lead's phone is `from`)
  const cap = await checkCaps(from);
  if (!cap.allowed) {
    // Optionally log a held/blocked row for audit
    await supabaseAdmin.from('messages_out').insert({
      lead_id,
      from_phone: to,      // your Twilio number
      to_phone: from,      // recipient
      body: replyText,
      status: 'held',
      provider: 'twilio',
      provider_status: 'held',
      sent_by: 'ai',
      gate_log: { reason: 'cap_reached', dayCount: cap.dayCount, weekCount: cap.weekCount },
    });
    return NextResponse.json({
      ok: true,
      held: true,
      reason: 'cap_reached',
      dayCount: cap.dayCount,
      weekCount: cap.weekCount,
    });
  }

  // Add "Charlie" intro once per thread window
  if (await isNewThread(from) && !/charlie/i.test(replyText)) {
    // Keep it short; let the LLM body carry the context
    replyText = `Hey—it’s Charlie from OutboundRevive. ${replyText}`;
  }

  // Include footer only if needed (first touch or 30-day refresh)
  if (await shouldAddFooter(from) && !/opt out/i.test(replyText)) {
    replyText += `\n${FOOTER_TEXT}`;
  }

  // Apply footer + actions from JSON contract
  if (ai.kind === "json") {
    const needsFooter = ai.parsed?.needs_footer === true;
    if (needsFooter && !replyText.includes(FOOTER_TEXT)) {
      replyText += `\n${FOOTER_TEXT}`;
    }
    const acts = Array.isArray(ai.parsed?.actions) ? ai.parsed.actions : [];
    for (const act of acts) {
      const t = (act?.type || act)?.toString?.() || "";
      if (/^suppress_number$/i.test(t)) {
        await supabaseAdmin.from("global_suppressions").upsert({ phone: from });
      }
    }
  }

  // Keep your existing 320-char guard
  if (replyText.length > 320) replyText = replyText.slice(0, 320);


  // Send via Twilio (Messaging Service via helper)
  let sent: any = null;
  try {
    sent = await sendSms({ to: from, body: replyText, statusCallback: base ? `${base}/api/webhooks/twilio/status` : undefined });
  try {
    const payload1 = {
      from_phone: to,     // Twilio sender (your MSID number)
      to_phone: from,     // Lead's phone
      body: replyText,
      provider_sid: (typeof sent !== 'undefined' && sent && sent.sid) ? sent.sid : null
    };
    const ins1 = await supabaseAdmin.from('messages_out').insert(payload1);
    if (ins1.error) throw ins1.error;
    console.log('[ai-reply] messages_out insert OK', { to, from, sid: sent?.sid });
  } catch (e) {
    console.warn('[ai-reply] messages_out insert fallback', e?.message || e);
    const payload2 = {
      body: replyText,
      provider_sid: (typeof sent !== 'undefined' && sent && sent.sid) ? sent.sid : null
    };
    try {
      const ins2 = await supabaseAdmin.from('messages_out').insert(payload2);
      if (ins2.error) throw ins2.error;
      console.log('[ai-reply] messages_out insert MINIMAL OK', { sid: sent?.sid });
    } catch (e2) {
      console.error('[ai-reply] messages_out insert ERROR (both attempts)', e2);
    }
  }

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
