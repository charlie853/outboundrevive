import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

type VehicleInput = {
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  mileage_band?: string | null;
  mileage?: number | null;
};

type ServiceEventInput = {
  account_id: string;
  external_id?: string | null;
  lead_id?: string | null;
  lead_phone?: string | null;
  lead_name?: string | null;
  appt_time?: string | null;
  ro_opened_at?: string | null;
  ro_closed_at?: string | null;
  advisor?: string | null;
  location_id?: string | null;
  services?: Record<string, any> | null;
  vehicle?: VehicleInput | null;
};

function isAuthorized(req: NextRequest) {
  const header = (req.headers.get('x-admin-token') || '').trim();
  const adminKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  return !!adminKey && header === adminKey;
}

function toE164(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.trim().startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

async function resolveLead(accountId: string, leadId?: string | null, leadPhone?: string | null, leadName?: string | null) {
  if (leadId) {
    const { data } = await db.from('leads').select('id').eq('id', leadId).eq('account_id', accountId).maybeSingle();
    if (data?.id) return data.id;
  }
  const phone = toE164(leadPhone);
  if (!phone) return null;
  const { data } = await db
    .from('leads')
    .select('id')
    .eq('account_id', accountId)
    .eq('phone', phone)
    .maybeSingle();
  if (data?.id) return data.id;

  // Optionally create a lightweight lead so the service event is linked
  const { data: created, error } = await db
    .from('leads')
    .insert({
      account_id: accountId,
      phone,
      name: leadName || null,
      status: 'pending',
    })
    .select('id')
    .single();
  if (error) {
    console.warn('[appointments/import] Could not create fallback lead', error.message);
    return null;
  }
  return created?.id ?? null;
}

async function ensureVehicle(accountId: string, vehicle?: VehicleInput | null) {
  if (!vehicle) return null;
  const payload = {
    account_id: accountId,
    vin: vehicle.vin?.trim() || null,
    year: vehicle.year ?? null,
    make: vehicle.make?.trim() || null,
    model: vehicle.model?.trim() || null,
    trim: vehicle.trim?.trim() || null,
    mileage_band: vehicle.mileage_band || null,
    mileage: vehicle.mileage ?? null,
  };

  if (!payload.vin && !payload.make && !payload.model) return null;

  if (payload.vin) {
    const { data } = await db
      .from('vehicles')
      .select('id')
      .eq('account_id', accountId)
      .eq('vin', payload.vin)
      .maybeSingle();
    if (data?.id) {
      await db.from('vehicles').update(payload).eq('id', data.id);
      return data.id;
    }
  }

  const { data, error } = await db
    .from('vehicles')
    .insert(payload)
    .select('id')
    .single();
  if (error) {
    console.warn('[appointments/import] vehicle insert failed', error.message);
    return null;
  }
  return data?.id ?? null;
}

async function ensureOwnership(accountId: string, leadId: string | null, vehicleId: string | null) {
  if (!leadId || !vehicleId) return;
  await db
    .from('ownerships')
    .upsert(
      {
        account_id: accountId,
        lead_id: leadId,
        vehicle_id: vehicleId,
      },
      { onConflict: 'account_id,lead_id,vehicle_id' }
    )
    .select('id')
    .single()
    .catch((err) => console.warn('[appointments/import] ownership upsert warn', err.message));
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const records: ServiceEventInput[] = Array.isArray(body?.records)
      ? body.records
      : Array.isArray(body)
        ? body
        : body?.records
          ? [body.records]
          : [];

    if (!records.length) {
      return NextResponse.json({ error: 'no_records' }, { status: 400 });
    }

    const results: any[] = [];
    for (const rec of records) {
      if (!rec?.account_id) {
        results.push({ ok: false, reason: 'missing_account_id' });
        continue;
      }

      const accountId = rec.account_id;
      const leadId = await resolveLead(accountId, rec.lead_id, rec.lead_phone, rec.lead_name);
      const vehicleId = await ensureVehicle(accountId, rec.vehicle || undefined);
      if (leadId && vehicleId) {
        await ensureOwnership(accountId, leadId, vehicleId);
      }

      const externalId = rec.external_id || rec.ro_opened_at || rec.appt_time
        ? `${rec.external_id || rec.ro_opened_at || rec.appt_time}`
        : `svc-${accountId}-${leadId || 'unknown'}-${rec.appt_time || Date.now()}`;

      const payload = {
        account_id: accountId,
        lead_id: leadId,
        vehicle_id: vehicleId,
        appt_time: rec.appt_time || null,
        ro_opened_at: rec.ro_opened_at || null,
        ro_closed_at: rec.ro_closed_at || null,
        advisor: rec.advisor || null,
        location_id: rec.location_id || null,
        services: rec.services || null,
        external_id: externalId,
        status: rec.ro_closed_at ? 'closed' : 'scheduled',
      };

      const { data, error } = await db
        .from('service_events')
        .upsert(payload, { onConflict: 'account_id,external_id' })
        .select('id')
        .single();

      if (error) {
        console.error('[appointments/import] upsert error', error.message);
        results.push({ ok: false, reason: error.message, external_id: externalId });
        continue;
      }

      results.push({ ok: true, service_event_id: data.id, external_id: externalId });
    }

    const inserted = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, inserted, results });
  } catch (err: any) {
    console.error('[appointments/import] crash', err);
    return NextResponse.json({ error: 'server_error', detail: err?.message || String(err) }, { status: 500 });
  }
}


