import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEMO_NAME = 'Test SMS';
const INBOUND_BODY = "Yes, I'd like to schedule a call. What times work next week?";

function demoPhoneForAccount(accountId: string): string {
  const hex = accountId.replace(/-/g, '').slice(0, 4).toLowerCase();
  return `+1555555${hex}`;
}

/**
 * Seed demo SMS: one lead (Test SMS) with an inbound message showing interest,
 * and upsert scores_next_buy so they appear in "Most likely to buy". Idempotent.
 */
export async function POST(req: NextRequest) {
  const { accountId, error } = await getUserAndAccountFromRequest(req, { requireUser: true });
  if (error || !accountId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const demoPhone = demoPhoneForAccount(accountId);

  try {
    let { data: lead } = await db.from('leads').select('id').eq('account_id', accountId).eq('phone', demoPhone).maybeSingle();
    if (!lead) {
      const { data: inserted } = await db
        .from('leads')
        .insert({ account_id: accountId, name: DEMO_NAME, phone: demoPhone })
        .select('id')
        .single();
      if (!inserted?.id) return NextResponse.json({ error: 'lead_insert_failed' }, { status: 500 });
      lead = inserted;
    }
    const leadId = lead.id;

    const { data: existing } = await db.from('messages_in').select('id').eq('lead_id', leadId).eq('account_id', accountId).limit(1);
    if (!existing?.length) {
      await db.from('messages_in').insert({
        lead_id: leadId,
        account_id: accountId,
        body: INBOUND_BODY,
        provider_from: demoPhone,
        provider_to: '+15555550000',
        created_at: new Date().toISOString(),
      });
    }

    await db
      .from('scores_next_buy')
      .upsert(
        {
          account_id: accountId,
          lead_id: leadId,
          score: 0.85,
          window: '0-3m',
          reason_json: { source: 'sms_reply', summary: 'SMS reply: interested in scheduling' },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,lead_id' }
      );

    return NextResponse.json({ ok: true, lead_id: leadId });
  } catch (e: any) {
    console.error('[demo/seed-sms]', e);
    return NextResponse.json({ error: 'seed_failed', detail: e?.message || String(e) }, { status: 500 });
  }
}
