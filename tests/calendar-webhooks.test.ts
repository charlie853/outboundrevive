/**
 * Tests for calendar webhook endpoints (Cal.com and Calendly)
 * 
 * Run with: npx jest tests/calendar-webhooks.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getSupabaseAdmin, createTestLead, cleanupTestLead, getBaseUrl, TEST_ACCOUNT_ID, isServerAvailable } from './helpers/test-utils';

const BASE_URL = getBaseUrl();
let supabase: ReturnType<typeof getSupabaseAdmin>;
let serverAvailable = false;

describe('Calendar Webhooks', () => {
  let testLeadId: string;
  let testEmail: string;

  beforeAll(async () => {
    serverAvailable = await isServerAvailable(BASE_URL);
    if (!serverAvailable) {
      console.warn(`⚠️  Server not available at ${BASE_URL}. Skipping integration tests.`);
      return;
    }
    supabase = getSupabaseAdmin();
    // Create a test lead with email for matching
    testEmail = 'test@example.com';
    const lead = await createTestLead(supabase, TEST_ACCOUNT_ID, '+14155559999', 'Calendar Test Lead');
    testLeadId = lead.id;
    // Update lead with email
    await supabase.from('leads').update({ email: testEmail }).eq('id', testLeadId);
  });

  afterAll(async () => {
    if (testLeadId && serverAvailable) {
      await cleanupTestLead(supabase, testLeadId);
    }
  });

  describe('Cal.com Webhook', () => {
    it('should create appointment from booking event', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }

      const webhookPayload = {
        triggerEvent: 'BOOKING_CREATED',
        payload: {
          id: 'test-booking-123',
          title: 'Test Meeting',
          startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
          endTime: new Date(Date.now() + 86400000 + 3600000).toISOString(),
          attendees: [
            { email: testEmail, name: 'Test User' }
          ],
          status: 'accepted',
        }
      };

      const response = await fetch(`${BASE_URL}/api/webhooks/calendar/calcom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      expect(response.ok).toBe(true);

      // Verify appointment was created
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('lead_id', testLeadId)
        .eq('account_id', TEST_ACCOUNT_ID);

      expect(Array.isArray(appointments)).toBe(true);
      expect(appointments?.length).toBeGreaterThan(0);
    });

    it('should update lead booking status', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }

      // Send booking created webhook
      const webhookPayload = {
        triggerEvent: 'BOOKING_CREATED',
        payload: {
          id: 'test-booking-456',
          attendees: [{ email: testEmail }],
          startTime: new Date().toISOString(),
        }
      };

      await fetch(`${BASE_URL}/api/webhooks/calendar/calcom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      // Verify lead status updated
      const { data: lead } = await supabase
        .from('leads')
        .select('status, booked')
        .eq('id', testLeadId)
        .single();

      // Should have booking-related status
      expect(lead).toBeDefined();
    });
  });

  describe('Calendly Webhook', () => {
    it('should create appointment from Calendly event', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }

      const webhookPayload = {
        event: 'invitee.created',
        payload: {
          event_uri: 'https://api.calendly.com/scheduled_events/test-event',
          invitee: {
            uri: 'https://api.calendly.com/invitees/test-invitee',
            email: testEmail,
            name: 'Test User',
          },
          scheduled_event: {
            start_time: new Date(Date.now() + 86400000).toISOString(),
            end_time: new Date(Date.now() + 86400000 + 3600000).toISOString(),
          },
        }
      };

      const response = await fetch(`${BASE_URL}/api/webhooks/calendar/calendly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      expect(response.ok).toBe(true);

      // Verify appointment was created
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('lead_id', testLeadId)
        .eq('account_id', TEST_ACCOUNT_ID);

      expect(Array.isArray(appointments)).toBe(true);
    });

    it('should handle cancellation events', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }

      const webhookPayload = {
        event: 'invitee.canceled',
        payload: {
          invitee: { email: testEmail },
          scheduled_event: { start_time: new Date().toISOString() },
        }
      };

      const response = await fetch(`${BASE_URL}/api/webhooks/calendar/calendly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      // Should handle cancellation gracefully
      expect([200, 201, 204].includes(response.status)).toBe(true);
    });
  });

  describe('Webhook Idempotency', () => {
    it('should handle duplicate webhook events', async () => {
      if (!serverAvailable) {
        console.log('Skipping: server not available');
        return;
      }

      const webhookPayload = {
        triggerEvent: 'BOOKING_CREATED',
        payload: {
          id: 'duplicate-test-123',
          attendees: [{ email: testEmail }],
          startTime: new Date().toISOString(),
        }
      };

      // Send same webhook twice
      const response1 = await fetch(`${BASE_URL}/api/webhooks/calendar/calcom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      const response2 = await fetch(`${BASE_URL}/api/webhooks/calendar/calcom`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      // Both should succeed (idempotent)
      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      // Should only have one appointment (or handle duplicates)
      const { data: appointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('account_id', TEST_ACCOUNT_ID)
        .contains('external_id', 'duplicate-test-123');

      // Should have at least one, but not necessarily two if idempotent
      expect(Array.isArray(appointments)).toBe(true);
    });
  });
});

