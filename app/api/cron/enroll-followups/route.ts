import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

/**
 * Cron job: Enroll leads with "died" conversations into follow-up sequences
 * 
 * Runs periodically (e.g., hourly) to detect leads who haven't replied in X hours
 * and automatically enroll them in a gentle re-engagement cadence.
 * 
 * Called by Vercel Cron or manual trigger with CRON_SECRET or ADMIN_API_KEY auth.
 */

function isAuthorized(req: Request): boolean {
  const cronSecret = (process.env.CRON_SECRET || '').trim();
  const adminKey = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  
  const authHeader = (req.headers.get('authorization') || '').trim();
  const cronHeader = (req.headers.get('x-cron-secret') || '').trim();
  const adminHeader = (req.headers.get('x-admin-token') || '').trim();
  
  // Check CRON_SECRET
  if (cronSecret && (authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret)) {
    return true;
  }
  
  // Check ADMIN_API_KEY
  if (adminKey && adminHeader === adminKey) {
    return true;
  }
  
  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    console.warn('[enroll-followups] Unauthorized request');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  let enrolled = 0;
  let skipped = 0;
  const errors: any[] = [];

  try {
    // Fetch all active accounts
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from('accounts')
      .select('id')
      .eq('outbound_paused', false);

    if (accountsError) {
      console.error('[enroll-followups] Failed to fetch accounts:', accountsError);
      return NextResponse.json({ error: 'db_error', detail: accountsError.message }, { status: 500 });
    }

    if (!accounts || accounts.length === 0) {
      console.log('[enroll-followups] No active accounts found');
      return NextResponse.json({ ok: true, enrolled: 0, skipped: 0, accounts: 0 });
    }

    console.log(`[enroll-followups] Processing ${accounts.length} active accounts`);

    for (const account of accounts) {
      const accountId = account.id;

      try {
        // Get account follow-up settings (or use defaults)
        const { data: settings } = await supabaseAdmin
          .from('account_followup_settings')
          .select('conversation_died_hours, max_followups, cadence_hours, preferred_send_times')
          .eq('account_id', accountId)
          .maybeSingle();

        const conversationDiedHours = settings?.conversation_died_hours || 48;
        const maxFollowups = settings?.max_followups || 42;
        const cadenceHours = settings?.cadence_hours || [12,24,36,48,60,72,84,96,108,120,132,144,156,168,180,192,204,216,228,240,252,264,276,288,300,312,324,336,348,360,372,384,396,408,420,432,444,456,468,480,492,504];
        const preferredSendTimes = settings?.preferred_send_times || [{"hour": 10, "minute": 30}, {"hour": 15, "minute": 30}];

        // Find leads with died conversations
        const { data: leadsNeedingFollowup, error: leadsError } = await supabaseAdmin
          .rpc('leads_with_died_conversations', {
            p_account_id: accountId,
            p_conversation_died_hours: conversationDiedHours
          });

        if (leadsError) {
          console.error(`[enroll-followups] Failed to find leads for account ${accountId}:`, leadsError);
          errors.push({ accountId, error: leadsError.message });
          continue;
        }

        if (!leadsNeedingFollowup || leadsNeedingFollowup.length === 0) {
          skipped++;
          continue;
        }

        console.log(`[enroll-followups] Found ${leadsNeedingFollowup.length} leads needing follow-up for account ${accountId}`);

        // Enroll each lead into follow-up sequence
        for (const lead of leadsNeedingFollowup) {
          const leadId = lead.lead_id;

          // Calculate first follow-up time based on preferred send times
          const nextAttemptTime = calculateNextSendTime(cadenceHours[0], preferredSendTimes);

          const { error: enrollError } = await supabaseAdmin
            .from('ai_followup_cursor')
            .insert({
              lead_id: leadId,
              account_id: accountId,
              status: 'active',
              attempt: 0,
              max_attempts: maxFollowups,
              cadence: cadenceHours,
              next_at: nextAttemptTime,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();

          if (enrollError) {
            // Likely already enrolled or duplicate key - skip
            console.warn(`[enroll-followups] Could not enroll lead ${leadId}:`, enrollError.message);
            continue;
          }

          enrolled++;
          console.log(`[enroll-followups] Enrolled lead ${leadId}, next attempt at ${nextAttemptTime}`);
        }
      } catch (accountError: any) {
        console.error(`[enroll-followups] Error processing account ${accountId}:`, accountError);
        errors.push({ accountId, error: accountError.message || String(accountError) });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[enroll-followups] Completed in ${duration}ms: enrolled=${enrolled}, skipped=${skipped}, errors=${errors.length}`);

    return NextResponse.json({
      ok: true,
      enrolled,
      skipped,
      accounts_processed: accounts.length,
      errors: errors.length > 0 ? errors : undefined,
      duration_ms: duration
    });
  } catch (error: any) {
    console.error('[enroll-followups] Fatal error:', error);
    return NextResponse.json({ error: 'server_error', detail: error.message || String(error) }, { status: 500 });
  }
}

/**
 * Calculate next send time based on cadence hours and preferred send windows
 * Uses intelligent scheduling to hit statistically best times (10:30am or 3:30pm local)
 */
function calculateNextSendTime(
  hoursFromNow: number, 
  preferredTimes: Array<{hour: number, minute: number}>
): string {
  const now = new Date();
  const targetDate = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
  
  // Determine which preferred time slot to use based on cadence
  // Alternate between morning (10:30am) and afternoon (3:30pm) sends
  const currentHour = now.getHours();
  
  // If it's before 10:30am, schedule for 10:30am today/target day
  // If it's after 10:30am but before 3:30pm, schedule for 3:30pm today/target day
  // If it's after 3:30pm, schedule for 10:30am next day
  
  let preferredTime;
  if (hoursFromNow <= 12) {
    // First follow-up of the day - use morning slot
    preferredTime = preferredTimes[0] || {hour: 10, minute: 30};
  } else {
    // Second follow-up of the day - use afternoon slot
    preferredTime = preferredTimes[1] || {hour: 15, minute: 30};
  }
  
  // Set to preferred time (assumes UTC-5 EST for now)
  // TODO: Use per-lead timezone from leads table or account settings
  const localHour = preferredTime.hour;
  const utcHour = (localHour + 5) % 24; // Convert EST to UTC
  
  targetDate.setHours(utcHour, preferredTime.minute, 0, 0);
  
  // If the calculated time is in the past, add 24 hours
  if (targetDate.getTime() < Date.now()) {
    targetDate.setTime(targetDate.getTime() + 24 * 60 * 60 * 1000);
  }
  
  return targetDate.toISOString();
}

