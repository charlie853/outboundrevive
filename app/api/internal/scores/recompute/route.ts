import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

function isAdmin(req: NextRequest) {
  const token = (req.headers.get('x-admin-token') || '').trim();
  const adminKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  return !!adminKey && token === adminKey;
}

function monthsBetween(start?: string | null, end?: Date) {
  if (!start) return null;
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return null;
  const ref = end || new Date();
  return (ref.getFullYear() - startDate.getFullYear()) * 12 + (ref.getMonth() - startDate.getMonth());
}

function determineWindow(score: number) {
  if (score >= 0.7) return '0-3m';
  if (score >= 0.45) return '3-6m';
  return '6-12m';
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const accountId = body.account_id || body.tenant_id || null;
    if (!accountId) return NextResponse.json({ error: 'account_id_required' }, { status: 400 });
    const limit = Math.max(1, Math.min(1000, Number(body.limit || 250)));

    const { data: ownerships, error } = await db
      .from('ownerships')
      .select('id, account_id, lead_id, purchased_at, financed_term_months, lease_end_at, vehicle_id')
      .eq('account_id', accountId)
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!ownerships?.length) return NextResponse.json({ ok: true, processed: 0 });

    let processed = 0;
    for (const owner of ownerships) {
      const monthsSincePurchase = monthsBetween(owner.purchased_at);
      const termMonths = owner.financed_term_months || 48;
      const termPct = monthsSincePurchase && termMonths ? Math.min(1, monthsSincePurchase / termMonths) : 0;

      const { data: serviceEvent } = await db
        .from('service_events')
        .select('ro_closed_at, appt_time')
        .eq('account_id', owner.account_id)
        .eq('lead_id', owner.lead_id)
        .order('ro_closed_at', { ascending: false, nullsLast: true })
        .order('appt_time', { ascending: false, nullsLast: true })
        .limit(1)
        .maybeSingle();
      const lastServiceDate = serviceEvent?.ro_closed_at || serviceEvent?.appt_time;
      const daysSinceService = lastServiceDate ? Math.floor((Date.now() - new Date(lastServiceDate).getTime()) / 86_400_000) : null;

      const { data: fact } = await db
        .from('conv_facts')
        .select('value')
        .eq('lead_id', owner.lead_id)
        .eq('key', 'mileage_band')
        .maybeSingle();

      let score = 0.2;
      if (termPct >= 0.8) score += 0.4;
      else if (termPct >= 0.6) score += 0.25;
      else if (termPct >= 0.4) score += 0.15;

      if (daysSinceService !== null) {
        if (daysSinceService > 270) score += 0.25;
        else if (daysSinceService > 180) score += 0.15;
        else score += 0.05;
      }

      if (fact?.value) {
        const mileage = fact.value.toLowerCase();
        if (mileage.includes('75k') || mileage.includes('100k')) score += 0.15;
        else if (mileage.includes('50k')) score += 0.08;
      }

      score = Math.min(0.99, Number(score.toFixed(2)));
      const window = determineWindow(score);
      const reason = {
        term_pct: Number(termPct.toFixed(2)),
        days_since_service: daysSinceService,
        mileage_band: fact?.value || null,
      };

      await db
        .from('scores_next_buy')
        .upsert(
          {
            account_id: owner.account_id,
            lead_id: owner.lead_id,
            score,
            window_bucket: window,
            reason_json: reason,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'account_id,lead_id' }
        )
        .select('id')
        .single();

      processed++;
    }

    return NextResponse.json({ ok: true, processed });
  } catch (err: any) {
    console.error('[scores/recompute] crash', err);
    return NextResponse.json({ error: 'server_error', detail: err?.message || String(err) }, { status: 500 });
  }
}


