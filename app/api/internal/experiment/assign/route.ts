import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

function isAdmin(req: NextRequest) {
  const token = (req.headers.get('x-admin-token') || '').trim();
  const adminKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  return !!adminKey && token === adminKey;
}

async function ensureExperiment(accountId: string, key: string, holdoutPct?: number) {
  const { data } = await db.from('experiments').select('*').eq('account_id', accountId).eq('key', key).maybeSingle();
  if (data) return data;
  const { data: created, error } = await db
    .from('experiments')
    .insert({
      account_id: accountId,
      key,
      name: key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      holdout_pct: holdoutPct ?? 0.1,
    })
    .select('*')
    .single();
  if (error) throw error;
  return created;
}

export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const accountId = body.account_id || body.tenant_id;
    if (!accountId) return NextResponse.json({ error: 'account_id_required' }, { status: 400 });

    const leadIds: string[] = Array.isArray(body.lead_ids)
      ? body.lead_ids
      : body.lead_id
        ? [body.lead_id]
        : [];
    if (!leadIds.length) return NextResponse.json({ error: 'lead_ids_required' }, { status: 400 });

    const experimentKey = body.experiment_key || 'service_upsell_t48h';
    const experiment = await ensureExperiment(accountId, experimentKey, body.holdout_pct);
    const holdoutPct = typeof body.holdout_pct === 'number' ? body.holdout_pct : experiment.holdout_pct || 0.1;

    const assignments: any[] = [];
    for (const leadId of leadIds) {
      const { data: existing } = await db
        .from('experiment_assignments')
        .select('id, variant')
        .eq('experiment_id', experiment.id)
        .eq('lead_id', leadId)
        .maybeSingle();
      if (existing) {
        assignments.push({ lead_id: leadId, variant: existing.variant, reused: true });
        continue;
      }

      const variant = Math.random() < holdoutPct ? 'control' : 'treatment';
      const { data, error } = await db
        .from('experiment_assignments')
        .insert({
          experiment_id: experiment.id,
          account_id: accountId,
          lead_id: leadId,
          variant,
        })
        .select('id, variant')
        .single();
      if (error) {
        assignments.push({ lead_id: leadId, error: error.message });
      } else {
        assignments.push({ lead_id: leadId, variant: data?.variant, reused: false });
      }
    }

    return NextResponse.json({ ok: true, experiment_id: experiment.id, assignments });
  } catch (err: any) {
    console.error('[experiment/assign] crash', err);
    return NextResponse.json({ error: 'server_error', detail: err?.message || String(err) }, { status: 500 });
  }
}


