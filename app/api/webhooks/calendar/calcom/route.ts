import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { toE164US } from '@/lib/phone';

export const runtime = 'nodejs';

type CalComPayload = {
  triggerEvent?: string; // 'EVENT_CREATED'|'EVENT_RESCHEDULED'|'EVENT_CANCELLED'|'ATTENDEE_NO_SHOW'|'ATTENDEE_CHECKED_IN'
  payload?: any;
};

function mapStatus(trigger: string): 'booked'|'rescheduled'|'canceled'|'kept'|'no_show'|null {
  const t = trigger.toUpperCase();
  if (t.includes('CREATED')) return 'booked';
  if (t.includes('RESCHEDULED')) return 'rescheduled';
  if (t.includes('CANCELLED') || t.includes('CANCELED')) return 'canceled';
  if (t.includes('CHECKED_IN') || t.includes('ATTENDED') || t.includes('COMPLETED')) return 'kept';
  if (t.includes('NO_SHOW')) return 'no_show';
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const accountId = (req.headers.get('x-account-id') || process.env.DEFAULT_ACCOUNT_ID || '').trim();
    if (!accountId) return NextResponse.json({ error: 'missing_account' }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as CalComPayload;
    const trigger = String(body?.triggerEvent || '').trim();
    if (!trigger) return NextResponse.json({ error: 'bad_payload' }, { status: 400 });

    const status = mapStatus(trigger);
    const p = body?.payload || {};
    const eventId = String(p?.uid || p?.id || p?.eventId || '');
    const startsAt = p?.startTime || p?.start || p?.starts_at || null;
    const endsAt = p?.endTime || p?.end || p?.ends_at || null;
    const attendee = Array.isArray(p?.attendees) ? p.attendees[0] : (p?.attendee || {});
    const email = String(attendee?.email || '').trim().toLowerCase();
    const phoneRaw = String(attendee?.phone || '').trim();
    const phone = toE164US(phoneRaw) || null;

    if (!status || !eventId) return NextResponse.json({ ok: true, ignored: true });

    // Find lead in this account by phone or email
    let leadId: string | null = null;
    if (phone) {
      const { data: l1 } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('account_id', accountId)
        .eq('phone', phone)
        .maybeSingle();
      leadId = l1?.id || null;
    }
    if (!leadId && email) {
      const { data: l2 } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('account_id', accountId)
        .eq('email', email)
        .maybeSingle();
      leadId = l2?.id || null;
    }
    if (!leadId) return NextResponse.json({ ok: true, unmatched: true });

    // Upsert appointment idempotently
    await supabaseAdmin
      .from('appointments')
      .upsert({
        account_id: accountId,
        lead_id: leadId,
        provider: 'calcom',
        provider_event_id: eventId,
        status,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        meta: p || {},
      }, {
        onConflict: 'provider,provider_event_id'
      });

    // Update lead booking fields
    const leadUpdate: any = { last_booking_status: status };
    if (status === 'booked' || status === 'rescheduled') leadUpdate.appointment_set_at = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
    await supabaseAdmin
      .from('leads')
      .update(leadUpdate)
      .eq('id', leadId)
      .eq('account_id', accountId);

    // Insert timeline note as inbound system message
    const note = `(System) Calendar: ${status} ${startsAt ? ' for ' + new Date(startsAt).toLocaleString() : ''}`.trim();
    await supabaseAdmin
      .from('messages_in')
      .insert({
        lead_id: leadId,
        account_id: accountId,
        body: note,
        provider_from: 'system',
        provider_to: 'system'
      });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('calcom webhook error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}


