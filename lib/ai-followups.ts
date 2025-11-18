import { supabaseAdmin } from '@/lib/supabaseServer';
import { generateSmsReply } from '@/lib/ai';
import { DateTime } from 'luxon';
import { determineLeadBucket } from '@/lib/leads/classify';

/**
 * Fetch recent thread context for a lead (last 10 messages)
 * Returns formatted conversation string for AI context
 */
export async function fetchThreadContext(leadId: string): Promise<{
  threadHistory: string;
  lastInbound: string;
  lastOutbound: string;
}> {
  const limit = 10;
  
  const [inboundRes, outboundRes] = await Promise.all([
    supabaseAdmin
      .from('messages_in')
      .select('body, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from('messages_out')
      .select('body, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const inbound = (inboundRes.data || []).map(m => ({
    dir: 'in' as const,
    body: m.body || '',
    at: m.created_at || '',
  }));
  
  const outbound = (outboundRes.data || []).map(m => ({
    dir: 'out' as const,
    body: m.body || '',
    at: m.created_at || '',
  }));

  // Merge and sort by timestamp (most recent first)
  const allMessages = [...inbound, ...outbound]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);

  // Format as conversation string (oldest to newest for context)
  const formatted = allMessages
    .reverse()
    .map(msg => `${msg.dir === 'in' ? 'Lead' : 'You'}: ${msg.body}`)
    .join('\n');

  const lastInbound = inbound[0]?.body || '';
  const lastOutbound = outbound[0]?.body || '';

  return {
    threadHistory: formatted || 'No previous conversation.',
    lastInbound,
    lastOutbound,
  };
}

/**
 * Generate context-aware follow-up message using AI
 */
export async function generateFollowUpMessage({
  leadId,
  accountId,
  leadName,
  leadPhone,
  attempt,
  threadHistory,
  lastInbound,
  lastOutbound,
  brand = 'OutboundRevive',
  bookingLink,
}: {
  leadId: string;
  accountId: string;
  leadName?: string | null;
  leadPhone: string;
  attempt: number;
  threadHistory: string;
  lastInbound: string;
  lastOutbound: string;
  brand?: string;
  bookingLink?: string | null;
}): Promise<string> {
  // Fetch lead enrichment data for context
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('lead_type, crm_status, crm_stage, crm_description, crm_owner')
    .eq('id', leadId)
    .maybeSingle();

  const leadBucket = determineLeadBucket(lead);
  const firstName = leadName?.split(' ')[0] || null;

  // Build context for AI
  const ctx: Record<string, unknown> = {
    brand,
    booking_link: bookingLink || null,
    lead_phone: leadPhone,
    first_name: firstName,
    inbound_text: lastInbound || 'No recent message.',
    
    // Thread context for AI to avoid repetition
    thread_history: threadHistory,
    last_outbound_message: lastOutbound,
    
    // Lead classification
    lead_bucket: leadBucket,
    crm_status: lead?.crm_status || null,
    crm_stage: lead?.crm_stage || null,
    lead_notes: lead?.crm_description || null,
    
    // Follow-up specific flags
    is_new_thread: false,
    is_follow_up: true,
    follow_up_attempt: attempt,
    last_contact_30d_ago: true,
    last_footer_within_30d: false,
    scheduling_intent: false,
    asked_who_is_this: false,
    quiet_hours_block: false,
    state_cap_block: false,
    opt_out_phrase: null,
    help_requested: false,
  };

  try {
    const result = await generateSmsReply(ctx);
    let message = typeof result?.message === 'string' ? result.message.trim() : '';
    
    // Post-process: strip booking links on first follow-up attempt
    if (attempt === 1 && bookingLink && message) {
      // Remove booking link from first follow-up (wait for interest)
      const cleaned = message.replace(new RegExp(bookingLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
      message = cleaned || message;
    }
    
    // Always return a message (fallback if AI generation fails or returns empty)
    if (!message) {
      console.warn(`[followup-ai] Empty message from AI for lead ${leadId}, attempt ${attempt}, using fallback`);
      if (attempt === 1) {
        return firstName 
          ? `Hi ${firstName}, just checking back—still interested in exploring this?`
          : 'Just checking back—still interested in exploring this?';
      }
      return 'Quick check-in—want to continue the conversation?';
    }
    
    return message;
  } catch (err) {
    console.error(`[followup-ai] generate failed for lead ${leadId}, attempt ${attempt}:`, err);
    // Fallback message
    if (attempt === 1) {
      return firstName 
        ? `Hi ${firstName}, just checking back—still interested in exploring this?`
        : 'Just checking back—still interested in exploring this?';
    }
    return 'Quick check-in—want to continue the conversation?';
  }
}

/**
 * Check if current time is within quiet hours for a phone number
 * Returns true if we CAN send (within quiet hours), false if we should wait
 */
export async function isWithinQuietHours(
  phone: string,
  accountId: string,
  timezone?: string
): Promise<boolean> {
  // Get account timezone if not provided
  let tz = timezone;
  if (!tz) {
    // Try app_settings first
    const { data: appSettings } = await supabaseAdmin
      .from('app_settings')
      .select('timezone')
      .eq('account_id', accountId)
      .maybeSingle();
    
    if (appSettings?.timezone) {
      tz = appSettings.timezone;
    } else {
      // Fallback to account_followup_prefs
      const { data: prefs } = await supabaseAdmin
        .from('account_followup_prefs')
        .select('timezone')
        .eq('account_id', accountId)
        .maybeSingle();
      tz = prefs?.timezone || 'America/New_York';
    }
  }

  // Get account follow-up settings for quiet hours
  const { data: settings } = await supabaseAdmin
    .from('account_followup_settings')
    .select('quiet_hours_start, quiet_hours_end, quiet_hours_start_strict, quiet_hours_end_strict')
    .eq('account_id', accountId)
    .maybeSingle();

  const now = DateTime.now().setZone(tz);
  const currentMinutes = now.hour * 60 + now.minute;

  // Check if phone is in FL/OK (strict hours)
  const digits = phone.replace(/[^\d]/g, '');
  const areaCode = digits.length >= 4 ? digits.slice(1, 4) : '';
  const FL_OK_CODES = ['239', '305', '321', '352', '386', '407', '561', '727', '754', '772', '786', '813', '850', '863', '904', '941', '954', '405', '539', '580', '918'];
  const isFL_OK = FL_OK_CODES.includes(areaCode);

  let startMin: number;
  let endMin: number;
  
  if (isFL_OK && settings) {
    startMin = (settings.quiet_hours_start_strict || 8) * 60;
    endMin = (settings.quiet_hours_end_strict || 20) * 60;
  } else {
    startMin = (settings?.quiet_hours_start || 8) * 60;
    endMin = (settings?.quiet_hours_end || 21) * 60;
  }

  // Return true if within allowed window (8am-9pm or 8am-8pm for FL/OK)
  return currentMinutes >= startMin && currentMinutes <= endMin;
}

/**
 * Calculate next send time with preferred time windows and quiet hours compliance
 */
export async function calculateNextSendTimeWithCompliance(
  hoursFromNow: number,
  accountId: string,
  phone: string,
  preferredTimes: Array<{hour: number, minute: number}> = [{hour: 10, minute: 30}, {hour: 15, minute: 30}]
): Promise<string> {
  // Get account timezone
  let tz = 'America/New_York';
  const { data: appSettings } = await supabaseAdmin
    .from('app_settings')
    .select('timezone')
    .eq('account_id', accountId)
    .maybeSingle();
  
  if (appSettings?.timezone) {
    tz = appSettings.timezone;
  } else {
    // Fallback to account_followup_prefs
    const { data: prefs } = await supabaseAdmin
      .from('account_followup_prefs')
      .select('timezone')
      .eq('account_id', accountId)
      .maybeSingle();
    if (prefs?.timezone) {
      tz = prefs.timezone;
    }
  }
  
  const now = DateTime.now().setZone(tz);
  
  // Target time from now
  const target = now.plus({ hours: hoursFromNow });
  
  // Choose preferred time slot (alternate between morning and afternoon)
  const preferredTime = hoursFromNow <= 48 
    ? preferredTimes[0] || {hour: 10, minute: 30}  // First follow-up: morning
    : preferredTimes[1] || {hour: 15, minute: 30}; // Later follow-ups: afternoon
  
  // Set to preferred time on target day
  let sendTime = target.set({ 
    hour: preferredTime.hour, 
    minute: preferredTime.minute, 
    second: 0, 
    millisecond: 0 
  });
  
  // If calculated time is in the past, move to next day
  if (sendTime <= now) {
    sendTime = sendTime.plus({ days: 1 });
  }
  
  // Check if within quiet hours; if not, shift to next quiet window
  const isWithinQuiet = await isWithinQuietHours(phone, accountId, tz);
  if (!isWithinQuiet) {
    // Shift to next quiet window (tomorrow morning)
    const tomorrow = now.plus({ days: 1 }).set({ 
      hour: preferredTimes[0]?.hour || 10, 
      minute: preferredTimes[0]?.minute || 30,
      second: 0,
      millisecond: 0
    });
    return tomorrow.toUTC().toISO();
  }
  
  return sendTime.toUTC().toISO();
}

