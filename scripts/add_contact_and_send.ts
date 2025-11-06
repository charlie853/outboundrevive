#!/usr/bin/env ts-node
/**
 * Quick script to add a contact and send initial text
 * Usage: npx ts-node scripts/add_contact_and_send.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

// Normalize phone to E.164
function toE164(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
  if (phone.startsWith('+1') && phone.length === 12) return phone;
  return null;
}

async function main() {
  const name = 'Charlie Fregozo';
  const phoneRaw = '8183709444';
  const phone = toE164(phoneRaw);
  
  if (!phone) {
    console.error(`❌ Invalid phone number: ${phoneRaw}`);
    process.exit(1);
  }

  console.log(`📋 Adding contact: ${name} (${phone})...`);

  // Check if lead exists
  const { data: existing } = await supabase
    .from('leads')
    .select('id, name, phone, account_id')
    .eq('account_id', DEFAULT_ACCOUNT_ID)
    .eq('phone', phone)
    .maybeSingle();

  let leadId: string;
  
  if (existing) {
    console.log(`  ✅ Lead already exists with ID: ${existing.id}`);
    leadId = existing.id;
    
    // Update name if different
    if (existing.name !== name) {
      await supabase
        .from('leads')
        .update({ name })
        .eq('id', leadId);
      console.log(`  ✅ Updated name to: ${name}`);
    }
  } else {
    // Create new lead
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        account_id: DEFAULT_ACCOUNT_ID,
        name,
        phone,
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  ❌ Error creating lead:`, error);
      process.exit(1);
    }

    leadId = newLead.id;
    console.log(`  ✅ Created lead with ID: ${leadId}`);
  }

  // Send initial message
  console.log(`\n💬 Sending initial message...`);
  
  const initialMessage = "Hey Charlie—it's Charlie from OutboundRevive. Quick test of our AI SMS. Want a link to pick a time?";
  
  // Insert message_out
  const { data: message, error: msgError } = await supabase
    .from('messages_out')
    .insert({
      lead_id: leadId,
      account_id: DEFAULT_ACCOUNT_ID,
      body: initialMessage,
      provider: 'twilio',
      status: 'queued', // Will be sent by queue worker
    })
    .select('id')
    .single();

  if (msgError) {
    console.error(`  ❌ Error creating message:`, msgError);
    process.exit(1);
  }

  console.log(`  ✅ Created message with ID: ${message.id}`);
  console.log(`  📝 Message: "${initialMessage}"`);
  console.log(`\n✅ Done! Lead ID: ${leadId}, Message ID: ${message.id}`);
  console.log(`\n🔍 Check the threads section - it should appear there!`);
}

main().catch(console.error);

