#!/usr/bin/env node

/**
 * Send initial outreach messages to test leads
 * Paul Anderson: +12062959002
 * Scott McCarthy: +14152655001
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const BASE_URL = process.env.PUBLIC_BASE_URL || 'https://outboundrevive-z73k.vercel.app';
const ADMIN_TOKEN = process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN;
const ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validation
if (!ADMIN_TOKEN) {
  console.error('❌ Error: ADMIN_API_KEY or ADMIN_TOKEN not found in .env');
  process.exit(1);
}

if (!ACCOUNT_ID) {
  console.error('❌ Error: DEFAULT_ACCOUNT_ID not found in .env');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Supabase credentials not found in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MESSAGE = "Hey—it's Charlie from OutboundRevive. Quick check-in: would you like pricing, a 2-min overview, or a quick call link?";

const testLeads = [
  { name: 'Paul Anderson', phone: '+12062959002' },
  { name: 'Scott McCarthy', phone: '+14152655001' },
];

async function ensureLeadExists(name, phone) {
  console.log(`📋 Checking for lead: ${name} (${phone})...`);
  
  // Check if lead exists
  const { data: existing } = await supabase
    .from('leads')
    .select('id, name, phone')
    .eq('account_id', ACCOUNT_ID)
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    console.log(`  ✅ Lead exists with ID: ${existing.id}`);
    return existing.id;
  }

  // Create new lead
  console.log(`  🆕 Creating new lead...`);
  const { data: newLead, error } = await supabase
    .from('leads')
    .insert({
      account_id: ACCOUNT_ID,
      name,
      phone,
      status: 'pending',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error(`  ❌ Error creating lead:`, error);
    return null;
  }

  console.log(`  ✅ Created lead with ID: ${newLead.id}`);
  return newLead.id;
}

async function sendMessage(leadId, name) {
  console.log(`\n💬 Sending message to ${name}...`);
  console.log(`   Message: "${MESSAGE}"`);
  
  const response = await fetch(`${BASE_URL}/api/sms/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': ADMIN_TOKEN,
    },
    body: JSON.stringify({
      account_id: ACCOUNT_ID,
      leadIds: [leadId],
      message: MESSAGE,
      gate_context: 'initial_outreach',
      sentBy: 'operator',
    }),
  });

  const result = await response.json();
  
  if (response.ok) {
    console.log(`   ✅ Message sent successfully!`);
    if (result.results && result.results[0]) {
      const r = result.results[0];
      if (r.sid) {
        console.log(`   📱 Twilio SID: ${r.sid}`);
      } else if (r.error) {
        console.log(`   ⚠️  Warning: ${r.error}`);
      }
    }
  } else {
    console.log(`   ❌ Failed to send:`, result);
  }
  
  return result;
}

async function main() {
  console.log('🚀 Starting test message send...\n');
  
  // Ensure leads exist and get their IDs
  const leadIds = [];
  for (const lead of testLeads) {
    const leadId = await ensureLeadExists(lead.name, lead.phone);
    if (leadId) {
      leadIds.push({ id: leadId, name: lead.name });
    }
  }

  console.log(`\n📊 Found/created ${leadIds.length} leads\n`);
  
  // Send messages to each lead
  for (const { id, name } of leadIds) {
    await sendMessage(id, name);
    // Wait 2 seconds between sends
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n✅ All messages sent!');
  console.log('📱 They should receive the texts shortly.');
  console.log('💬 When they reply, your AI bot will automatically respond!');
  console.log('\n👀 Monitor responses in your dashboard: https://outboundrevive-z73k.vercel.app/dashboard');
}

main().catch(console.error);

