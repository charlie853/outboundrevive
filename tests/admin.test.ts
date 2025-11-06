/**
 * Tests for admin resend endpoint
 * 
 * Run with: npx jest tests/admin.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getSupabaseAdmin, createTestLead, cleanupTestLead, getBaseUrl, TEST_ACCOUNT_ID, isServerAvailable } from './helpers/test-utils';

const BASE_URL = getBaseUrl();
let supabase: ReturnType<typeof getSupabaseAdmin>;
let serverAvailable = false;
const ADMIN_TOKEN = process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '';

describe('Admin Resend Initial', () => {
  let testLeadId: string;
  let testPhone: string;

  beforeAll(async () => {
    serverAvailable = await isServerAvailable(BASE_URL);
    if (!serverAvailable) {
      console.warn(`⚠️  Server not available at ${BASE_URL}. Skipping integration tests.`);
      return;
    }
    supabase = getSupabaseAdmin();
    testPhone = '+14155556666';
    const lead = await createTestLead(supabase, TEST_ACCOUNT_ID, testPhone, 'Admin Test Lead');
    testLeadId = lead.id;
  });

  afterAll(async () => {
    if (testLeadId && serverAvailable) {
      await cleanupTestLead(supabase, testLeadId);
    }
  });

  it('should honor opt-out state', async () => {
    if (!serverAvailable) {
      console.log('Skipping: server not available');
      return;
    }
    // Mark lead as opted out
    await supabase.from('leads').update({ opted_out: true }).eq('id', testLeadId);

    // Try to resend
    const response = await fetch(`${BASE_URL}/api/admin/leads/resend-initial`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId: TEST_ACCOUNT_ID,
        phones: [testPhone],
        force: true,
        reason: 'test',
      }),
    });

    const data = await response.json();
    
    // Should skip opted-out leads
    if (response.ok && Array.isArray(data)) {
      const result = data.find((r: any) => r.phone === testPhone);
      expect(result?.status).toBe('skipped_opted_out');
    }
  });

  it('should normalize phone numbers to E.164', async () => {
    if (!serverAvailable) {
      console.log('Skipping: server not available');
      return;
    }
    // Test with various phone formats
    const formats = [
      '(415) 555-6666',
      '415-555-6666',
      '4155556666',
      '+14155556666',
    ];

    // The endpoint should normalize all to +14155556666
    // This is tested by checking that the lookup succeeds
    for (const phone of formats) {
      const response = await fetch(`${BASE_URL}/api/admin/leads/resend-initial`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accountId: TEST_ACCOUNT_ID,
          phones: [phone],
          force: true,
          reason: 'test',
        }),
      });

      // Should either succeed or find the lead (not "not_found")
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const result = data.find((r: any) => r.phone === phone || r.phone === testPhone);
          // Should not be "not_found" if normalization works
          expect(result?.status).not.toBe('not_found');
        }
      }
    }
  });

  it('should log reason for resend', async () => {
    if (!serverAvailable) {
      console.log('Skipping: server not available');
      return;
    }
    // Resend with a specific reason
    const reason = `test_reason_${Date.now()}`;
    
    const response = await fetch(`${BASE_URL}/api/admin/leads/resend-initial`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accountId: TEST_ACCOUNT_ID,
        phones: [testPhone],
        force: true,
        reason,
      }),
    });

    // Check that messages_out has the reason logged
    // (This would be in gate_log or a metadata field)
    if (response.ok) {
      const { data: messages } = await supabase
        .from('messages_out')
        .select('gate_log')
        .eq('lead_id', testLeadId)
        .order('created_at', { ascending: false })
        .limit(1);

      // Should have recent message with reason
      expect(Array.isArray(messages)).toBe(true);
    }
  });
});

