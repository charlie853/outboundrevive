#!/usr/bin/env node

/**
 * Diagnostic script to check booking tracking setup
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('🔍 Booking Tracking Diagnostic');
console.log('================================\n');

// Check 1: Appointments table exists and has data
console.log('1️⃣  Checking appointments table...');
const { data: appointments, error: apptsError, count: apptsCount } = await supabase
  .from('appointments')
  .select('*', { count: 'exact', head: false })
  .eq('account_id', DEFAULT_ACCOUNT_ID)
  .order('created_at', { ascending: false })
  .limit(5);

if (apptsError) {
  console.log(`   ❌ Error: ${apptsError.message}`);
  console.log('   💡 Run: sql/2025-11-12_appointments_table.sql in Supabase');
} else {
  console.log(`   ✅ Table exists with ${apptsCount || 0} total appointments`);
  if (appointments && appointments.length > 0) {
    console.log(`   📋 Recent appointments:`);
    appointments.forEach(appt => {
      console.log(`      - ${appt.status} (${appt.provider}) at ${new Date(appt.created_at).toLocaleString()}`);
    });
  } else {
    console.log('   ⚠️  No appointments found');
  }
}

console.log('');

// Check 2: Messages with intent=booked
console.log('2️⃣  Checking messages_out with intent=booked...');
const { data: bookedMessages, error: msgsError, count: msgsCount } = await supabase
  .from('messages_out')
  .select('*', { count: 'exact', head: false })
  .eq('account_id', DEFAULT_ACCOUNT_ID)
  .eq('intent', 'booked')
  .order('created_at', { ascending: false })
  .limit(5);

if (msgsError) {
  console.log(`   ❌ Error: ${msgsError.message}`);
} else {
  console.log(`   ✅ Found ${msgsCount || 0} messages with intent=booked`);
  if (bookedMessages && bookedMessages.length > 0) {
    console.log(`   📋 Recent booked messages:`);
    bookedMessages.forEach(msg => {
      console.log(`      - "${msg.body?.slice(0, 50)}..." at ${new Date(msg.created_at).toLocaleString()}`);
    });
  } else {
    console.log('   ⚠️  No booked messages found');
  }
}

console.log('');

// Check 3: Leads with booking status
console.log('3️⃣  Checking leads with booking status...');
const { data: bookedLeads, error: leadsError } = await supabase
  .from('leads')
  .select('id, name, phone, last_booking_status, appointment_set_at')
  .eq('account_id', DEFAULT_ACCOUNT_ID)
  .not('last_booking_status', 'is', null)
  .order('appointment_set_at', { ascending: false, nullsFirst: false })
  .limit(5);

if (leadsError) {
  console.log(`   ❌ Error: ${leadsError.message}`);
} else if (bookedLeads && bookedLeads.length > 0) {
  console.log(`   ✅ Found ${bookedLeads.length} leads with booking status`);
  bookedLeads.forEach(lead => {
    console.log(`      - ${lead.name || 'Unknown'} (${lead.phone}): ${lead.last_booking_status}`);
  });
} else {
  console.log('   ⚠️  No leads with booking status found');
}

console.log('');

// Check 4: Environment variables
console.log('4️⃣  Checking calendar environment variables...');
const calVars = [
  'BOOKING_URL',
  'CAL_BOOKING_URL',
  'CAL_PUBLIC_URL',
  'CAL_URL',
  'CALENDLY_URL',
];

calVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`   ✅ ${varName}: ${value.slice(0, 50)}...`);
  } else {
    console.log(`   ❌ ${varName}: Not set`);
  }
});

console.log('');

// Summary and recommendations
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 SUMMARY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const hasAppointments = apptsCount && apptsCount > 0;
const hasBookedMessages = msgsCount && msgsCount > 0;
const hasBookedLeads = bookedLeads && bookedLeads.length > 0;

if (hasAppointments) {
  console.log('✅ Calendar webhooks are working - appointments table has data');
} else {
  console.log('❌ No appointments found - calendar webhooks may not be configured\n');
  console.log('   💡 To fix:');
  console.log('   1. Make sure appointments table exists (run sql/2025-11-12_appointments_table.sql)');
  console.log('   2. Configure webhooks in Cal.com or Calendly:');
  console.log('      Cal.com: https://app.cal.com/settings/developer/webhooks');
  console.log('      Webhook URL: https://www.outboundrevive.com/api/webhooks/calendar/calcom');
  console.log('      OR');
  console.log('      Calendly: https://calendly.com/integrations/api_webhooks');
  console.log('      Webhook URL: https://www.outboundrevive.com/api/webhooks/calendar/calendly');
  console.log('   3. Add x-account-id header with your account ID');
}

if (hasBookedMessages) {
  console.log('\n✅ AI is detecting booking intent in messages');
} else {
  console.log('\n⚠️  AI hasn\'t detected any booking intent yet');
  console.log('   This is normal if leads haven\'t expressed booking intent in texts');
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.exit(0);

