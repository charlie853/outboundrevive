import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { toE164US } from '@/lib/phone';

export const runtime = 'nodejs';

type CalendlyPayload = {
  event?: string; // 'invitee.created'|'invitee.canceled'|'invitee_no_show' etc.
  payload?: any;
};

function mapStatus(ev: string): 'booked'|'rescheduled'|'canceled'|'kept'|'no_show'|null {
  const t = ev.toLowerCase();
  if (t.includes('invitee.created')) return 'booked';
  if (t.includes('resched')) return 'rescheduled';
  if (t.includes('canceled') || t.includes('cancelled')) return 'canceled';
  if (t.includes('no_show')) return 'no_show';
  if (t.includes('checked_in') || t.includes('completed')) return 'kept';
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const accountId = (req.headers.get('x-account-id') || process.env.DEFAULT_ACCOUNT_ID || '').trim();
    if (!accountId) return NextResponse.json({ error: 'missing_account' }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as CalendlyPayload;
    const event = String(body?.event || '').trim();
    if (!event) return NextResponse.json({ error: 'bad_payload' }, { status: 400 });

    const status = mapStatus(event) as any;
    const p = body?.payload || {};
    const eventId = String(p?.event_uuid || p?.uuid || p?.id || '');
    const startsAt = p?.scheduled_event?.start_time || p?.start_time || null;
    const endsAt = p?.scheduled_event?.end_time || p?.end_time || null;
    const invitee = p?.invitee || {};
    const email = String(invitee?.email || '').trim().toLowerCase();
    const phoneRaw = String(invitee?.text_reminder_number || '').trim();
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
        provider: 'calendly',
        provider_event_id: eventId,
        status,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        meta: p || {},
      }, { onConflict: 'provider,provider_event_id' });

    const leadUpdate: any = { last_booking_status: status };
    if (status === 'booked' || status === 'rescheduled') leadUpdate.appointment_set_at = startsAt ? new Date(startsAt).toISOString() : new Date().toISOString();
    await supabaseAdmin
      .from('leads')
      .update(leadUpdate)
      .eq('id', leadId)
      .eq('account_id', accountId);

    const note = `(System) Calendar: ${status} ${startsAt ? ' for ' + new Date(startsAt).toLocaleString() : ''}`.trim();
    await supabaseAdmin
      .from('messages_in')
      .insert({ lead_id: leadId, account_id: accountId, body: note, provider_from: 'system', provider_to: 'system' });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('calendly webhook error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}


