import { supabaseAdmin } from '@/lib/supabaseServer';

export interface SubsequenceContext {
  accountId: string;
  campaignId: string;
  leadId: string;
  threadId: string;
  messageId: string;
  replyBody: string;
  labels: string[];
}

export interface SubsequenceResult {
  triggered: boolean;
  ruleId?: string;
  action?: 'stop' | 'alternate';
  targetCampaignId?: string;
}

/**
 * Evaluate subsequence rules for a campaign. If reply matches a rule (by label or keyword),
 * return the action and log the event. Does not enqueue into alternate flow here; caller does that.
 */
export async function evaluateSubsequenceRules(ctx: SubsequenceContext): Promise<SubsequenceResult> {
  const { data: rules } = await supabaseAdmin
    .from('email_subsequence_rules')
    .select('id, trigger_type, trigger_value, target_flow')
    .eq('campaign_id', ctx.campaignId);

  const list = (rules || []) as { id: string; trigger_type: string; trigger_value: string; target_flow: string }[];
  const body = (ctx.replyBody || '').toLowerCase();

  for (const rule of list) {
    let match = false;
    if (rule.trigger_type === 'label') {
      const want = rule.trigger_value.trim().toLowerCase();
      match = ctx.labels.some((l) => l.toLowerCase() === want);
    } else if (rule.trigger_type === 'keyword') {
      const keywords = rule.trigger_value.split(/[\s,]+/).map((k) => k.trim().toLowerCase()).filter(Boolean);
      match = keywords.some((k) => body.includes(k));
    }
    if (!match) continue;

    const action = rule.target_flow === 'stop' ? 'stop' : 'alternate';
    const targetCampaignId = action === 'alternate' && /^[0-9a-f-]{36}$/i.test(rule.target_flow) ? rule.target_flow : undefined;

    await supabaseAdmin.from('email_events').insert({
      account_id: ctx.accountId,
      campaign_id: ctx.campaignId,
      lead_id: ctx.leadId,
      thread_id: ctx.threadId,
      message_id: ctx.messageId,
      event_type: 'subsequence_triggered',
      meta: { rule_id: rule.id, trigger_value: rule.trigger_value, action, target_campaign_id: targetCampaignId },
    });

    return { triggered: true, ruleId: rule.id, action, targetCampaignId };
  }

  return { triggered: false };
}
