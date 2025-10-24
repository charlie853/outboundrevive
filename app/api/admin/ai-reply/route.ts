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
    const supa = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

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

    // Optional short conversation history (last few in/out)
    let history: Array<{ role: 'user'|'assistant'; content: string }> = [];
    try {
      if (lead_id) {
        const LIMIT = 6;
        const [ins, outs] = await Promise.all([
          supa
            .from('messages_in')
            .select('body, created_at')
            .eq('lead_id', lead_id)
            .order('created_at', { ascending: false })
            .limit(LIMIT),
          supa
            .from('messages_out')
            .select('body, created_at')
            .eq('lead_id', lead_id)
            .order('created_at', { ascending: false })
            .limit(LIMIT),
        ]);
        const turns: Array<{ role: 'user'|'assistant'; content: string; at: string }> = [];
        (ins.data || []).forEach(m => turns.push({ role: 'user', content: String((m as any).body || ''), at: String((m as any).created_at || '') }));
        (outs.data || []).forEach(m => turns.push({ role: 'assistant', content: String((m as any).body || ''), at: String((m as any).created_at || '') }));
        history = turns
          .sort((a,b) => new Date(a.at).getTime() - new Date(b.at).getTime())
          .map(t => ({ role: t.role, content: t.content }))
          .slice(-LIMIT);
      }
    } catch (_) {}

    // LLM reply (pass history for multi-turn context)
    let reply = await generateReply(account_id || null, String(body), { history });

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

    return NextResponse.json({
      ok: true,
      reply,
      send_result: { sid: sent.sid, status: sent.status },
      base_used: PUBLIC_BASE
    });
  } catch (e: any) {
    console.error('[admin/ai-reply] error', e);
    return NextResponse.json({ ok: false, error: e?.message || 'internal-error' }, { status: 500 });
  }
}
