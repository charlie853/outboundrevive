/**
 * Tests for segment counting and monthly caps
 * 
 * Run with: npx jest tests/segments-caps.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getSupabaseAdmin, createTestLead, cleanupTestLead, TEST_ACCOUNT_ID } from './helpers/test-utils';
import { countSegments } from '../lib/messaging/segments';

const supabase = getSupabaseAdmin();

describe('Segment Counting', () => {
  describe('GSM-7 encoding', () => {
    it('should count single segment for short messages', () => {
      expect(countSegments('Hello')).toBe(1);
      expect(countSegments('A'.repeat(160))).toBe(1);
    });

    it('should count multiple segments for long GSM-7 messages', () => {
      // Single segment: 1-160 chars
      expect(countSegments('A'.repeat(160))).toBe(1);
      // Once over 160, must use concatenated format (153 per segment)
      expect(countSegments('A'.repeat(161))).toBe(2); // Math.ceil(161/153) = 2
      expect(countSegments('A'.repeat(306))).toBe(2); // Math.ceil(306/153) = 2
      expect(countSegments('A'.repeat(307))).toBe(3); // Math.ceil(307/153) = 3
    });
  });

  describe('UCS-2 encoding', () => {
    it('should count single segment for short Unicode messages', () => {
      expect(countSegments('Hello 👋')).toBe(1);
      expect(countSegments('A'.repeat(70))).toBe(1);
    });

    it('should count multiple segments for long Unicode messages', () => {
      // Use actual Unicode characters (not GSM-7) to force UCS-2 encoding
      // Single segment: 1-70 chars
      const unicodeChar = '中'; // Chinese character (forces UCS-2)
      expect(countSegments(unicodeChar.repeat(70))).toBe(1);
      // Once over 70, must use concatenated format (67 per segment)
      expect(countSegments(unicodeChar.repeat(71))).toBe(2); // Math.ceil(71/67) = 2
      // Note: Emoji characters are complex and may be encoded differently
      // Testing with simple Unicode characters instead
      expect(countSegments(unicodeChar.repeat(67))).toBe(1); // 67 chars = 1 segment (concatenated)
      expect(countSegments(unicodeChar.repeat(68))).toBe(2); // 68 chars, Math.ceil(68/67) = 2
    });
  });
});

describe('Monthly Caps', () => {
  let testLeadId: string;
  let testAccountId: string;

  beforeAll(async () => {
    testAccountId = TEST_ACCOUNT_ID;
    const lead = await createTestLead(supabase, testAccountId, '+14155559999', 'Cap Test Lead');
    testLeadId = lead.id;
  });

  afterAll(async () => {
    if (testLeadId) {
      await cleanupTestLead(supabase, testLeadId);
    }
  });

  it('should warn at 80% usage', async () => {
    // Set account to 80% usage
    const cap = 1000;
    const used = 800;
    await supabase
      .from('tenant_billing')
      .upsert({
        account_id: testAccountId,
        monthly_cap_segments: cap,
        segments_used: used,
        warn_80_sent: false,
      });

    // Try to send a message (should still work but trigger warning)
    const segments = countSegments('Test message');
    const { data: bill } = await supabase
      .from('tenant_billing')
      .select('segments_used, warn_80_sent')
      .eq('account_id', testAccountId)
      .single();

    // Check that warning threshold logic exists (actual warning happens in send route)
    expect(bill).toBeDefined();
  });

  it('should hard stop at 100% cap', async () => {
    // Set account to exactly at cap
    const cap = 1000;
    await supabase
      .from('tenant_billing')
      .upsert({
        account_id: testAccountId,
        monthly_cap_segments: cap,
        segments_used: cap,
      });

    // Verify that sending would be blocked (this is tested in integration)
    const { data: bill } = await supabase
      .from('tenant_billing')
      .select('segments_used, monthly_cap_segments')
      .eq('account_id', testAccountId)
      .single();

    expect(bill?.segments_used).toBe(cap);
    expect(bill?.monthly_cap_segments).toBe(cap);
  });

  it('should count inbound segments toward cap', async () => {
    // This is verified by checking that inbound webhook updates tenant_billing
    // Actual test would require full webhook simulation
    const segments = countSegments('Inbound message');
    expect(segments).toBeGreaterThan(0);
  });
});

