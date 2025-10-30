#!/usr/bin/env node

/**
 * Send initial outreach messages to test leads
 * Simple version - no external dependencies
 */

const fs = require('fs');
const path = require('path');

// Read .env files manually (check both .env.local and .env.prod)
const env = {};
const envFiles = ['.env.local', '.env.prod'];

for (const file of envFiles) {
  const envPath = path.join(__dirname, '..', file);
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !env[match[1].trim()]) { // Don't override existing values
        env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  }
}

// Force production URL (don't use localhost)
const BASE_URL = 'https://outboundrevive-z73k.vercel.app';
const ADMIN_TOKEN = env.ADMIN_API_KEY || env.ADMIN_TOKEN;
const ACCOUNT_ID = env.DEFAULT_ACCOUNT_ID;
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// Validation
if (!ADMIN_TOKEN) {
  console.error('❌ Error: ADMIN_API_KEY or ADMIN_TOKEN not found in .env.local');
  process.exit(1);
}

if (!ACCOUNT_ID) {
  console.error('❌ Error: DEFAULT_ACCOUNT_ID not found in .env.local');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: Supabase credentials not found in .env.local');
  process.exit(1);
}

const MESSAGE = "Hey—it's Charlie from OutboundRevive. Quick check-in: would you like pricing, a 2-min overview, or a quick call link?";

const testLeads = [
  { name: 'Paul Anderson', phone: '+12062959002' },
  { name: 'Scott McCarthy', phone: '+14152655001' },
];

async function ensureLeadExists(name, phone) {
  console.log(`📋 Checking for lead: ${name} (${phone})...`);
  
  // Check if lead exists
  const checkUrl = `${SUPABASE_URL}/rest/v1/leads?account_id=eq.${ACCOUNT_ID}&phone=eq.${encodeURIComponent(phone)}&select=id,name,phone`;
  const checkRes = await fetch(checkUrl, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });

  const existing = await checkRes.json();
  
  if (existing && existing.length > 0) {
    console.log(`  ✅ Lead exists with ID: ${existing[0].id}`);
    return existing[0].id;
  }

  // Create new lead
  console.log(`  🆕 Creating new lead...`);
  const createUrl = `${SUPABASE_URL}/rest/v1/leads`;
  const createRes = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      account_id: ACCOUNT_ID,
      name,
      phone,
      status: 'pending',
      created_at: new Date().toISOString(),
    }),
  });

  const newLead = await createRes.json();
  
  if (createRes.ok && newLead && newLead.length > 0) {
    console.log(`  ✅ Created lead with ID: ${newLead[0].id}`);
    return newLead[0].id;
  }

  console.error(`  ❌ Error creating lead:`, newLead);
  return null;
}

async function sendMessage(leadId, name) {
  console.log(`\n💬 Sending message to ${name}...`);
  console.log(`   Message: "${MESSAGE}"`);
  console.log(`   API URL: ${BASE_URL}/api/sms/send`);
  
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
  console.log('🚀 Starting test message send...');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Account ID: ${ACCOUNT_ID}\n`);
  
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

