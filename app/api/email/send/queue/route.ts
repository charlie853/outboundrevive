import { NextRequest, NextResponse } from 'next/server';
import { enqueueEmailSend } from '@/lib/email/queue';
import { requireEmailAccount } from '@/lib/email/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Enqueue one or more email sends (e.g. when launching a campaign or advancing steps).
 * Body: { items: [{ campaign_id, step_id, lead_id, sending_inbox_id, run_after? }] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) return NextResponse.json({ error: 'items array required' }, { status: 400 });

  const runAfterDefault = new Date().toISOString();
  const results: { lead_id: string; step_id: string; id?: string; error?: string }[] = [];

  for (const it of items) {
    const campaignId = it.campaign_id;
    const stepId = it.step_id;
    const leadId = it.lead_id;
    const sendingInboxId = it.sending_inbox_id;
    const runAfter = it.run_after || runAfterDefault;
    if (!campaignId || !stepId || !leadId || !sendingInboxId) {
      results.push({ lead_id: leadId, step_id: stepId, error: 'missing_field' });
      continue;
    }
    const result = await enqueueEmailSend({
      accountId,
      campaignId,
      stepId,
      leadId,
      sendingInboxId,
      threadId: it.thread_id ?? null,
      runAfter,
    });
    if ('error' in result) {
      results.push({ lead_id: leadId, step_id: stepId, error: result.error });
    } else {
      results.push({ lead_id: leadId, step_id: stepId, id: result.id });
    }
  }

  return NextResponse.json({ queued: results.filter((r) => r.id).length, results });
}
