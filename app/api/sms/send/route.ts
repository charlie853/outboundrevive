import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export const runtime = 'nodejs';

// ----- helpers -----
function parseHHMM(s: string) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const hh = +m[1], mm = +m[2];
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}
function minutesNowInTZ(tz: string) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' });
  const [h, m] = fmt.format(new Date()).split(':').map(Number);
  return h * 60 + m;
}
function withinWindow(nowMin: number, startMin: number, endMin: number) {
  if (startMin <= endMin) return nowMin >= startMin && nowMin <= endMin;
  return nowMin >= startMin || nowMin <= endMin; // wraps midnight
}
function hoursSince(iso?: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}
function daysSince(iso?: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 864e5;
}
function renderTemplate(t: string, vars: Record<string,string>) {
  let out = t || '';
  for (const [k,v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v ?? '');
  return out;
}
async function isSuppressed(phone: string) {
  const { data } = await supabase.from('global_suppressions').select('phone').eq('phone', phone).maybeSingle();
  return !!data;
}
// FL/OK area codes (conservative list)
const FL = new Set(['239','305','321','352','386','407','561','689','727','754','772','786','813','850','863','904','941','954']);
const OK = new Set(['405','539','572','580','918']);
function npaFromE164(phone: string) {
  const m = /^\+1(\d{3})\d{7}$/.exec(phone || '');
  return m?.[1] || null;
}
async function countsInLast24h(lead_id: string) {
  const since = new Date(Date.now() - 24*3600*1000).toISOString();
  const { count, error } = await supabase
    .from('messages_out')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', lead_id)
    .gte('created_at', since);
  if (error) return 0;
  return count ?? 0;
}

// ----- route -----
export async function POST(req: NextRequest) {
  // admin guard
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { leadIds, message, brand, aiMeta, replyMode, operator_id, sentBy } = await req.json() as {
      leadIds: string[];
      message: string;
      brand?: string;
      replyMode?: boolean | string;
      operator_id?: string | null;
      sentBy?: 'operator' | 'ai' | 'system';
      aiMeta?: {
        intent?: string;
        source?: 'template' | 'llm' | 'fallback';
        template_id?: string | null;
        blueprint_version_id?: string | null;
        used_snippets?: string[] | null;
      };
    };
    const isReply = replyMode === true || String(replyMode).toLowerCase() === 'true';

    // decide provenance for this send
    // decide provenance for this send (match DB constraint: only 'ai' | 'operator')
const baseSentBy: 'operator' | 'ai' =
  operator_id ? 'operator' : (sentBy === 'operator' ? 'operator' : 'ai');

    console.log('[sms/send] replyMode=', replyMode, '→ isReply=', isReply);
    if (!Array.isArray(leadIds) || leadIds.length === 0) return NextResponse.json({ error: 'No leads selected' }, { status: 400 });
    if (!message || !message.trim()) return NextResponse.json({ error: 'Missing message' }, { status: 400 });

    // settings & active blueprint
    const { data: cfg } = await supabase
      .from('app_settings')
      .select('timezone,quiet_start,quiet_end,brand,booking_link,paused,blackout_dates,sms_channel_status,active_blueprint_version_id')
      .eq('id','default').maybeSingle();

      // after loading cfg
const { data: bpv } = await supabase
  .from('blueprint_versions')
  .select(`
    id,
    account_blueprint:account_blueprints!inner(account_id)
  `)
  // if you store only one account, hardcode; else pass tenant’s account_id
  .eq('account_blueprints.account_id', '11111111-1111-1111-1111-111111111111')
  .order('version', { ascending: false })
  .limit(1)
  .maybeSingle();

const activeBlueprintVersionId = (cfg?.active_blueprint_version_id ?? bpv?.id) || null;

    const tz         = cfg?.timezone || 'America/New_York';
    const startMin   = parseHHMM(cfg?.quiet_start || '08:00') ?? 8*60;
    const endMin     = parseHHMM(cfg?.quiet_end   || '21:00') ?? 21*60;
    const acctBrand  = brand || cfg?.brand || 'OutboundRevive';
    const bookingUrl = cfg?.booking_link || '';
    const paused     = !!cfg?.paused;
    const blackout   = Array.isArray(cfg?.blackout_dates) ? cfg!.blackout_dates as string[] : [];
    const chanStatus = (cfg?.sms_channel_status || 'unverified').toLowerCase();

    // hard account-level gates
    if (paused) return NextResponse.json({ error: 'paused' }, { status: 409 });
    const todayISO = new Date().toISOString().slice(0,10);
    if (blackout.includes(todayISO)) return NextResponse.json({ error: 'blackout' }, { status: 409 });
    // Allow dev bypass or reply-mode bypass; block only non-reply sends when unverified
    if (chanStatus !== 'verified' && process.env.TWILIO_DISABLE !== '1' && !isReply) {
      return NextResponse.json({ error: 'channel_unverified' }, { status: 409 });
    }

    
    // fetch leads
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id,name,phone,opted_out,last_sent_at,last_footer_at,account_id')
      .in('id', leadIds);

    if (error) {
      console.error('DB fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
    }

    const results: Array<{ id: string; phone: string; sid?: string; error?: string }> = [];
    const dryRun = process.env.TWILIO_DISABLE === '1';
    const nowMinLocal = minutesNowInTZ(tz);

    for (const l of leads || []) {
      try {
        if (l.opted_out) { results.push({ id: l.id, phone: l.phone, error: 'opted_out' }); continue; }
        if (await isSuppressed(l.phone)) { results.push({ id: l.id, phone: l.phone, error: 'suppressed' }); continue; }

        // quiet hours (skip if replyMode=true)
        if (!isReply && !withinWindow(nowMinLocal, startMin, endMin)) {
          results.push({ id: l.id, phone: l.phone, error: 'quiet_hours' }); continue;
        }

        // 24h cap (skip if replyMode=true)
        if (!isReply && hoursSince(l.last_sent_at) < 24) {
          results.push({ id: l.id, phone: l.phone, error: '24h_cap' }); continue;
        }

        // FL/OK state cap ≤3/24h (skip if replyMode=true)
        const npa = npaFromE164(l.phone);
        if (!isReply && npa && (FL.has(npa) || OK.has(npa))) {
          const c = await countsInLast24h(l.id);
          if (c >= 3) { results.push({ id: l.id, phone: l.phone, error: 'state_24h_cap' }); continue; }
        }

        // compute gate info for logging
        const quietOk = isReply || withinWindow(nowMinLocal, startMin, endMin);
        const hoursSinceLast = hoursSince(l.last_sent_at);
        const cap24hOk = isReply || hoursSinceLast >= 24;

        // state cap info
        const npa2 = npaFromE164(l.phone);
        let sentCount24h: number | null = null;
        let stateCapOk = true;
        if (!isReply && npa2 && (FL.has(npa2) || OK.has(npa2))) {
          sentCount24h = await countsInLast24h(l.id);
          stateCapOk = sentCount24h < 3;
        }

        const gateLog = {
          is_reply: isReply,
          tz,
          quiet_window: { start: cfg?.quiet_start || '08:00', end: cfg?.quiet_end || '21:00', now_min_local: nowMinLocal, passed: quietOk },
          caps: {
            last_sent_at: l.last_sent_at || null,
            hours_since_last: isFinite(hoursSinceLast) ? +hoursSinceLast.toFixed(2) : null,
            cap24h_passed: cap24hOk,
            state: npa2 ? (FL.has(npa2) ? 'FL' : OK.has(npa2) ? 'OK' : 'other') : null,
            sent_count_24h: sentCount24h,
            state_cap_passed: stateCapOk
          },
          footer: {
            last_footer_at: l.last_footer_at || null,
            needed: daysSince(l.last_footer_at) > 30
          },
          channel_status: chanStatus,
          blueprint_version_id: (aiMeta?.blueprint_version_id ?? activeBlueprintVersionId) ?? null,
          sent_by: baseSentBy,
          operator_id: operator_id ?? null
        };

        // render + footer gating (once/30d)
        const needsFooter = daysSince(l.last_footer_at) > 30;
        const base = renderTemplate(message, {
          name: l.name || '',
          brand: acctBrand,
          lead_id: l.id,
          booking_link: bookingUrl || `/r/book/${l.id}`
        });

        let body = base.trim();
        if (needsFooter && !/txt stop to opt out/i.test(body)) {
          body = `${body}${body.endsWith('.') ? '' : ''} Txt STOP to opt out`;
        }
        if (body.length > 160) { results.push({ id: l.id, phone: l.phone, error: 'too_long_with_footer' }); continue; }

        // send (dry or real)
        const sid = 'SIM' + Math.random().toString(36).slice(2, 14).toUpperCase();
        const status = dryRun ? 'sent' : 'queued';

        // provider_status and timestamps for deliverability tracking
        const provider_status = status; // mirror initial status
        const timeStamps: any = {};
        const nowIso = new Date().toISOString();
        if (provider_status === 'queued') timeStamps.queued_at = nowIso;
        if (provider_status === 'sent')   timeStamps.sent_at   = nowIso;

        const leadUpdate: any = {
          status: 'sent',
          sent_at: nowIso,
          last_message_sid: sid,
          delivery_status: status,
          last_sent_at: nowIso,
        };
        if (needsFooter) leadUpdate.last_footer_at = nowIso;

        await supabase.from('leads').update(leadUpdate).eq('id', l.id);

        // Persist with AI context (intent/source/template) and blueprint_version_id (prefers aiMeta override, falls back to activeBlueprintVersionId)
        const { data: inserted, error: logErr } = await supabase
          .from('messages_out')
          .insert({
            lead_id: l.id,
            sid,
            body,
            status,
            error_code: null,
            // deliverability scaffold
            provider_status,
            queued_at: timeStamps.queued_at ?? null,
            sent_at: timeStamps.sent_at ?? null,
            delivered_at: null,
            failed_at: null,
            gate_log: gateLog,
            account_id: l.account_id || DEFAULT_ACCOUNT_ID,
            // provenance
            sent_by: baseSentBy,
            operator_id: operator_id ?? null,
            // AI metadata (optional; persisted when provided)
            intent:   aiMeta?.intent ?? null,
            ai_source: aiMeta?.source ?? null,
            prompt_template_id: aiMeta?.template_id ?? null,
            blueprint_version_id: (aiMeta?.blueprint_version_id ?? activeBlueprintVersionId) ?? null,
            used_snippets: aiMeta?.used_snippets ?? null
          })
          .select('sid')
          .maybeSingle();
        if (logErr) {
          console.error('messages_out insert error', l.id, logErr);
          return NextResponse.json({ error: 'insert_failed', details: logErr.message }, { status: 500 });
        }
        if (!inserted) {
          console.error('messages_out insert returned no row for lead', l.id, 'sid', sid);
          return NextResponse.json({ error: 'insert_failed_no_row' }, { status: 500 });
        }
        results.push({ id: l.id, phone: l.phone, sid });
      } catch (e:any) {
        console.error('Send error for', l?.phone, e?.message || e);
        results.push({ id: l?.id, phone: l?.phone, error: e?.message || 'send_failed' });
      }
    }

    return NextResponse.json({ results });
  } catch (e:any) {
    console.error('POST /api/sms/send error', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}