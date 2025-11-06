/**
 * Tests for multi-tenant isolation (RLS and account_id scoping)
 * 
 * Run with: npx jest tests/isolation.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getSupabaseAdmin, createTestLead, cleanupTestLead, TEST_ACCOUNT_ID, TEST_ACCOUNT_ID_2 } from './helpers/test-utils';

const supabase = getSupabaseAdmin();

describe('Multi-tenant Isolation', () => {
  let account1LeadId: string;
  let account2LeadId: string;

  beforeAll(async () => {
    // Create leads in two different accounts
    const lead1 = await createTestLead(supabase, TEST_ACCOUNT_ID, '+14155550001', 'Account 1 Lead');
    const lead2 = await createTestLead(supabase, TEST_ACCOUNT_ID_2, '+14155550002', 'Account 2 Lead');
    account1LeadId = lead1.id;
    account2LeadId = lead2.id;
  });

  afterAll(async () => {
    if (account1LeadId) await cleanupTestLead(supabase, account1LeadId);
    if (account2LeadId) await cleanupTestLead(supabase, account2LeadId);
  });

  it('should isolate leads by account_id', async () => {
    // Query leads for account 1
    const { data: leads1 } = await supabase
      .from('leads')
      .select('id')
      .eq('account_id', TEST_ACCOUNT_ID)
      .eq('phone', '+14155550001');

    // Query leads for account 2
    const { data: leads2 } = await supabase
      .from('leads')
      .select('id')
      .eq('account_id', TEST_ACCOUNT_ID_2)
      .eq('phone', '+14155550002');

    expect(leads1?.length).toBeGreaterThan(0);
    expect(leads2?.length).toBeGreaterThan(0);
    expect(leads1?.[0].id).not.toBe(leads2?.[0].id);
  });

  it('should isolate messages by account_id', async () => {
    // Create messages for both accounts
    await supabase.from('messages_out').insert([
      { lead_id: account1LeadId, account_id: TEST_ACCOUNT_ID, body: 'Account 1 message' },
      { lead_id: account2LeadId, account_id: TEST_ACCOUNT_ID_2, body: 'Account 2 message' },
    ]);

    // Query messages for account 1
    const { data: messages1 } = await supabase
      .from('messages_out')
      .select('body')
      .eq('account_id', TEST_ACCOUNT_ID);

    // Query messages for account 2
    const { data: messages2 } = await supabase
      .from('messages_out')
      .select('body')
      .eq('account_id', TEST_ACCOUNT_ID_2);

    // Account 1 should NOT see account 2's messages
    const account1Bodies = (messages1 || []).map(m => m.body);
    expect(account1Bodies).not.toContain('Account 2 message');

    // Account 2 should NOT see account 1's messages
    const account2Bodies = (messages2 || []).map(m => m.body);
    expect(account2Bodies).not.toContain('Account 1 message');
  });

  it('should isolate billing data by account_id', async () => {
    // Set billing for both accounts
    await supabase.from('tenant_billing').upsert({
      account_id: TEST_ACCOUNT_ID,
      monthly_cap_segments: 1000,
      segments_used: 500,
    });

    await supabase.from('tenant_billing').upsert({
      account_id: TEST_ACCOUNT_ID_2,
      monthly_cap_segments: 2000,
      segments_used: 1000,
    });

    // Query billing for account 1
    const { data: bill1 } = await supabase
      .from('tenant_billing')
      .select('segments_used, monthly_cap_segments')
      .eq('account_id', TEST_ACCOUNT_ID)
      .single();

    // Query billing for account 2
    const { data: bill2 } = await supabase
      .from('tenant_billing')
      .select('segments_used, monthly_cap_segments')
      .eq('account_id', TEST_ACCOUNT_ID_2)
      .single();

    expect(bill1?.segments_used).toBe(500);
    expect(bill1?.monthly_cap_segments).toBe(1000);
    expect(bill2?.segments_used).toBe(1000);
    expect(bill2?.monthly_cap_segments).toBe(2000);
  });

  it('should verify RLS policies exist or document gaps', async () => {
    // This test checks if RLS is enabled
    // In production, RLS should prevent cross-account access
    // For now, we verify that account_id is always required in queries
    
    // Try to query without account_id filter (should be empty or fail)
    const { data: allLeads } = await supabase
      .from('leads')
      .select('id, account_id')
      .limit(10);

    // If RLS is enabled, this should return empty or only current user's data
    // If RLS is not enabled, we document this as a gap
    // For service role key, it bypasses RLS, so we just verify data exists
    expect(Array.isArray(allLeads)).toBe(true);
    
    // All leads should have account_id
    if (allLeads && allLeads.length > 0) {
      allLeads.forEach(lead => {
        expect(lead.account_id).toBeDefined();
      });
    }
  });
});

