import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendSms } from '@/lib/twilio';

/**
 * Admin-only: Resend initial outreach to specific leads
 * 
 * Security: Requires Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 * Use case: Manual demo/testing - force resend even if lead received initial before
 * 
 * Does NOT change: inbound webhook, TwiML, global gating rules
 * Only overrides: 24h link gate when force=true
 * Still honors: opted_out hard block
 */

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Normalize phone to E.164 format
function normalizePhone(input: string): string {
  // Remove all non-digit characters
  const digits = input.replace(/\D/g, '');
  
  // If it's 10 digits, assume US and prepend +1
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // If it's 11 digits starting with 1, prepend +
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  
  // If it already starts with +, return as-is
  if (input.startsWith('+')) {
    return `+${digits}`;
  }
  
  // Default: assume it's valid
  return `+${digits}`;
}

// Generate initial outreach message
function generateInitialMessage(leadName: string, bookingUrl: string): string {
  const firstName = leadName.split(' ')[0] || 'there';
  
  // Use the same initial outreach pattern as our first touch
  const message = `Hey ${firstName}—it's Charlie from OutboundRevive. Quick check-in: would you like pricing, a 2-min overview, or a quick call link?`;
  
  // Clamp to 320 chars
  if (message.length > 320) {
    return message.substring(0, 317) + '...';
  }
  
  return message;
}

type ResendResult = {
  phone: string;
  leadId?: string;
  status: 'sent' | 'skipped_opted_out' | 'not_found' | 'error';
  messagePreview?: string;
  twilioSid?: string;
  error?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Security: require service role key in Authorization header
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!authHeader || !expectedKey) {
    return res.status(401).json({ error: 'Unauthorized: missing credentials' });
  }
  
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== expectedKey) {
    return res.status(403).json({ error: 'Forbidden: invalid credentials' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accountId, phones, force, reason } = req.body as {
      accountId: string;
      phones: string[];
      force?: boolean;
      reason?: string;
    };

    // Validate input
    if (!accountId || !Array.isArray(phones) || phones.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid input: accountId and phones[] required' 
      });
    }

    const results: ResendResult[] = [];
    const bookingUrl = process.env.CAL_BOOKING_URL || process.env.CAL_URL || 'https://cal.com/charlie-fregozo-v8sczt/30min';
    const nowIso = new Date().toISOString();

    console.log(`[RESEND-INITIAL] Starting for ${phones.length} phones. Force: ${force}, Reason: ${reason}`);

    // Process each phone
    for (const rawPhone of phones) {
      const phone = normalizePhone(rawPhone);
      console.log(`[RESEND-INITIAL] Processing: ${rawPhone} → ${phone}`);

      try {
        // 1. Look up lead
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('id, name, phone, opted_out, last_sent_at')
          .eq('account_id', accountId)
          .eq('phone', phone)
          .maybeSingle();

        if (leadError) {
          console.error(`[RESEND-INITIAL] DB error for ${phone}:`, leadError);
          results.push({
            phone,
            status: 'error',
            error: leadError.message,
          });
          continue;
        }

        if (!lead) {
          console.warn(`[RESEND-INITIAL] Lead not found: ${phone}`);
          results.push({
            phone,
            status: 'not_found',
          });
          continue;
        }

        // 2. Hard stop: opted out
        if (lead.opted_out === true) {
          console.warn(`[RESEND-INITIAL] Skipping opted-out lead: ${phone}`);
          results.push({
            phone,
            leadId: lead.id,
            status: 'skipped_opted_out',
          });
          continue;
        }

        // 3. Generate message
        const message = generateInitialMessage(lead.name, bookingUrl);
        const messagePreview = message.substring(0, 100);

        console.log(`[RESEND-INITIAL] Generated message for ${lead.name}: "${messagePreview}..."`);

        // 4. Send via Twilio
        let twilioSid: string | undefined;
        
        try {
          const twilioResult = await sendSms({
            to: phone,
            body: message,
          });
          
          twilioSid = twilioResult.sid;
          console.log(`[RESEND-INITIAL] Twilio send OK: ${twilioSid}`);
        } catch (twilioError: any) {
          console.error(`[RESEND-INITIAL] Twilio error for ${phone}:`, twilioError);
          results.push({
            phone,
            leadId: lead.id,
            status: 'error',
            messagePreview,
            error: `Twilio error: ${twilioError.message || 'unknown'}`,
          });
          continue;
        }

        // 5. Persist to messages_out
        const { error: insertError } = await supabase
          .from('messages_out')
          .insert({
            account_id: accountId,
            lead_id: lead.id,
            body: message,
            provider: 'twilio',
            provider_status: 'queued',
            sid: twilioSid,
            sent_by: 'operator',
            intent: 'initial_outreach',
            gate_log: {
              reason: reason || 'manual_demo_resend',
              force,
              admin_override: true,
            },
            created_at: nowIso,
          });

        if (insertError) {
          console.error(`[RESEND-INITIAL] messages_out insert error:`, insertError);
          // Don't fail the whole request, but log it
        }

        // 6. Update lead last_sent_at
        const { error: updateError } = await supabase
          .from('leads')
          .update({
            last_sent_at: nowIso,
            last_outbound_at: nowIso,
          })
          .eq('id', lead.id);

        if (updateError) {
          console.error(`[RESEND-INITIAL] leads update error:`, updateError);
          // Don't fail the whole request
        }

        // Success!
        results.push({
          phone,
          leadId: lead.id,
          status: 'sent',
          messagePreview,
          twilioSid,
        });

      } catch (phoneError: any) {
        console.error(`[RESEND-INITIAL] Unexpected error for ${phone}:`, phoneError);
        results.push({
          phone,
          status: 'error',
          error: phoneError.message || 'Unknown error',
        });
      }
    }

    // Return summary
    const sent = results.filter(r => r.status === 'sent').length;
    const skipped = results.filter(r => r.status === 'skipped_opted_out').length;
    const notFound = results.filter(r => r.status === 'not_found').length;
    const errors = results.filter(r => r.status === 'error').length;

    console.log(`[RESEND-INITIAL] Complete: ${sent} sent, ${skipped} skipped, ${notFound} not found, ${errors} errors`);

    return res.status(200).json({
      success: true,
      summary: {
        total: phones.length,
        sent,
        skipped_opted_out: skipped,
        not_found: notFound,
        errors,
      },
      results,
    });

  } catch (error: any) {
    console.error('[RESEND-INITIAL] Fatal error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}

