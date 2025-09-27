// app/api/webhooks/twilio/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabaseServer';

export const runtime = 'nodejs';

// Status rank (monotonic: only move forward; delivered outranks failed)
const STATUS_RANK: Record<string, number> = { queued: 1, sent: 2, failed: 3, delivered: 4 };
function isProgress(oldS?: string|null, nextS?: string|null) {
  const o = STATUS_RANK[(oldS||'').toLowerCase()] ?? 0;
  const n = STATUS_RANK[(nextS||'').toLowerCase()] ?? 0;
  return n >= o;
}

// Map Twilio statuses to our canonical states
function normalizeStatus(s: string): 'queued'|'sent'|'delivered'|'failed' {
  const t = (s || '').toLowerCase();
  if (t === 'accepted' || t === 'queued') return 'queued';
  if (t === 'sending' || t === 'sent') return 'sent';
  if (t === 'delivered' || t === 'read') return 'delivered';
  if (t === 'undelivered' || t === 'failed') return 'failed';
  // default: keep as best-effort
  return (['queued','sent','delivered','failed'].includes(t) ? (t as any) : 'queued');
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const messageSid     = String(form.get('MessageSid') ?? '').trim();
    const messageStatus  = String(form.get('MessageStatus') ?? form.get('SmsStatus') ?? '').trim();
    const nowIso         = new Date().toISOString();

    // If Twilio didn't include a SID, just 200 OK (Twilio only needs a 200)
    if (!messageSid) {
      return new NextResponse('<Response/>', { headers: { 'content-type': 'text/xml' } });
    }

    // Fetch existing row to apply monotonic status and timestamp guards
    let existing: any = null;
    {
      const sel1 = await supabaseAdmin
        .from('messages_out')
        .select('id, sid, provider_status, status, queued_at, sent_at, delivered_at, failed_at')
        .eq('sid', messageSid)
        .maybeSingle();
      if (!sel1.error && sel1.data) {
        existing = sel1.data;
      } else {
        // fallback to provider_sid if present in schema
        const sel2 = await supabaseAdmin
          .from('messages_out')
          .select('id, sid, provider_status, status, queued_at, sent_at, delivered_at, failed_at')
          .eq('provider_sid', messageSid)
          .maybeSingle();
        if (!sel2.error && sel2.data) existing = sel2.data;
      }
    }
    const prev = existing?.provider_status || existing?.status || null;
    const next = normalizeStatus(messageStatus);
    const willUpdateStatus = isProgress(prev, next);

    // Build extended deliverability patch (new columns) + legacy fields (back-compat)
    const patchFull: Record<string, any> = {};
    // Only update status fields if we are progressing or we didn't have a prior status
    if (willUpdateStatus || !prev) {
      patchFull.provider_status = next;              // NEW
      patchFull.status = next;                       // legacy (keep)
    }
    // Always record provider error code if present (doesn't affect monotonicity)
    const errorCodeStr = (String(form.get('ErrorCode') ?? '').trim() || null);
    patchFull.provider_error_code = errorCodeStr;    // NEW
    patchFull.error_code = errorCodeStr;             // legacy (keep)

    // Timestamps: set each only once
    if (next === 'queued'    && !(existing?.queued_at))    patchFull.queued_at = nowIso;
    if (next === 'sent'      && !(existing?.sent_at))      patchFull.sent_at = nowIso;
    if (next === 'delivered' && !(existing?.delivered_at)) patchFull.delivered_at = nowIso;
    if (next === 'failed'    && !(existing?.failed_at))    patchFull.failed_at = nowIso;

    // If the first status we ever see is 'delivered', backfill earlier timestamps
    // from the delivery timestamp so they never appear *after* delivery.
    if (next === 'delivered') {
      const deliveryTs =
        (patchFull.delivered_at as string | undefined) ??
        (existing?.delivered_at as string | undefined) ??
        nowIso;

      if (!(existing?.sent_at) && !('sent_at' in patchFull)) {
        patchFull.sent_at = deliveryTs;
      }
      if (!(existing?.queued_at) && !('queued_at' in patchFull)) {
        patchFull.queued_at = deliveryTs;
      }
    }

    // Update messages_out safely:
    // 1) try by `sid` (most common), 2) fall back to `provider_sid` (older schema),
    // 3) if still unmatched, attempt legacy-only fields to tolerate partial migrations.
    let matched = false;

    // 1) Try update by `sid`
    const upd1 = await supabaseAdmin
      .from('messages_out')
      .update(patchFull)
      .eq('sid', messageSid)
      .select('id');

    if (upd1.error) {
      console.error('[STATUS] messages_out update by sid error:', upd1.error);
    } else if ((upd1.data?.length ?? 0) > 0) {
      matched = true;
      console.log('[STATUS] updated messages_out by sid:', messageSid, patchFull.provider_status);
      console.log('[STATUS] messages_out', { sid: messageSid, prev, next, applied: patchFull.provider_status ?? prev });
    }

    // 2) If not matched, try `provider_sid`
    if (!matched) {
      const upd2 = await supabaseAdmin
        .from('messages_out')
        .update(patchFull)
        .eq('provider_sid', messageSid)
        .select('id');

      if (upd2.error) {
        // If the column doesn't exist in this schema, log a warning and continue.
        console.warn('[STATUS] update by provider_sid (maybe column missing):', upd2.error.message);
      } else if ((upd2.data?.length ?? 0) > 0) {
        matched = true;
        console.log('[STATUS] updated messages_out by provider_sid:', messageSid, patchFull.provider_status);
        console.log('[STATUS] messages_out', { sid: messageSid, prev, next, applied: patchFull.provider_status ?? prev });
      }
    }

    // 3) Legacy-only fallback if still not matched (older deployments without new columns)
    if (!matched) {
      const legacyPatch: Record<string, any> = { error_code: errorCodeStr || null };
      if (willUpdateStatus || !prev) legacyPatch.status = next;

      const leg1 = await supabaseAdmin
        .from('messages_out')
        .update(legacyPatch)
        .eq('sid', messageSid)
        .select('id');

      if (leg1.error) {
        console.warn('[STATUS] legacy update by sid error:', leg1.error.message);
      } else if ((leg1.data?.length ?? 0) > 0) {
        matched = true;
        console.log('[STATUS] legacy updated by sid:', messageSid, legacyPatch.status);
      }

      if (!matched) {
        const leg2 = await supabaseAdmin
          .from('messages_out')
          .update(legacyPatch)
          .eq('provider_sid', messageSid)
          .select('id');

        if (leg2.error) {
          console.warn('[STATUS] legacy update by provider_sid error:', leg2.error.message);
        } else if ((leg2.data?.length ?? 0) > 0) {
          matched = true;
          console.log('[STATUS] legacy updated by provider_sid:', messageSid, legacyPatch.status);
        }
      }
    }

    // Keep your existing LEADS update (UI reads from here) — IMPORTANT TO KEEP
    const { error: leadsErr } = await supabaseAdmin
      .from('leads')
      .update(willUpdateStatus || !prev ? { delivery_status: next, error_code: errorCodeStr || null } : { error_code: errorCodeStr || null })
      .eq('last_message_sid', messageSid);
    if (leadsErr) console.error('[STATUS] leads update error:', leadsErr);

    // Keep your deliverability trail — IMPORTANT TO KEEP
    await supabaseAdmin.from('deliverability_events').insert({
      message_id: null,
      type: next || 'unknown',
      meta_json: { messageSid, twilioStatus: messageStatus, errorCode: errorCodeStr || null },
    });

    console.log('[STATUS] webhook complete', { sid: messageSid, received: messageStatus, normalized: next, progressed: willUpdateStatus, hadPrev: !!prev });

    // Twilio only needs a 200; TwiML response is fine
    return new NextResponse('<Response/>', { headers: { 'content-type': 'text/xml' } });
  } catch (e) {
    console.error('[STATUS] Handler exception:', e);
    return new NextResponse('<Response/>', { headers: { 'content-type': 'text/xml' } });
  }
}