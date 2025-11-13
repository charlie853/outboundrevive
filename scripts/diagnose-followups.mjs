#!/usr/bin/env node

/**
 * Diagnose Follow-Up System
 * Checks database tables and identifies why follow-ups aren't working
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials');
  console.log('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('\n🔍 Follow-Up System Diagnostics\n');
console.log('━'.repeat(60));

async function main() {
  // 1. Check if tables exist
  console.log('\n1️⃣  Checking Required Tables:');
  
  const tables = ['ai_followup_cursor', 'ai_followup_log', 'account_followup_settings'];
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`   ❌ ${table}: ${error.message}`);
    } else {
      console.log(`   ✅ ${table}: exists`);
    }
  }

  // 2. Check for leads with died conversations
  console.log('\n2️⃣  Checking for Leads with Died Conversations:');
  
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('outbound_paused', false);
  
  if (!accounts || accounts.length === 0) {
    console.log('   ⚠️  No active accounts found');
    return;
  }
  
  console.log(`   Found ${accounts.length} active account(s)`);
  
  for (const account of accounts) {
    const accountId = account.id;
    
    // Check if RPC function exists
    try {
      const { data: leads, error } = await supabase.rpc('leads_with_died_conversations', {
        p_account_id: accountId,
        p_conversation_died_hours: 48
      });
      
      if (error) {
        console.log(`   ❌ Account ${accountId}: RPC function error - ${error.message}`);
        console.log(`      This usually means the SQL migration wasn't run`);
      } else {
        console.log(`   ✅ Account ${accountId}: ${leads?.length || 0} lead(s) need follow-up`);
        
        if (leads && leads.length > 0) {
          console.log(`      Lead IDs: ${leads.slice(0, 3).map(l => l.lead_id).join(', ')}${leads.length > 3 ? '...' : ''}`);
        }
      }
    } catch (err) {
      console.log(`   ❌ Account ${accountId}: ${err.message}`);
    }
  }
  
  // 3. Check existing follow-up cursors
  console.log('\n3️⃣  Checking Existing Follow-Up Cursors:');
  
  const { data: cursors, error: cursorsError } = await supabase
    .from('ai_followup_cursor')
    .select('lead_id, account_id, status, attempt, max_attempts, next_at')
    .order('next_at', { ascending: true })
    .limit(10);
  
  if (cursorsError) {
    console.log(`   ❌ Error: ${cursorsError.message}`);
  } else if (!cursors || cursors.length === 0) {
    console.log('   ⚠️  No follow-up cursors found');
    console.log('      This means leads haven\'t been enrolled yet');
  } else {
    console.log(`   ✅ Found ${cursors.length} follow-up cursor(s):`);
    cursors.forEach((c, i) => {
      const status = c.status;
      const nextAt = new Date(c.next_at);
      const isPast = nextAt < new Date();
      console.log(`      ${i+1}. Lead: ${c.lead_id.substring(0, 8)}... | Status: ${status} | Attempt: ${c.attempt}/${c.max_attempts} | Next: ${nextAt.toISOString()} ${isPast ? '(DUE!)' : ''}`);
    });
  }
  
  // 4. Check follow-up log
  console.log('\n4️⃣  Checking Follow-Up Log (recent sends):');
  
  const { data: logs, error: logsError } = await supabase
    .from('ai_followup_log')
    .select('lead_id, sent_at, success, error_message')
    .order('sent_at', { ascending: false })
    .limit(5);
  
  if (logsError) {
    console.log(`   ❌ Error: ${logsError.message}`);
  } else if (!logs || logs.length === 0) {
    console.log('   ⚠️  No follow-ups have been sent yet');
  } else {
    console.log(`   ✅ Found ${logs.length} recent follow-up(s):`);
    logs.forEach((log, i) => {
      const status = log.success ? '✅' : '❌';
      const error = log.error_message ? ` (${log.error_message})` : '';
      console.log(`      ${i+1}. ${status} Lead: ${log.lead_id.substring(0, 8)}... | Sent: ${log.sent_at}${error}`);
    });
  }
  
  // 5. Summary
  console.log('\n━'.repeat(60));
  console.log('\n📋 DIAGNOSIS:\n');
  
  const { data: diedLeads } = await supabase.rpc('leads_with_died_conversations', {
    p_account_id: accounts[0].id,
    p_conversation_died_hours: 48
  }).catch(() => ({ data: null }));
  
  if (!diedLeads) {
    console.log('❌ PROBLEM: SQL function `leads_with_died_conversations` doesn\'t exist');
    console.log('   FIX: Run the migration: sql/2025-11-10_ai_followup_system.sql');
  } else if (!cursors || cursors.length === 0) {
    if (diedLeads.length === 0) {
      console.log('✅ System is ready, but no leads need follow-up yet');
      console.log('   Leads need 48+ hours of silence to be enrolled');
    } else {
      console.log('⚠️  PROBLEM: Leads need follow-up but haven\'t been enrolled');
      console.log(`   Found ${diedLeads.length} lead(s) that should be enrolled`);
      console.log('   FIX: The hourly cron job should enroll them automatically');
      console.log('   Or manually trigger: POST /api/cron/enroll-followups');
    }
  } else {
    const dueNow = cursors.filter(c => new Date(c.next_at) < new Date());
    if (dueNow.length > 0) {
      console.log(`✅ System working! ${dueNow.length} follow-up(s) are DUE`);
      console.log('   They will be sent by the cron job every 10 minutes');
      console.log('   Or manually trigger: POST /api/internal/followups/tick');
    } else {
      console.log('✅ System working! Follow-ups are scheduled');
      const nextDue = cursors[0];
      console.log(`   Next due: ${new Date(nextDue.next_at).toLocaleString()}`);
    }
  }
  
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});

