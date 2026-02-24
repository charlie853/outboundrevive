import { supabaseAdmin } from '@/lib/supabaseServer';
import { openTrackingUrl, unsubTrackingUrl } from './tracking';

/**
 * Compute run_after from delay_days (and optional time window). Returns ISO string.
 */
export function runAfterFromDelay(delayDays: number, _timeWindow?: string | null): string {
  const d = new Date();
  d.setDate(d.getDate() + delayDays);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/**
 * Enqueue a single step send for a lead. Called when campaign is started (step 1) or when step N is due.
 * Skips if lead is suppressed or already sent this step.
 */
export async function enqueueEmailSend(params: {
  accountId: string;
  campaignId: string;
  stepId: string;
  leadId: string;
  sendingInboxId: string;
  threadId?: string | null;
  runAfter: string;
}): Promise<{ id: string } | { error: string }> {
  const { data: existing } = await supabaseAdmin
    .from('email_send_queue')
    .select('id')
    .eq('lead_id', params.leadId)
    .eq('step_id', params.stepId)
    .in('status', ['queued', 'processing'])
    .maybeSingle();

  if (existing) return { id: existing.id };

  const { data, error } = await supabaseAdmin
    .from('email_send_queue')
    .insert({
      account_id: params.accountId,
      campaign_id: params.campaignId,
      step_id: params.stepId,
      lead_id: params.leadId,
      sending_inbox_id: params.sendingInboxId,
      thread_id: params.threadId || null,
      status: 'queued',
      run_after: params.runAfter,
      attempt: 0,
      max_attempts: 3,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: data!.id };
}

/**
 * Inject open and unsub tracking into HTML body. Replaces {{open_tracking_url}} and {{unsub_url}} if present,
 * or appends pixel and unsub link before </body>.
 */
export function injectTrackingIntoHtml(
  html: string,
  baseUrl: string,
  messageId: string
): string {
  const openUrl = openTrackingUrl(baseUrl, messageId);
  const unsubUrl = unsubTrackingUrl(baseUrl, messageId);
  const pixel = `<img src="${openUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;" />`;

  let out = html
    .replace(/\{\{open_tracking_url\}\}/gi, openUrl)
    .replace(/\{\{unsub_url\}\}/gi, unsubUrl)
    .replace(/\{\{unsubscribe_url\}\}/gi, unsubUrl);

  if (!out.includes(openUrl)) {
    out = out.replace(/<\/body\s*>/i, pixel + '</body>');
    if (out === html) out = html + pixel;
  }
  if (!out.includes(unsubUrl)) {
    const unsubLink = `Unsubscribe: <a href="${unsubUrl}">${unsubUrl}</a>`;
    out = out.replace(/<\/body\s*>/i, unsubLink + '</body>');
    if (out === html) out = html + unsubLink;
  }
  return out;
}

/**
 * Enqueue the next step for a lead after a step was just sent.
 * Finds the step that follows the given step_id in the campaign and enqueues with run_after = now + delay_days.
 */
export async function enqueueNextStepAfterSend(params: {
  accountId: string;
  campaignId: string;
  currentStepId: string;
  leadId: string;
  sendingInboxId: string;
  threadId: string;
}): Promise<{ id: string } | { error: string } | null> {
  const { data: steps } = await supabaseAdmin
    .from('email_campaign_steps')
    .select('id, order_index, delay_days, delay_time_window')
    .eq('campaign_id', params.campaignId)
    .order('order_index', { ascending: true });

  const list = (steps || []) as { id: string; order_index: number; delay_days: number; delay_time_window: string | null }[];
  const currentIdx = list.findIndex((s) => s.id === params.currentStepId);
  const next = currentIdx >= 0 && currentIdx < list.length - 1 ? list[currentIdx + 1] : null;
  if (!next) return null;

  const runAfter = runAfterFromDelay(next.delay_days, next.delay_time_window);
  return enqueueEmailSend({
    accountId: params.accountId,
    campaignId: params.campaignId,
    stepId: next.id,
    leadId: params.leadId,
    sendingInboxId: params.sendingInboxId,
    threadId: params.threadId,
    runAfter,
  });
}
