#!/usr/bin/env node
/**
 * Check the status of messages in the database
 * Usage: node scripts/check-messages-status.mjs
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const accountId = '11111111-1111-1111-1111-111111111111'; // Your account ID

console.log('📊 Checking message statuses...\n');

// Check recent messages_out
const { data: messages, error: msgError } = await supabase
  .from('messages_out')
  .select('id, lead_id, body, status, provider_status, provider_sid, sent_by, intent, created_at')
  .eq('account_id', accountId)
  .order('created_at', { ascending: false })
  .limit(10);

if (msgError) {
  console.error('❌ Error fetching messages:', msgError);
  process.exit(1);
}

console.log(`Found ${messages?.length || 0} recent messages:\n`);

for (const msg of messages || []) {
  const age = Math.round((Date.now() - new Date(msg.created_at).getTime()) / 1000 / 60);
  console.log(`📧 Message ${msg.id.slice(0, 8)}...`);
  console.log(`   Created: ${age} min ago`);
  console.log(`   Status: ${msg.status} / Provider: ${msg.provider_status}`);
  console.log(`   SID: ${msg.provider_sid || 'none'}`);
  console.log(`   Intent: ${msg.intent || 'none'}`);
  console.log(`   Body: ${(msg.body || '').substring(0, 50)}...`);
  console.log('');
}

// Check leads with intro_sent_at
const { data: leads, error: leadError } = await supabase
  .from('leads')
  .select('id, name, phone, intro_sent_at, last_sent_at, delivery_status, last_message_sid')
  .eq('account_id', accountId)
  .not('intro_sent_at', 'is', null)
  .order('intro_sent_at', { ascending: false })
  .limit(5);

if (leadError) {
  console.error('❌ Error fetching leads:', leadError);
} else {
  console.log(`\n👤 Leads with intros sent (${leads?.length || 0}):\n`);
  
  for (const lead of leads || []) {
    const age = Math.round((Date.now() - new Date(lead.intro_sent_at).getTime()) / 1000 / 60);
    console.log(`${lead.name} (${lead.phone})`);
    console.log(`   Intro sent: ${age} min ago`);
    console.log(`   Delivery status: ${lead.delivery_status || 'none'}`);
    console.log(`   Message SID: ${lead.last_message_sid || 'none'}`);
    console.log('');
  }
}

// Check leads without intro_sent_at
const { data: pendingLeads, error: pendingError } = await supabase
  .from('leads')
  .select('id, name, phone, crm_source, created_at')
  .eq('account_id', accountId)
  .is('intro_sent_at', null)
  .not('phone', 'is', null)
  .order('created_at', { ascending: false })
  .limit(10);

if (!pendingError && pendingLeads && pendingLeads.length > 0) {
  console.log(`\n⏳ Leads pending intro (${pendingLeads.length}):\n`);
  
  for (const lead of pendingLeads) {
    const age = Math.round((Date.now() - new Date(lead.created_at).getTime()) / 1000 / 60);
    console.log(`${lead.name} (${lead.phone})`);
    console.log(`   Created: ${age} min ago`);
    console.log(`   CRM Source: ${lead.crm_source || 'manual'}`);
    console.log('');
  }
}

// Check autotexter status
const { data: settings } = await supabase
  .from('account_settings')
  .select('autotexter_enabled')
  .eq('account_id', accountId)
  .maybeSingle();

console.log(`\n⚙️  Autotexter Status: ${settings?.autotexter_enabled ? '✅ ON' : '❌ OFF'}\n`);

