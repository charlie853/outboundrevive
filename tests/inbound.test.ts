/**
 * Tests for inbound SMS handling (who is this, scheduling, pricing, STOP/PAUSE)
 * 
 * Run with: npx jest tests/inbound.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getSupabaseAdmin, createTestLead, cleanupTestLead, simulateTwilioWebhook, parseTwiML, extractBookingLink, getBaseUrl, TEST_ACCOUNT_ID, isServerAvailable } from './helpers/test-utils';

const BASE_URL = getBaseUrl();
let supabase: ReturnType<typeof getSupabaseAdmin>;
let serverAvailable = false;

describe('Inbound SMS Handling', () => {
  let testLeadId: string;
  let testPhone: string;

  beforeAll(async () => {
    serverAvailable = await isServerAvailable(BASE_URL);
    if (!serverAvailable) {
      console.warn(`⚠️  Server not available at ${BASE_URL}. Skipping integration tests. Start server with 'npm run dev' or set BASE_URL.`);
      return;
    }
    
    supabase = getSupabaseAdmin();
    // Create a test lead
    testPhone = '+14155551234';
    const lead = await createTestLead(supabase, TEST_ACCOUNT_ID, testPhone, 'Test User');
    testLeadId = lead.id;
  });

  afterAll(async () => {
    if (testLeadId && serverAvailable) {
      await cleanupTestLead(supabase, testLeadId);
    }
  });

  describe('Who is this?', () => {
    it('should respond with LLM-generated natural reply, not canned text', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }
      const { status, text } = await simulateTwilioWebhook(
        BASE_URL,
        testPhone,
        '+14155556789',
        'who is this'
      );

      expect(status).toBe(200);
      const parsed = parseTwiML(text);
      expect(parsed.message).toBeDefined();
      expect(parsed.message?.length).toBeGreaterThan(0);
      
      // Should NOT be the exact canned string
      const canned = 'Charlie from OutboundRevive.';
      expect(parsed.message).not.toBe(canned);
      
      // Should mention Charlie or OutboundRevive but in a natural way
      const msgLower = parsed.message?.toLowerCase() || '';
      expect(msgLower.includes('charlie') || msgLower.includes('outboundrevive')).toBe(true);
      
      // Should be context-aware (mentions brand/service)
      expect(parsed.message?.length).toBeLessThanOrEqual(320);
    });
  });

  describe('Scheduling Intent', () => {
    it('should include booking link when asked to schedule', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }
      const { status, text } = await simulateTwilioWebhook(
        BASE_URL,
        testPhone,
        '+14155556789',
        'can we book a zoom tomorrow?'
      );

      expect(status).toBe(200);
      const parsed = parseTwiML(text);
      expect(parsed.message).toBeDefined();
      
      const link = extractBookingLink(parsed.message || '');
      expect(link).toBeTruthy();
      
      // Link should be at the end
      const msg = parsed.message || '';
      const linkIndex = msg.indexOf(link || '');
      expect(linkIndex).toBeGreaterThan(0);
      expect(linkIndex).toBeGreaterThanOrEqual(msg.length - (link?.length || 0) - 10); // Within last 10 chars
      
      // Should be human blurb before link
      expect(msg.length).toBeLessThanOrEqual(320);
      expect(msg.length).toBeGreaterThan(link?.length || 0);
    });
  });

  describe('Pricing Questions', () => {
    it('should use tenant pricing and be <320 chars', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }
      const { status, text } = await simulateTwilioWebhook(
        BASE_URL,
        testPhone,
        '+14155556789',
        'pricing tiers?'
      );

      expect(status).toBe(200);
      const parsed = parseTwiML(text);
      expect(parsed.message).toBeDefined();
      
      const msg = parsed.message || '';
      expect(msg.length).toBeLessThanOrEqual(320);
      
      // Should mention pricing (likely contains $)
      expect(msg.includes('$') || msg.toLowerCase().includes('price') || msg.toLowerCase().includes('cost')).toBe(true);
    });
  });

  describe('STOP/PAUSE/HELP/START', () => {
    it('should handle STOP and mark lead as opted_out', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }
      const { status, text } = await simulateTwilioWebhook(
        BASE_URL,
        testPhone,
        '+14155556789',
        'STOP'
      );

      expect(status).toBe(200);
      const parsed = parseTwiML(text);
      expect(parsed.message?.toLowerCase()).toContain('paused');
      
      // Verify lead is opted out
      const { data: lead } = await supabase
        .from('leads')
        .select('opted_out')
        .eq('id', testLeadId)
        .single();
      
      expect(lead?.opted_out).toBe(true);
    });

    it('should handle PAUSE', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }
      // First, opt back in
      await supabase.from('leads').update({ opted_out: false }).eq('id', testLeadId);
      
      const { status, text } = await simulateTwilioWebhook(
        BASE_URL,
        testPhone,
        '+14155556789',
        'PAUSE'
      );

      expect(status).toBe(200);
      const parsed = parseTwiML(text);
      expect(parsed.message?.toLowerCase()).toContain('paused');
    });

    it('should handle HELP', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }
      const { status, text } = await simulateTwilioWebhook(
        BASE_URL,
        testPhone,
        '+14155556789',
        'HELP'
      );

      expect(status).toBe(200);
      const parsed = parseTwiML(text);
      expect(parsed.message?.toLowerCase()).toContain('help');
      expect(parsed.message?.toLowerCase()).toContain('pause');
    });

    it('should handle START and re-enable messages', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }
      // First opt out
      await supabase.from('leads').update({ opted_out: true }).eq('id', testLeadId);
      
      const { status, text } = await simulateTwilioWebhook(
        BASE_URL,
        testPhone,
        '+14155556789',
        'START'
      );

      expect(status).toBe(200);
      
      // Verify lead is opted back in
      const { data: lead } = await supabase
        .from('leads')
        .select('opted_out')
        .eq('id', testLeadId)
        .single();
      
      expect(lead?.opted_out).toBe(false);
    });
  });

  describe('TwiML Format', () => {
    it('should return valid TwiML with post-processed message', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }
      const { status, text, headers } = await simulateTwilioWebhook(
        BASE_URL,
        testPhone,
        '+14155556789',
        'test message'
      );

      expect(status).toBe(200);
      expect(headers.get('content-type')).toContain('text/xml');
      expect(text).toContain('<?xml');
      expect(text).toContain('<Response>');
      
      const parsed = parseTwiML(text);
      expect(parsed.message).toBeDefined();
      expect(parsed.message?.length).toBeLessThanOrEqual(320);
    });
  });
});

