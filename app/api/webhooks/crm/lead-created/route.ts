// app/api/webhooks/crm/lead-created/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

const DEFAULT_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'YOUR_ADMIN_TOKEN';

function normalizeUS(phone: string) {
  const digits = (phone || '').replace(/\D+/g, '');
  if (!digits) return null;
  if (phone.trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function localYMD(tz?: string | null) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`; // YYYY-MM-DD
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    // --- Auth ---
    const token = req.headers.get('x-admin-token') || '';
    if (token !== ADMIN_TOKEN) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // --- Payload ---
    const body = await req.json().catch(() => ({}));
    const account_id: string = body.account_id || DEFAULT_ACCOUNT_ID;
    const name: string = body.name || '';
    const tz: string | null = body.tz || null;
    const source: string | null = body.source || 'crm';
    const consent: boolean = !!body.consent;
    const phoneNorm = normalizeUS(body.phone || '');

    if (!phoneNorm) {
      return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
    }

    // --- Upsert lead with schema tolerance ---
    // 1) Try selecting existing lead (try schema with account_id; if column missing, fall back)
    let leadRow: any = null;

    let sel = await supabaseAdmin
      .from('leads')
      .select('id,name,phone,account_id')
      .eq('phone', phoneNorm)
      .eq('account_id', account_id)
      .maybeSingle();

    if (sel.error && /column .*account_id.* does not exist/i.test(String(sel.error.message))) {
      // Fallback: no account_id column
      sel = await supabaseAdmin
        .from('leads')
        .select('id,name,phone')
        .eq('phone', phoneNorm)
        .maybeSingle();
    }

    if (sel.error) {
      console.error('[lead-created] select error:', sel.error);
    } else {
      leadRow = sel.data;
    }

    if (!leadRow) {
      // Try insert with account_id + tz
      let ins = await supabaseAdmin
        .from('leads')
        .insert([{ name: name || null, phone: phoneNorm, account_id, tz, opted_out: consent ? false : null }])
        .select('id,name,phone,account_id')
        .single();

      if (ins.error) {
        const msg = String(ins.error.message || '').toLowerCase();

        // Case A: account_id column missing -> retry without account_id
        if (/account_id/.test(msg)) {
          ins = await supabaseAdmin
            .from('leads')
            .insert([{ name: name || null, phone: phoneNorm, tz, opted_out: consent ? false : null }])
            .select('id,name,phone')
            .single();

          // If tz also missing -> retry without tz as well
          if (ins.error && /tz/.test(String(ins.error.message || '').toLowerCase())) {
            ins = await supabaseAdmin
              .from('leads')
              .insert([{ name: name || null, phone: phoneNorm, opted_out: consent ? false : null }])
              .select('id,name,phone')
              .single();
          }
        }
        // Case B: tz column missing (but account_id exists) -> retry without tz
        else if (/tz/.test(msg)) {
          ins = await supabaseAdmin
            .from('leads')
            .insert([{ name: name || null, phone: phoneNorm, account_id, opted_out: consent ? false : null }])
            .select('id,name,phone,account_id')
            .single();
        }
      }

      if (ins.error) {
        console.error('[lead-created] insert error:', ins.error);
        return NextResponse.json({ error: 'lead_upsert_failed', details: ins.error.message }, { status: 500 });
      }
      leadRow = ins.data;
    } else {
      // Optional: update name/tz/account if missing
      const patch: any = {};
      if (name && name !== leadRow.name) patch.name = name;
      if (tz && tz !== leadRow.tz) patch.tz = tz;
      if ('account_id' in leadRow && !leadRow.account_id) patch.account_id = account_id;

      if (Object.keys(patch).length) {
        let upd = await supabaseAdmin.from('leads').update(patch).eq('id', leadRow.id).select('id').single();
        if (upd.error && /tz/.test(String(upd.error.message || '').toLowerCase())) {
          // Retry without tz if that column doesn't exist in this schema
          const { tz: _drop, ...patchNoTz } = patch;
          if (Object.keys(patchNoTz).length) {
            upd = await supabaseAdmin.from('leads').update(patchNoTz).eq('id', leadRow.id).select('id').single();
          }
        }
        if (upd.error) console.warn('[lead-created] update lead warn:', upd.error.message);
      }
    }

    const leadId: string = leadRow.id;
    const firstName = (name || '').split(' ')[0] || 'there';

    // --- Consent events (handle lead_id vs contact_id schemas) ---
    if (consent) {
      // Try lead_id first
      let c1 = await supabaseAdmin.from('consent_events').insert({
        lead_id: leadId,
        type: 'consent_granted',
        source,
      });
      if (c1.error && /column .*lead_id.* does not exist/i.test(String(c1.error.message))) {
        const c2 = await supabaseAdmin.from('consent_events').insert({
          contact_id: leadId,
          type: 'consent_granted',
          source,
        });
        if (c2.error) console.warn('[lead-created] consent insert warn:', c2.error.message);
      }
    }

    // --- App settings for opener + autopilot flags ---
    const appCfg = await supabaseAdmin
      .from('app_settings')
      .select('brand, booking_link, templates, paused, blackout_dates, autopilot_enabled, active_blueprint_version_id, sms_channel_status')
      .eq('id', 'default')
      .maybeSingle();

    const brand = (appCfg.data as any)?.brand || 'OutboundRevive';
    const templates = (appCfg.data as any)?.templates || {};
    const openerTpl =
      templates.opener ||
      'Hi {{first_name}}—{{brand}} here. {{slotA}} or {{slotB}}? Reply YES. Txt STOP to opt out';

    const smsStatus = (appCfg.data as any)?.sms_channel_status || 'unverified';

    const autopilot = !!(appCfg.data as any)?.autopilot_enabled;
    const paused = !!(appCfg.data as any)?.paused;

    const blackoutDates: string[] = (appCfg.data as any)?.blackout_dates || [];
    const todayLocal = localYMD(tz);
    const isBlackout = blackoutDates.includes(todayLocal);

    let autoStart = false;
    if (consent && autopilot && !paused && smsStatus === 'verified' && !isBlackout) autoStart = true;

    let sendResult: any = null;

    if (autoStart) {
      const base = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin).replace(/\/$/, '');
      const aiMeta = {
        intent: 'greet',
        source: 'template',
        template_id: null,
        blueprint_version_id: (appCfg.data as any)?.active_blueprint_version_id || null,
        used_snippets: null,
      };

      const r = await fetch(`${base}/api/sms/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-token': ADMIN_TOKEN,
        },
        body: JSON.stringify({
          leadIds: [leadId],
          message: openerTpl, // /api/sms/send renders {{first_name}}, {{brand}}, {{booking_link}}, {{slotA}}, {{slotB}}
          replyMode: false,
          aiMeta,
        }),
      });
      // Even if /api/sms/send returns non-JSON on error, guard the parse:
      try { sendResult = await r.json(); } catch { sendResult = { status: r.status }; }
    }

    return NextResponse.json({
      ok: true,
      lead: { id: leadId, phone: phoneNorm, name: name || null, account_id: leadRow.account_id || null },
      consent_recorded: !!consent,
      auto_started: autoStart,
      send_result: sendResult || null,
      auto_start_block_reason: autoStart ? null : (() => {
        if (!consent) return 'no_consent';
        if (!autopilot) return 'autopilot_disabled';
        if (paused) return 'account_paused';
        if (smsStatus !== 'verified') return 'sms_channel_unverified';
        if (isBlackout) return 'blackout_date';
        return 'unknown';
      })(),
      took_ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error('[crm/lead-created] error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
