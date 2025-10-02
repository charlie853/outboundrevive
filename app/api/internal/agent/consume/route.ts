import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { buildReply, shouldReply } from '@/lib/agent/pipeline';

export const runtime = 'nodejs';

function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(50, Number(body.limit || 10)));

    // 1) Pick unprocessed inbound (global). In multi-instance, add a claim update; here we do optimistic update per-row.
    const { data: inbound, error } = await db
      .from('messages_in')
      .select('id,lead_id,account_id,body,created_at,agent_processed_at')
      .is('agent_processed_at', null)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 });

    if (!inbound?.length) return NextResponse.json({ ok: true, picked: 0, sent: 0, skipped: 0 });

    let picked = inbound.length;
    let sent = 0;
    let skipped = 0;
    const results: any[] = [];

    // cache account pause status per account
    const pausedCache = new Map<string, boolean>();
    for (const m of inbound) {
      const leadId = m.lead_id as string;
      const accountId = m.account_id as string;

      // Check pause
      if (!pausedCache.has(accountId)) {
        const { data: a } = await db.from('accounts').select('outbound_paused').eq('id', accountId).maybeSingle();
        pausedCache.set(accountId, !!a?.outbound_paused);
      }
      if (pausedCache.get(accountId)) {
        skipped++; results.push({ id: m.id, lead_id: leadId, skipped: true, reason: 'account_paused' });
        continue;
      }

      // Mark processed up-front to avoid duplicate work; if downstream fails we still log skipped.
      await db.from('messages_in').update({ agent_processed_at: new Date().toISOString() }).eq('id', m.id);

      // 2) Decide whether to reply
      const gate = await shouldReply({ accountId, leadId });
      if (!gate.ok) { skipped++; results.push({ id: m.id, lead_id: leadId, skipped: true, reason: gate.reason }); continue; }

      // 3) Build reply text (short)
      const reply = await buildReply({ accountId, leadId, lastInboundText: m.body || '' });
      if (!reply.text || !reply.text.trim()) { skipped++; results.push({ id: m.id, lead_id: leadId, skipped: true, reason: 'empty_reply' }); continue; }

      // 4) Send via internal knowledge/draft (centralizes footer/compliance and uses existing sms pipeline)
      const base = process.env.PUBLIC_BASE_URL || req.nextUrl.origin;
      const admin = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
      const draftRes = await fetch(`${base}/api/internal/knowledge/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': admin },
        body: JSON.stringify({ account_id: accountId, q: reply.text, k: 2, max_chars: 160, send: true, lead_id: leadId, operator_id: 'auto' })
      }).then(r => r.json()).catch(() => ({ error: 'send_failed' }));

      const sid = draftRes?.sent?.results?.[0]?.sid || null;
      if (sid) { sent++; results.push({ id: m.id, lead_id: leadId, sent_sid: sid }); }
      else { skipped++; results.push({ id: m.id, lead_id: leadId, skipped: true, reason: draftRes?.send_error || 'not_sent' }); }
    }

    return NextResponse.json({ ok: true, picked, sent, skipped, results });
  } catch (e: any) {
    return NextResponse.json({ error: 'agent_consume_crash', detail: e?.message }, { status: 500 });
  }
}
