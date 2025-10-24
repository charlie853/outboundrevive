// app/api/admin/ai-reply/route.ts
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSms } from '@/lib/twilio';
import { generateReply } from './generateReply';

function resolvePublicBase(req: Request) {
  const envBase =
    (process.env.PUBLIC_BASE && process.env.PUBLIC_BASE.trim()) ||
    (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL.trim()) ||
    (process.env.NEXT_PUBLIC_BASE && process.env.NEXT_PUBLIC_BASE.trim());
  if (envBase) return envBase;
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

// Small LLM helper with guaranteed fallback
async function llmReplyOrFallback(userBody: string, _accountId?: string) {
  try {
    if (!process.env.OPENAI_API_KEY || String(process.env.LLM_DISABLE || '').match(/^(1|true)$/i)) {
      throw new Error('llm_disabled');
    }
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a concise SMS assistant for OutboundRevive.' },
        { role: 'user', content: userBody },
      ],
      temperature: 0.4,
      max_tokens: 180,
    });
    const txt = completion.choices?.[0]?.message?.content?.trim() || '';
    if (!txt) throw new Error('empty_llm');
    return txt.slice(0, 300);
  } catch (e: any) {
    console.error('[ai-reply] LLM fallback:', e?.message || e);
  }
}

export async function POST(req: Request) {
  try {
    // Admin auth
    const provided = req.headers.get('x-admin-key') || '';
    if (!process.env.ADMIN_API_KEY || provided !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    // Parse
    const payload = await req.json().catch(() => ({}));
    const from = String(payload.from ?? payload.From ?? '').trim();
    const to   = String(payload.to   ?? payload.To   ?? '').trim();
    const body = String(payload.body ?? payload.Body ?? '').trim();
    if (!from || !to || !body) {
      return NextResponse.json({ ok: false, error: 'from/to/body required' }, { status: 400 });
    }

    const PUBLIC_BASE = resolvePublicBase(req);

    // Supabase admin client
    const supa = supabaseAdmin;

    // Optional lead lookup (by phone)
    let lead_id: string | undefined = undefined;
    let account_id: string | undefined = undefined;
    try {
      const { data: lead } = await supa
        .from('leads')
        .select('id,account_id')
        .eq('phone', String(from).trim())
        .maybeSingle();
      if (lead?.id) {
        lead_id = String(lead.id);
        account_id = (lead as any).account_id || undefined;
      }
    } catch (_) {}

    // Build brand + link context and call LLM JSON/text helper (generator fetches thread)
    const brandName = 'OutboundRevive';
    const bookingLink = process.env.CAL_BOOKING_URL || process.env.CAL_PUBLIC_URL || '';
    const ai = await generateReply({ userBody: String(body), fromPhone: from, toPhone: to, brandName, bookingLink });
    // Unify to plain text for now (use ai.message either way)
    let reply = ai.kind === 'json' ? ai.message : ai.message;

    // Anti-repeat guard (avoid sending identical text twice)
    if (lead_id) {
      const { data: lastOut } = await supa
        .from('messages_out')
        .select('body, created_at')
        .eq('provider', 'twilio')
        .eq('lead_id', lead_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastOut?.body && lastOut.body.trim() === reply.trim()) {
        reply = reply.endsWith('.') ? reply : reply + '.';
      }
    } else {
      // Fallback: if we don't have a lead_id, compare with last Twilio outbound globally
      try {
        const { data: lastAny } = await supa
          .from('messages_out')
          .select('body')
          .eq('provider', 'twilio')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastAny?.body && lastAny.body.trim() === reply.trim()) {
          reply = reply.replace(/[\.!]?$/, ' — happy to share more details!');
        }
      } catch (_) {}
    }

    // Twilio send (fetch-based helper)
    const sent = await sendSms({
      to: String(from).trim(),
      body: reply,
      messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
      statusCallback: `${PUBLIC_BASE}/api/webhooks/twilio/status`,
    });

    // Persist messages_out (non-blocking if you prefer)
    await supa.from('messages_out').insert({
      lead_id,
      body: reply,
      status: sent.status || 'queued',
      provider: 'twilio',
      provider_sid: sent.sid,
    });

    return NextResponse.json({ ok: true, strategy: ai.kind, reply, send_result: sent, base_used: PUBLIC_BASE });
  } catch (e: any) {
    console.error('[admin/ai-reply] error', e);
    return NextResponse.json({ ok: false, error: e?.message || 'internal-error' }, { status: 500 });
  }
}
