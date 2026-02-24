/**
 * When "Most likely to buy" is empty, ensure at least demo entries exist
 * so the list always populates. Uses same account as watchlist/session.
 */

import { supabaseAdmin } from '@/lib/supabaseServer';

function demoPhoneForAccount(accountId: string): string {
  const hex = accountId.replace(/-/g, '').slice(0, 4).toLowerCase();
  return `+1555555${hex}`;
}

/**
 * Get or create demo leads (Test, Test SMS) and upsert their scores_next_buy.
 * Idempotent. Call when watchlist would otherwise be empty.
 */
export async function ensureDemoWatchlist(accountId: string): Promise<void> {
  const now = new Date().toISOString();

  // 1) Lead "Test" (email demo)
  let { data: leadEmail } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('account_id', accountId)
    .ilike('email', 'test@test.com')
    .maybeSingle();

  if (!leadEmail) {
    const { data: inserted } = await supabaseAdmin
      .from('leads')
      .insert({
        account_id: accountId,
        name: 'Test',
        email: 'test@test.com',
        phone: 'email:test@test.com',
      })
      .select('id')
      .single();
    if (inserted?.id) leadEmail = inserted;
  }

  if (leadEmail?.id) {
    await supabaseAdmin.from('scores_next_buy').upsert(
      {
        account_id: accountId,
        lead_id: leadEmail.id,
        score: 0.92,
        window: '0-3m',
        reason_json: { source: 'email_reply', summary: 'Replied interested, asked for call' },
        updated_at: now,
      },
      { onConflict: 'account_id,lead_id' }
    );
  }

  // 2) Lead "Test SMS"
  const demoPhone = demoPhoneForAccount(accountId);
  let { data: leadSms } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('account_id', accountId)
    .eq('phone', demoPhone)
    .maybeSingle();

  if (!leadSms) {
    const { data: inserted } = await supabaseAdmin
      .from('leads')
      .insert({
        account_id: accountId,
        name: 'Test SMS',
        phone: demoPhone,
      })
      .select('id')
      .single();
    if (inserted?.id) leadSms = inserted;
  }

  if (leadSms?.id) {
    await supabaseAdmin.from('scores_next_buy').upsert(
      {
        account_id: accountId,
        lead_id: leadSms.id,
        score: 0.85,
        window: '0-3m',
        reason_json: { source: 'sms_reply', summary: 'SMS reply: interested in scheduling' },
        updated_at: now,
      },
      { onConflict: 'account_id,lead_id' }
    );
  }
}
