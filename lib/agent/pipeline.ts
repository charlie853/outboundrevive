import { supabaseAdmin } from '@/lib/supabaseServer';
import OpenAI from 'openai';
import { semanticSearch } from '@/lib/vector';

export async function shouldReply({ accountId, leadId }: { accountId: string; leadId: string }) {
  // Load lead and prefs
  const [{ data: lead }, { data: prefs }] = await Promise.all([
    supabaseAdmin.from('leads').select('id,opted_out,account_id').eq('id', leadId).eq('account_id', accountId).maybeSingle(),
    supabaseAdmin.from('account_followup_prefs').select('*').eq('account_id', accountId).maybeSingle()
  ]);

  if (!lead) return { ok: false, reason: 'lead_not_found' as const };
  if (lead.opted_out) return { ok: false, reason: 'opted_out' as const };

  const tz = prefs?.timezone || process.env.TIMEZONE || 'America/New_York';
  const qs = prefs?.quiet_start || process.env.QUIET_START || '09:00';
  const qe = prefs?.quiet_end || process.env.QUIET_END || '21:00';
  const minGap = Number(prefs?.min_gap_minutes ?? 360);
  const perDay = Number(prefs?.freq_max_per_day ?? 2);
  const perWeek = Number(prefs?.freq_max_per_week ?? 10);

  // Within quiet window
  function parseHM(s: string) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    if (!m) return { h: 9, m: 0 };
    const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
    const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
    return { h, m: mm };
  }
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' });
  const [H, M] = fmt.format(new Date()).split(':').map(Number);
  const nowMin = H * 60 + M;
  const startMin = (() => { const x = parseHM(qs); return x.h * 60 + x.m; })();
  const endMin = (() => { const x = parseHM(qe); return x.h * 60 + x.m; })();
  const inWindow = startMin <= endMin ? (nowMin >= startMin && nowMin <= endMin) : (nowMin >= startMin || nowMin <= endMin);
  if (!inWindow) return { ok: false, reason: 'outside_quiet_window' as const };

  // Recent outs and min gap
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [{ data: d1 }, { data: d7 }] = await Promise.all([
    supabaseAdmin.from('messages_out').select('created_at,sent_by,operator_id').eq('lead_id', leadId).gte('created_at', since24h).order('created_at', { ascending: false }),
    supabaseAdmin.from('messages_out').select('created_at,sent_by,operator_id').eq('lead_id', leadId).gte('created_at', since7d).order('created_at', { ascending: false })
  ]);

  const now = Date.now();
  const aiDay = (d1 || []).filter((r: any) => r.sent_by === 'ai' || r.operator_id === 'auto');
  const aiWeek = (d7 || []).filter((r: any) => r.sent_by === 'ai' || r.operator_id === 'auto');
  const lastOut = (d1 || [])[0]?.created_at ? new Date((d1 as any)[0].created_at).getTime() : 0;
  if (lastOut && (now - lastOut) < minGap * 60_000) return { ok: false, reason: 'min_gap' as const };
  if (aiDay.length >= perDay) return { ok: false, reason: 'day_cap' as const };
  if (aiWeek.length >= perWeek) return { ok: false, reason: 'week_cap' as const };

  return { ok: true as const };
}

export async function buildReply({ accountId, leadId, lastInboundText }: { accountId: string; leadId: string; lastInboundText: string }) {
  const contexts = await semanticSearch({ accountId, query: lastInboundText || 'general', k: 3 });
  const sys = `You are a helpful, concise SMS assistant for the business. Reply in under 160 characters, friendly and direct. Offer to book if relevant.`;
  const user = `Customer message: ${lastInboundText}\nContext:\n${contexts.map((c, i) => `(${i + 1}) ${c.chunk}`).join('\n')}`;

  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const disabled = process.env.LLM_DISABLE === '1';

  if (disabled || !process.env.OPENAI_API_KEY) {
    // Mocked reply with booking nudge
    const text = 'Yes, we do. Want a quick consult? I can hold two options.';
    return { text, intent: 'schedule' as const };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const r = await openai.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user }
    ]
  });
  let text = r.choices?.[0]?.message?.content?.trim?.() || '';
  if (text.length > 160) text = text.slice(0, 157) + '…';
  return { text };
}

