/**
 * Conversation State Helpers
 * 
 * Analyzes conversation history to determine:
 * - Has the lead booked an appointment?
 * - Is the conversation "dead" (no response after multiple attempts)?
 * - Should we send another reminder?
 * 
 * Used by reminder systems to avoid spamming leads who've already converted
 * or who are clearly not interested.
 */

import { supabaseAdmin } from './supabaseServer';

export interface ConversationState {
  hasBooked: boolean;
  hasOptedOut: boolean;
  isDead: boolean;
  lastInboundAt: Date | null;
  lastOutboundAt: Date | null;
  unansweredOutboundCount: number;
  shouldSendReminder: boolean;
  reason?: string;
}

/**
 * Check if a lead has booked based on message intents and keywords
 */
async function checkIfBooked(leadId: string, accountId: string): Promise<boolean> {
  // Check messages_out for booking intent
  const { data: bookingMessages } = await supabaseAdmin
    .from('messages_out')
    .select('id, intent, body')
    .eq('lead_id', leadId)
    .eq('account_id', accountId)
    .or('intent.eq.scheduling,intent.eq.booked');

  if (bookingMessages && bookingMessages.length > 0) {
    return true;
  }

  // Check messages_in for booking keywords
  const { data: inboundMessages } = await supabaseAdmin
    .from('messages_in')
    .select('body')
    .eq('lead_id', leadId)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (inboundMessages) {
    const bookingKeywords = /\b(booked|scheduled|appointment|confirmed|see you|looking forward)\b/i;
    return inboundMessages.some(msg => bookingKeywords.test(msg.body || ''));
  }

  return false;
}

/**
 * Count consecutive unanswered outbound messages
 */
async function getUnansweredCount(leadId: string, accountId: string): Promise<number> {
  // Get recent messages, sorted by time
  const [{ data: outs }, { data: ins }] = await Promise.all([
    supabaseAdmin
      .from('messages_out')
      .select('created_at')
      .eq('lead_id', leadId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('messages_in')
      .select('created_at')
      .eq('lead_id', leadId)
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  if (!outs || outs.length === 0) return 0;

  // Find the most recent inbound message
  const lastInbound = ins && ins.length > 0 ? new Date(ins[0].created_at) : null;

  // Count outbound messages sent after the last inbound
  let count = 0;
  for (const out of outs) {
    const outTime = new Date(out.created_at);
    if (!lastInbound || outTime > lastInbound) {
      count++;
    } else {
      break; // Stop counting once we reach messages before the last inbound
    }
  }

  return count;
}

/**
 * Analyze conversation state for a lead
 */
export async function getConversationState(
  leadId: string,
  accountId: string
): Promise<ConversationState> {
  // Get lead details
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('opted_out, last_inbound_at, last_outbound_at')
    .eq('id', leadId)
    .eq('account_id', accountId)
    .single();

  if (!lead) {
    return {
      hasBooked: false,
      hasOptedOut: false,
      isDead: false,
      lastInboundAt: null,
      lastOutboundAt: null,
      unansweredOutboundCount: 0,
      shouldSendReminder: false,
      reason: 'Lead not found',
    };
  }

  const hasOptedOut = lead.opted_out === true;
  const lastInboundAt = lead.last_inbound_at ? new Date(lead.last_inbound_at) : null;
  const lastOutboundAt = lead.last_outbound_at ? new Date(lead.last_outbound_at) : null;

  // Check if booked
  const hasBooked = await checkIfBooked(leadId, accountId);

  // Get unanswered count
  const unansweredOutboundCount = await getUnansweredCount(leadId, accountId);

  // Conversation is "dead" if:
  // - We've sent 3+ unanswered messages, OR
  // - No inbound reply in 30+ days after our last message
  const daysSinceLastOutbound = lastOutboundAt 
    ? (Date.now() - lastOutboundAt.getTime()) / (1000 * 60 * 60 * 24)
    : 999;

  const isDead = 
    unansweredOutboundCount >= 3 ||
    (lastOutboundAt && !lastInboundAt && daysSinceLastOutbound > 30) ||
    (lastOutboundAt && lastInboundAt && lastOutboundAt > lastInboundAt && daysSinceLastOutbound > 30);

  // Should send reminder if:
  // - NOT opted out
  // - NOT already booked
  // - NOT dead conversation
  const shouldSendReminder = !hasOptedOut && !hasBooked && !isDead;

  let reason: string | undefined;
  if (hasOptedOut) reason = 'Lead opted out';
  else if (hasBooked) reason = 'Lead already booked';
  else if (isDead) reason = 'Conversation is dead (no response)';
  else reason = undefined;

  return {
    hasBooked,
    hasOptedOut,
    isDead,
    lastInboundAt,
    lastOutboundAt,
    unansweredOutboundCount,
    shouldSendReminder,
    reason,
  };
}

/**
 * Batch check: filter leads that should receive reminders
 */
export async function filterLeadsForReminders(
  leadIds: string[],
  accountId: string
): Promise<string[]> {
  const eligibleLeads: string[] = [];

  for (const leadId of leadIds) {
    const state = await getConversationState(leadId, accountId);
    if (state.shouldSendReminder) {
      eligibleLeads.push(leadId);
    } else {
      console.log(`[REMINDER] Skipping lead ${leadId}: ${state.reason}`);
    }
  }

  return eligibleLeads;
}

