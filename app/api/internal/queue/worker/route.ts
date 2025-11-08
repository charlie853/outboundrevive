import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { sendSms } from '@/lib/twilio';

export const runtime = 'nodejs';

type QueueItem = {
  id: string;
  account_id: string;
  lead_id: string;
  body: string;
  attempt: number;
  max_attempts: number;
};

type LeadRow = {
  id: string;
  phone: string | null;
  intro_sent_at?: string | null;
};

async function isAutotexterEnabled(accountId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('account_settings')
    .select('autotexter_enabled')
    .eq('account_id', accountId)
    .maybeSingle();
  return !!data?.autotexter_enabled;
}

function backoffDelaySeconds(attempt: number) {
  const exp = Math.pow(2, attempt) * 5;
  return Math.min(exp, 60 * 15);
}

export async function POST(req: NextRequest) {
  try {
    const adminHeader = (req.headers.get('x-admin-token') || '').trim();
    const adminWant = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
    if (!adminHeader || !adminWant || adminHeader !== adminWant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nowIso = new Date().toISOString();

    const { data: items, error } = await supabaseAdmin
      .from('send_queue')
      .select('id, account_id, lead_id, body, attempt, max_attempts')
      .eq('status', 'queued')
      .lte('run_after', nowIso)
      .order('run_after', { ascending: true })
      .limit(10);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results: any[] = [];
    if (!items?.length) {
      return NextResponse.json({ ok: true, processed: 0, results });
    }

    for (const item of items as QueueItem[]) {
      const lockResult = await supabaseAdmin
        .from('send_queue')
        .update({ status: 'processing', updated_at: nowIso })
        .eq('id', item.id)
        .eq('status', 'queued');

      if (lockResult.error) {
        results.push({ id: item.id, sent: false, error: lockResult.error.message });
        continue;
      }

      try {
        const enabled = await isAutotexterEnabled(item.account_id);
        if (!enabled) {
          const runAfter = new Date(Date.now() + 10 * 60 * 1000).toISOString();
          await supabaseAdmin
            .from('send_queue')
            .update({ status: 'queued', run_after: runAfter, updated_at: new Date().toISOString() })
            .eq('id', item.id);
          results.push({ id: item.id, sent: false, skipped: 'autotexter_disabled' });
          continue;
        }

        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('id, phone, intro_sent_at')
          .eq('id', item.lead_id)
          .eq('account_id', item.account_id)
          .maybeSingle();

        const leadRow = lead as LeadRow | null;
        if (!leadRow?.phone) {
          throw new Error('missing_phone');
        }

        const body = item.body.length > 320 ? `${item.body.slice(0, 317).trimEnd()}…` : item.body;
        const smsResult = await sendSms({ to: leadRow.phone, body });
        const status = String(smsResult?.status || 'queued').toLowerCase();
        const providerStatus = (status === 'sending' || status === 'sent') ? 'sent' : 'queued';
        const sid = smsResult?.sid || null;
        const sentAtIso = new Date().toISOString();

        await supabaseAdmin.from('send_queue').update({
          status: 'sent',
          updated_at: sentAtIso,
          error: null,
        }).eq('id', item.id);

        await supabaseAdmin.from('messages_out').insert({
          account_id: item.account_id,
          lead_id: item.lead_id,
          body,
          provider: 'twilio',
          provider_status: providerStatus,
          status: providerStatus,
          sent_by: 'ai',
          intent: 'initial_outreach',
          gate_log: { category: 'initial_outreach', source: 'send_queue', queue_id: item.id },
          created_at: sentAtIso,
          sid,
        }).catch((err) => {
          console.error('[queue-worker] messages_out insert failed', err);
        });

        const leadUpdate: Record<string, any> = {
          last_sent_at: sentAtIso,
          last_message_sid: sid,
          delivery_status: providerStatus,
          status: 'sent',
        };
        if (!leadRow.intro_sent_at) {
          leadUpdate.intro_sent_at = sentAtIso;
        }

        await supabaseAdmin
          .from('leads')
          .update(leadUpdate)
          .eq('id', item.lead_id)
          .eq('account_id', item.account_id);

        results.push({ id: item.id, sent: true, sid });
      } catch (err: any) {
        const attempt = (item.attempt || 0) + 1;
        const maxAttempts = item.max_attempts || 5;
        const tooManyAttempts = attempt >= maxAttempts;
        const nextRun =
          tooManyAttempts ? null : new Date(Date.now() + backoffDelaySeconds(attempt) * 1000).toISOString();

        await supabaseAdmin
          .from('send_queue')
          .update({
            status: tooManyAttempts ? 'dead_letter' : 'queued',
            error: err?.message || 'send_error',
            attempt,
            run_after: nextRun || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        results.push({ id: item.id, sent: false, error: err?.message || 'send_error' });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}
