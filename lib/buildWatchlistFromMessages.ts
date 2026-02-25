/**
 * Build "Most likely to buy" by reading SMS (Messaging tab) and email reply content
 * and scoring with signals (interest phrases, opt-out, etc.). Used so the list
 * is always derived from actual message content in the same request.
 */

import { supabaseAdmin } from '@/lib/supabaseServer';
import { scoreReplyText } from '@/lib/replyInterestScore';

export type WatchlistItem = {
  score: number;
  window: string;
  reasons: { source?: string; summary?: string };
  updated_at?: string;
  lead: { id: string; name: string | null; phone: string; email?: string | null; [k: string]: unknown };
};

/**
 * Read texts (messages_in) and emails (inbound email_messages) for the account,
 * score each with replyInterestScore signals, and return ranked list with lead details.
 */
export async function buildWatchlistFromMessages(
  accountId: string,
  options: { windowFilter?: string | null; limit?: number } = {}
): Promise<WatchlistItem[]> {
  const { windowFilter = null, limit = 50 } = options;
  const capLimit = Math.max(1, Math.min(200, limit));
  const now = new Date().toISOString();

  // 1) SMS: all inbound messages in the Messaging tab (messages_in)
  const smsByLead = new Map<string, string>();
  const { data: smsRows } = await supabaseAdmin
    .from('messages_in')
    .select('lead_id, body, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  for (const r of smsRows ?? []) {
    const row = r as { lead_id: string; body: string };
    if (row.lead_id && !smsByLead.has(row.lead_id)) {
      smsByLead.set(row.lead_id, (row.body ?? '').trim());
    }
  }

  // 2) Email: inbound reply content (email_threads + email_messages direction=in)
  const emailByLead = new Map<string, string>();
  try {
    const { data: threads } = await supabaseAdmin
      .from('email_threads')
      .select('id, lead_id')
      .eq('account_id', accountId);

    if (threads && threads.length > 0) {
      const threadIds = threads.map((t: { id: string }) => t.id);
      const { data: messages } = await supabaseAdmin
        .from('email_messages')
        .select('thread_id, body_plain, created_at')
        .eq('direction', 'in')
        .in('thread_id', threadIds);

      const threadToLead = new Map<string, string>();
      threads.forEach((t: { id: string; lead_id: string }) => threadToLead.set(t.id, t.lead_id));
      type M = { thread_id: string; body_plain: string; created_at: string };
      const sorted = (messages ?? []).slice().sort(
        (a: M, b: M) => (b.created_at || '').localeCompare(a.created_at || '')
      );
      for (const m of sorted as M[]) {
        const leadId = threadToLead.get(m.thread_id);
        if (leadId && !emailByLead.has(leadId)) {
          emailByLead.set(leadId, (m.body_plain ?? '').trim());
        }
      }
    }
  } catch (_) {
    // email_threads / email_messages may not exist
  }

  const allLeadIds = new Set<string>([...smsByLead.keys(), ...emailByLead.keys()]);
  if (allLeadIds.size === 0) return [];

  // 3) Lead details (core fields only for compatibility)
  const { data: leadsRows } = await supabaseAdmin
    .from('leads')
    .select('id, name, phone, email')
    .eq('account_id', accountId)
    .in('id', [...allLeadIds]);

  const leadMap = new Map<string, WatchlistItem['lead']>();
  for (const l of leadsRows ?? []) {
    const row = l as { id: string; name: string | null; phone: string; email?: string | null };
    leadMap.set(row.id, {
      id: row.id,
      name: row.name ?? null,
      phone: row.phone ?? '',
      email: row.email ?? null,
    });
  }

  // 4) Score each lead from their reply content (signals)
  const scored: WatchlistItem[] = [];
  for (const leadId of allLeadIds) {
    const smsBody = smsByLead.get(leadId) ?? '';
    const emailBody = emailByLead.get(leadId) ?? '';
    const emailResult = emailBody ? scoreReplyText(emailBody, 'email_reply') : null;
    const smsResult = smsBody ? scoreReplyText(smsBody, 'sms_reply') : null;
    const best = [emailResult, smsResult].filter(Boolean).sort((a, b) => (b!.score - a!.score))[0];
    if (!best) continue;

    const lead = leadMap.get(leadId);
    if (!lead) continue;

    if (windowFilter && best.window !== windowFilter) continue;

    scored.push({
      score: best.score,
      window: best.window,
      reasons: { source: best.source, summary: best.summary },
      updated_at: now,
      lead,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, capLimit);
}

/**
 * Persist watchlist items to scores_next_buy so other code can read from DB.
 */
export async function persistWatchlistToDb(accountId: string, items: WatchlistItem[]): Promise<void> {
  const now = new Date().toISOString();
  for (const item of items) {
    await supabaseAdmin.from('scores_next_buy').upsert(
      {
        account_id: accountId,
        lead_id: item.lead.id,
        score: item.score,
        window: item.window,
        reason_json: item.reasons,
        updated_at: now,
      },
      { onConflict: 'account_id,lead_id' }
    );
  }
}
