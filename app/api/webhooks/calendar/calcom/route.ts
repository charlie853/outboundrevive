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
    const eventId = String(p?.uid || p?.id || p?.eventId || p?.bookingUid || p?.bookingId || '').trim();
    const startsAtRaw = p?.startTime || p?.start || p?.starts_at || p?.startsAt || null;
    const endsAtRaw = p?.endTime || p?.end || p?.ends_at || p?.endsAt || null;
    const scheduledAt = startsAtRaw ? new Date(startsAtRaw).toISOString() : null;
    const endsAt = endsAtRaw ? new Date(endsAtRaw).toISOString() : null;
    const attendee = Array.isArray(p?.attendees) ? p.attendees[0] : (p?.attendee || {});
    const email = String(attendee?.email || attendee?.mail || '').trim().toLowerCase();
    const phoneRaw = String(
      attendee?.phone ||
      attendee?.phoneNumber ||
      attendee?.smsNumber ||
      attendee?.sms ||
      attendee?.phone_number ||
      attendee?.metadata?.phone ||
      attendee?.metadata?.phoneNumber ||
      ''
    ).trim();
    const phone = toE164US(phoneRaw) || null;

    const eventType =
      p?.eventType?.name ||
      p?.eventType?.title ||
      p?.title ||
      p?.name ||
      null;

    console.log('[calcom] Webhook received', {
      trigger,
      status,
      eventId,
      startsAt: scheduledAt,
      email,
      phoneRaw,
      phone,
      accountId,
    });

    if (!status || !eventId) {
      console.warn('[calcom] Ignoring webhook due to missing status/eventId', { trigger, eventId, status });
      return NextResponse.json({ ok: true, ignored: true });
    }

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
    if (!leadId) {
      console.warn('[calcom] No matching lead found for booking', { accountId, phone, email, eventId });
      return NextResponse.json({ ok: true, unmatched: true });
    }

    console.log('[calcom] Upserting appointment', { leadId, eventId, status, scheduledAt });
    // Upsert appointment idempotently
    const { error: upsertError } = await supabaseAdmin
      .from('appointments')
      .upsert({
        account_id: accountId,
        lead_id: leadId,
        provider: 'calcom',
        provider_event_id: eventId,
        provider_booking_uid: String(p?.bookingUid || p?.bookingId || eventId || ''),
        status,
        scheduled_at: scheduledAt,
        attendee_name: attendee?.name || attendee?.fullName || attendee?.full_name || null,
        attendee_email: email || null,
        attendee_phone: phone || phoneRaw || null,
        event_type: eventType,
        notes: p?.notes || null,
        metadata: p || {},
        duration_minutes: typeof p?.duration === 'number'
          ? p.duration
          : typeof p?.durationMinutes === 'number'
            ? p.durationMinutes
            : typeof p?.duration_minutes === 'number'
              ? p.duration_minutes
              : null,
      }, {
        onConflict: 'provider,provider_event_id'
      });

    if (upsertError) {
      console.error('[calcom] Failed to upsert appointment', { eventId, error: upsertError.message });
      return NextResponse.json({ error: 'upsert_failed' }, { status: 500 });
    }

    // Update lead's booking status
    const leadUpdate: any = {};
    if (status === 'booked' || status === 'rescheduled') {
      leadUpdate.booked = true;
      leadUpdate.appointment_set_at = scheduledAt || new Date().toISOString();
    } else if (status === 'cancelled') {
      leadUpdate.booked = false;
    } else if (status === 'no_show') {
      // Keep booked=true but mark as no-show in appointments table
      leadUpdate.booked = true;
    }
    
    if (Object.keys(leadUpdate).length > 0) {
      console.log('[calcom] Updating lead booking status', { leadId, leadUpdate });
      await supabaseAdmin
        .from('leads')
        .update(leadUpdate)
        .eq('id', leadId)
        .eq('account_id', accountId);
    }

    // Insert timeline note as inbound system message
    const note = `(System) Calendar: ${status} ${scheduledAt ? ' for ' + new Date(scheduledAt).toLocaleString() : ''}`.trim();
    await supabaseAdmin
      .from('messages_in')
      .insert({
        lead_id: leadId,
        account_id: accountId,
        body: note,
        provider_from: 'system',
        provider_to: 'system'
      });

    console.log('[calcom] Appointment processed successfully', { leadId, eventId, status });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('calcom webhook error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}


