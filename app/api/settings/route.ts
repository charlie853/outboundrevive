// app/api/settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireAccountAccess } from '@/lib/account';

export const runtime = 'nodejs';

function isHHMM(v: string) {
  return /^\d{2}:\d{2}$/.test(v) &&
    Number(v.slice(0, 2)) <= 23 &&
    Number(v.slice(3, 5)) <= 59;
}

// GET returns current settings or sensible defaults
export async function GET() {
  // Check authentication and get account ID
  const accountId = await requireAccountAccess();
  if (!accountId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('app_settings')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If no row yet, return defaults (not an error)
  return NextResponse.json(
    data || {
      account_id: accountId,
      timezone: 'America/New_York',
      quiet_start: '09:00',
      quiet_end: '19:00',
      daily_cap: 200,
      brand: 'OutboundRevive',
      booking_link: '',
      template_opener:
        'Hi {{name}}—{{brand}} here re your earlier inquiry. We can hold 2 options. Reply YES to book. Txt STOP to opt out',
      template_nudge:
        '{{brand}}: still want to book a quick chat? We can hold 2 options. Reply A/B or send a time. Txt STOP to opt out',
      template_reslot:
        '{{brand}}: no problem. Early next week or later this week? Reply with a window. Txt STOP to opt out',
      templates: {},
      autopilot_enabled: false,
      kill_switch: false,
      consent_attested: false,
      updated_at: new Date().toISOString(),
    }
  );
}

// Single PATCH handler
export async function PATCH(req: NextRequest) {
  // Check authentication and get account ID
  const accountId = await requireAccountAccess();
  if (!accountId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Build partial update
    const update: any = { account_id: accountId, updated_at: new Date().toISOString() };

    if (body.timezone != null) update.timezone = String(body.timezone).trim();

    if (body.quiet_start != null) {
      const qs = String(body.quiet_start).trim();
      if (!isHHMM(qs)) return NextResponse.json({ error: 'quiet_start must be HH:MM' }, { status: 400 });
      update.quiet_start = qs;
    }

    if (body.quiet_end != null) {
      const qe = String(body.quiet_end).trim();
      if (!isHHMM(qe)) return NextResponse.json({ error: 'quiet_end must be HH:MM' }, { status: 400 });
      update.quiet_end = qe;
    }

    if (body.daily_cap != null) {
      update.daily_cap = Math.max(1, Math.min(100000, Number(body.daily_cap)));
    }

    if (body.brand != null) update.brand = String(body.brand).trim();
    if (body.booking_link != null) update.booking_link = String(body.booking_link).trim();

    if (body.autopilot_enabled != null) update.autopilot_enabled = Boolean(body.autopilot_enabled);
    if (body.kill_switch != null) update.kill_switch = Boolean(body.kill_switch);
    if (body.consent_attested != null) update.consent_attested = Boolean(body.consent_attested);

    // Optional templates object (merge with current)
    if (body.templates && typeof body.templates === 'object') {
      const { data: cur } = await supabaseAdmin
        .from('app_settings')
        .select('templates')
        .eq('account_id', accountId)
        .maybeSingle();

      const merged = { ...(cur?.templates || {}), ...body.templates };
      update.templates = merged;

      if (merged.opener) update.template_opener = String(merged.opener);
      if (merged.nudge) update.template_nudge = String(merged.nudge);
      if (merged.reslot) update.template_reslot = String(merged.reslot);
    }

    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .upsert(update)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Invalid JSON' }, { status: 400 });
  }
}