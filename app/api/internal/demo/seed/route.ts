import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { createClient } from '@/lib/supabase-server';
import { getCurrentUserAccountId } from '@/lib/account';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: Request) {
  const got = (req.headers.get('x-admin-token') || '').trim();
  const want = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
  return !!want && got === want;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    // 1) Ensure we have a signed-in user to bind the seed to
    const supa = await createClient();
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'no_session', detail: 'Sign in, then call this endpoint.' }, { status: 401 });
    }

    // 2) Resolve (or create) the current user account
    const accountId = await getCurrentUserAccountId();
    if (!accountId) return NextResponse.json({ error: 'resolve_account_failed' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const brand = String(body.brand || 'OutboundRevive');
    const booking = String(body.booking_link || process.env.CAL_PUBLIC_URL || '');
    const tz = String(body.timezone || 'America/New_York');
    const quiet_start = String(body.quiet_start || '09:00');
    const quiet_end = String(body.quiet_end || '19:00');
    const targetAccountId: string | null = body.account_id || null;

    // 3) Upsert app settings + templates
    const templates = {
      opener: 'Hi {{name}}—{{brand}} here re your earlier inquiry. We can hold 2 options. Reply YES to book. Txt STOP to opt out',
      nudge: '{{brand}}: still want to book a quick chat? We can hold 2 options. Reply A/B or send a time. Txt STOP to opt out',
      reslot: '{{brand}}: no problem. Early next week or later this week? Reply with a window. Txt STOP to opt out'
    };

    await db.from('app_settings').upsert({
      account_id: targetAccountId || accountId,
      brand,
      booking_link: booking,
      timezone: tz,
      quiet_start,
      quiet_end,
      template_opener: templates.opener,
      template_nudge: templates.nudge,
      template_reslot: templates.reslot,
      templates,
      updated_at: new Date().toISOString()
    });

    // 4) Seed knowledge (consent, terms, value/objections)
    const pages: Array<{ title: string; body: string; source_url?: string | null }> = [
      {
        title: 'SMS Consent',
        body: 'Program: OutboundRevive SMS. Who receives: clients who opt in. Consent: checkbox on form. Frequency: up to 4 msgs/mo. Msg & data rates may apply. STOP to opt out, HELP for help. Sample: OutboundRevive: Hi {first_name}, this is Charlie following up—any questions? STOP to opt out, HELP for help.'
      },
      {
        title: 'Terms & Conditions',
        body: 'Program: OutboundRevive SMS. Eligibility & consent required. Fees: message/data rates apply. Opt-out: reply STOP; HELP for help. Carrier disclaimer: not liable for delays/undelivered. Acceptable use: no unlawful/SHAFT content. Changes posted on the site.'
      },
      {
        title: 'Value & Objections',
        body: 'Value: turn more leads into conversations automatically. On-brand replies, quiet hours, opt-out compliance, and booking nudges. Objection handling: not spammy—short, respectful, and only within caps; opt-out footer included. Outcome: fewer no-shows, more booked appointments.'
      }
    ];

    let insertedCount = 0;
    for (const p of pages) {
      const { error } = await db
        .from('account_kb_articles')
        .upsert({
          account_id: targetAccountId || accountId,
          title: p.title,
          body: p.body,
          is_active: true,
          source_url: p.source_url || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' });
      if (!error) insertedCount++;
    }

    // 5) Kick off embedding (optional)
    const base = process.env.PUBLIC_BASE_URL || req.nextUrl.origin;
    const admin = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
    let embedded = 0;
    try {
      const r = await fetch(`${base}/api/internal/knowledge/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-token': admin },
        body: JSON.stringify({ account_id: targetAccountId || accountId, limit: 100 })
      });
      const j = await r.json().catch(() => ({}));
      embedded = Number(j.embedded || 0);
    } catch {}

    // Optional Twilio config override
    try {
      if (body.twilio && (body.twilio.messaging_service_sid || body.twilio.from_number)) {
        await db.from('account_sms_config').upsert({
          account_id: targetAccountId || accountId,
          messaging_service_sid: body.twilio.messaging_service_sid || null,
          from_number: body.twilio.from_number || null,
          updated_at: new Date().toISOString()
        });
      }
    } catch {}

    return NextResponse.json({ ok: true, account_id: targetAccountId || accountId, settings: { brand, booking_link: booking, timezone: tz, quiet_start, quiet_end }, knowledge: { inserted: insertedCount, embedded } });
  } catch (e: any) {
    return NextResponse.json({ error: 'seed_failed', detail: e?.message || String(e) }, { status: 500 });
  }
}
