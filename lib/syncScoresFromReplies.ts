/**
 * Populate scores_next_buy by analyzing email reply and SMS reply content.
 * Used so "Most likely to buy" is driven by actual email + text leads.
 */

import { supabaseAdmin } from '@/lib/supabaseServer';
import { scoreReplyText } from '@/lib/replyInterestScore';

export type SyncResult = { upserted: number; errors: number };

/**
 * For a given account, fetch all leads with reply content (email inbound + SMS),
 * score each with replyInterestScore, and upsert into scores_next_buy.
 */
export async function syncScoresFromReplies(accountId: string): Promise<SyncResult> {
  const result: SyncResult = { upserted: 0, errors: 0 };

  const emailRepliesByLead = new Map<string, string>();

  try {
    // 1) Latest inbound email reply per lead (threads for this account, messages direction='in')
    // If email_threads/email_messages don't exist or fail, we still run SMS sync below
    const { data: threads, error: threadsErr } = await supabaseAdmin
      .from('email_threads')
      .select('id, lead_id')
      .eq('account_id', accountId);

    if (!threadsErr && threads && threads.length > 0) {
      const threadIds = threads.map((t: { id: string }) => t.id).filter(Boolean);
      const { data: messages } = await supabaseAdmin
        .from('email_messages')
        .select('thread_id, body_plain, created_at')
        .eq('direction', 'in')
        .in('thread_id', threadIds)
        .not('body_plain', 'is', null);

      const threadToLead = new Map<string, string>();
      threads.forEach((t: { id: string; lead_id: string }) => threadToLead.set(t.id, t.lead_id));

      type Msg = { thread_id: string; body_plain: string; created_at: string };
      const sorted = ((messages ?? []) as Msg[]).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      const byLead = new Map<string, string>();
      for (const m of sorted) {
        const leadId = threadToLead.get(m.thread_id);
        if (!leadId || byLead.has(leadId)) continue;
        byLead.set(leadId, m.body_plain || '');
      }
      byLead.forEach((body, leadId) => emailRepliesByLead.set(leadId, body));
    }
  } catch (emailErr) {
    // Tables may not exist or RLS may block; continue with SMS-only
    if (process.env.NODE_ENV === 'development') {
      console.warn('[syncScoresFromReplies] email part skipped', emailErr);
    }
  }

    // 2) Latest SMS reply per lead (messages_in for this account)
    const { data: smsRows } = await supabaseAdmin
      .from('messages_in')
      .select('lead_id, body, created_at')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    const smsByLead = new Map<string, string>();
    (smsRows ?? []).forEach((r: { lead_id: string; body: string }) => {
      if (r.lead_id && !smsByLead.has(r.lead_id)) smsByLead.set(r.lead_id, r.body || '');
    });

    // 3) All leads that have at least one reply (email or SMS)
    const allLeadIds = new Set([...emailRepliesByLead.keys(), ...smsByLead.keys()]);

    for (const leadId of allLeadIds) {
      const emailBody = emailRepliesByLead.get(leadId) ?? '';
      const smsBody = smsByLead.get(leadId) ?? '';
      const emailScore = emailBody.trim() ? scoreReplyText(emailBody, 'email_reply') : null;
      const smsScore = smsBody.trim() ? scoreReplyText(smsBody, 'sms_reply') : null;

      const best = [emailScore, smsScore].filter(Boolean).sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0))[0];
      if (!best) continue;

      const { error } = await supabaseAdmin.from('scores_next_buy').upsert(
        {
          account_id: accountId,
          lead_id: leadId,
          score: best.score,
          window: best.window,
          reason_json: { source: best.source, summary: best.summary },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,lead_id' }
      );
      if (error) result.errors += 1;
      else result.upserted += 1;
    }

    return result;
  } catch (e) {
    console.error('[syncScoresFromReplies]', e);
    throw e;
  }
}
