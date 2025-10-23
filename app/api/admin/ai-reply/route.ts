export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

function err(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(req: Request) {
  try {
    // --- Auth (admin key) ---
    const adminKey = process.env.ADMIN_API_KEY || '';
    if (!adminKey) return err(500, 'ADMIN_API_KEY missing');
    const hdr = req.headers.get('x-admin-key') || '';
    if (hdr !== adminKey) return err(401, 'unauthorized');

    // --- Env ---
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const PUBLIC_BASE = process.env.PUBLIC_BASE;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return err(500, 'Supabase env missing');
    if (!OPENAI_API_KEY) return err(500, 'OPENAI_API_KEY missing');
    if (!PUBLIC_BASE) return err(500, 'PUBLIC_BASE missing');

    const body = await req.json().catch(() => ({}));
    const from = (body.from || '').trim();
    const to = (body.to || '').trim();
    const userText = (body.body || '').trim();
    if (!from || !to || !userText) return err(400, 'from, to, body are required');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Find the lead by the inbound phone
    const { data: leadRows, error: leadErr } = await supabase
      .from('leads')
      .select('id, account_id, phone, phone_e164')
      .or(`phone.eq.${from},phone_e164.eq.${from}`)
      .limit(1);

    if (leadErr) {
      console.error('[ai-reply] leadErr', leadErr);
      return err(500, 'lead lookup failed');
    }
    const lead = leadRows?.[0];
    if (!lead) return err(404, 'lead not found for from phone');

    // 2) Pull account settings (prompt + examples)
    const { data: acct, error: acctErr } = await supabase
      .from('account_settings')
      .select('brand, booking_link, prompt_system, prompt_examples')
      .eq('account_id', lead.account_id)
      .limit(1)
      .single();

    if (acctErr) {
      console.error('[ai-reply] acctErr', acctErr);
      return err(500, 'account settings lookup failed');
    }

    const brand = acct?.brand || 'OutboundRevive';
    const bookingLink = acct?.booking_link || 'https://cal.com/charlie-fregozo-v8sczt/secret';
    const systemRaw = (acct?.prompt_system || '').replaceAll('{{BRAND}}', brand).replaceAll('{{BOOKING_LINK}}', bookingLink);

    // few-shot – take first 5 examples if present
    const ex: Array<{user:string;assistant:string}> = Array.isArray(acct?.prompt_examples) ? acct!.prompt_examples.slice(0,5) : [];
    const exampleMsgs = ex.flatMap(e => ([
      { role: 'user' as const, content: e.user.replaceAll('{{BOOKING_LINK}}', bookingLink) },
      { role: 'assistant' as const, content: e.assistant.replaceAll('{{BOOKING_LINK}}', bookingLink) },
    ]));

    const messages = [
      { role: 'system' as const, content: systemRaw || `You are the SMS concierge for ${brand}. Keep replies 1–2 sentences, ≤300 chars.` },
      ...exampleMsgs,
      { role: 'user' as const, content: `Lead texted: "${userText}". Reply as ${brand}'s SMS concierge using the style and guardrails.` },
    ];

    // 3) Call OpenAI
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.5,
      max_tokens: 160,
    });
    let reply = (completion.choices?.[0]?.message?.content || '').trim();
    if (!reply) reply = 'Got it—want to pick a quick time to chat? ' + bookingLink;

    // enforce 300 chars
    if (reply.length > 300) reply = reply.slice(0, 297) + '…';

    // 4) Send it via your existing admin send route
    const res = await fetch(`${PUBLIC_BASE}/api/admin/leads/send`, {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lead_id: lead.id, body: reply }),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error('[ai-reply] /api/admin/leads/send failed', res.status, t);
      return err(502, 'send route failed');
    }

    const sent = await res.json().catch(() => ({}));

    return NextResponse.json({
      ok: true,
      lead_id: lead.id,
      brand,
      reply,
      send_result: sent,
    });
  } catch (e: any) {
    console.error('[ai-reply] unhandled', e);
    return err(500, 'unhandled error');
  }
}
