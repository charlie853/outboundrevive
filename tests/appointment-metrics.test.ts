/**
 * Appointment & Re-engagement Metrics Tests
 * 
 * Tests the new dashboard metrics for appointment performance and lead re-engagement.
 * 
 * Test Strategy:
 * 1. Seed test data (leads, appointments, messages)
 * 2. Call /api/metrics with different date ranges
 * 3. Assert expected counts for appointments and re-engagement
 */

import { supabaseAdmin } from '@/lib/supabaseServer';

const TEST_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

describe('Appointment & Re-engagement Metrics', () => {
  let testLeadIds: string[] = [];

  beforeAll(async () => {
    // Clean up any existing test data
    await cleanupTestData();
  });

  afterAll(async () => {
    // Clean up test data
    await cleanupTestData();
  });

  async function cleanupTestData() {
    // Delete test leads (cascades to messages and appointments)
    if (testLeadIds.length > 0) {
      await supabaseAdmin
        .from('leads')
        .delete()
        .in('id', testLeadIds);
      testLeadIds = [];
    }
  }

  describe('Appointment Metrics', () => {
    it('should count booked appointments correctly', async () => {
      // Seed 3 leads
      const leads = await seedLeads(3);
      testLeadIds.push(...leads.map(l => l.id));

      // Create 2 booked appointments (one rescheduled)
      await supabaseAdmin.from('appointments').insert([
        {
          account_id: TEST_ACCOUNT_ID,
          lead_id: leads[0].id,
          provider: 'calcom',
          provider_event_id: 'test-evt-1',
          status: 'booked',
          starts_at: new Date().toISOString(),
        },
        {
          account_id: TEST_ACCOUNT_ID,
          lead_id: leads[1].id,
          provider: 'calcom',
          provider_event_id: 'test-evt-2',
          status: 'rescheduled',
          starts_at: new Date().toISOString(),
        },
      ]);

      // Fetch metrics
      const response = await fetch(`${BASE_URL}/api/metrics?range=7d&account_id=${TEST_ACCOUNT_ID}`);
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.kpis.appointmentsBooked).toBe(2); // booked + rescheduled
      expect(data.kpis.appointmentsKept).toBe(0);
      expect(data.kpis.appointmentsNoShow).toBe(0);
    });

    it('should count kept and no-show appointments correctly', async () => {
      // Clean previous test data
      await cleanupTestData();

      // Seed 4 leads
      const leads = await seedLeads(4);
      testLeadIds.push(...leads.map(l => l.id));

      // Create appointments with different statuses
      await supabaseAdmin.from('appointments').insert([
        {
          account_id: TEST_ACCOUNT_ID,
          lead_id: leads[0].id,
          provider: 'calcom',
          provider_event_id: 'test-evt-3',
          status: 'booked',
          starts_at: new Date().toISOString(),
        },
        {
          account_id: TEST_ACCOUNT_ID,
          lead_id: leads[1].id,
          provider: 'calcom',
          provider_event_id: 'test-evt-4',
          status: 'kept',
          starts_at: new Date().toISOString(),
        },
        {
          account_id: TEST_ACCOUNT_ID,
          lead_id: leads[2].id,
          provider: 'calcom',
          provider_event_id: 'test-evt-5',
          status: 'no_show',
          starts_at: new Date().toISOString(),
        },
      ]);

      // Fetch metrics
      const response = await fetch(`${BASE_URL}/api/metrics?range=7d&account_id=${TEST_ACCOUNT_ID}`);
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.kpis.appointmentsBooked).toBe(1); // only 'booked' status
      expect(data.kpis.appointmentsKept).toBe(1);
      expect(data.kpis.appointmentsNoShow).toBe(1);
    });

    it('should respect date range filters for appointments', async () => {
      // Clean previous test data
      await cleanupTestData();

      // Seed 2 leads
      const leads = await seedLeads(2);
      testLeadIds.push(...leads.map(l => l.id));

      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 3600 * 1000);

      // Create appointments at different times
      await supabaseAdmin.from('appointments').insert([
        {
          account_id: TEST_ACCOUNT_ID,
          lead_id: leads[0].id,
          provider: 'calcom',
          provider_event_id: 'test-evt-recent',
          status: 'booked',
          starts_at: threeDaysAgo.toISOString(),
          created_at: threeDaysAgo.toISOString(),
        },
        {
          account_id: TEST_ACCOUNT_ID,
          lead_id: leads[1].id,
          provider: 'calcom',
          provider_event_id: 'test-evt-old',
          status: 'booked',
          starts_at: tenDaysAgo.toISOString(),
          created_at: tenDaysAgo.toISOString(),
        },
      ]);

      // Fetch 7-day metrics (should only include recent appointment)
      const response7d = await fetch(`${BASE_URL}/api/metrics?range=7d&account_id=${TEST_ACCOUNT_ID}`);
      const data7d = await response7d.json();

      expect(data7d.ok).toBe(true);
      expect(data7d.kpis.appointmentsBooked).toBe(1); // Only the one from 3 days ago

      // Fetch 1-month metrics (should include both)
      const response30d = await fetch(`${BASE_URL}/api/metrics?range=30d&account_id=${TEST_ACCOUNT_ID}`);
      const data30d = await response30d.json();

      expect(data30d.ok).toBe(true);
      expect(data30d.kpis.appointmentsBooked).toBe(2); // Both appointments
    });
  });

  describe('Re-engagement Metrics', () => {
    it('should count re-engaged leads correctly', async () => {
      // Clean previous test data
      await cleanupTestData();

      // Seed 3 leads
      const leads = await seedLeads(3);
      testLeadIds.push(...leads.map(l => l.id));

      const now = new Date();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
      const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000);

      // Lead 1: Inactive for 60 days, then replied 2 days ago (RE-ENGAGED)
      await supabaseAdmin.from('leads')
        .update({
          last_inbound_at: twoMonthsAgo.toISOString(),
          last_outbound_at: twoMonthsAgo.toISOString(),
        })
        .eq('id', leads[0].id);

      await supabaseAdmin.from('messages_out').insert({
        lead_id: leads[0].id,
        account_id: TEST_ACCOUNT_ID,
        body: 'Follow-up message',
        provider_from: '+15555555555',
        provider_to: leads[0].phone,
        created_at: twoDaysAgo.toISOString(),
      });

      await supabaseAdmin.from('messages_in').insert({
        lead_id: leads[0].id,
        account_id: TEST_ACCOUNT_ID,
        body: 'Yes, interested!',
        provider_from: leads[0].phone,
        provider_to: '+15555555555',
        created_at: twoDaysAgo.toISOString(),
      });

      // Update lead's last_inbound_at
      await supabaseAdmin.from('leads')
        .update({ last_inbound_at: twoDaysAgo.toISOString() })
        .eq('id', leads[0].id);

      // Lead 2: Active recently (NOT re-engaged)
      await supabaseAdmin.from('leads')
        .update({
          last_inbound_at: twoDaysAgo.toISOString(),
          last_outbound_at: twoDaysAgo.toISOString(),
        })
        .eq('id', leads[1].id);

      await supabaseAdmin.from('messages_in').insert({
        lead_id: leads[1].id,
        account_id: TEST_ACCOUNT_ID,
        body: 'Active reply',
        provider_from: leads[1].phone,
        provider_to: '+15555555555',
        created_at: twoDaysAgo.toISOString(),
      });

      // Fetch 7-day metrics
      const response = await fetch(`${BASE_URL}/api/metrics?range=7d&account_id=${TEST_ACCOUNT_ID}`);
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.kpis.reEngaged).toBe(1); // Only lead 1 is re-engaged
      expect(data.kpis.reEngagementRate).toBeGreaterThan(0);
    });

    it('should calculate re-engagement rate correctly', async () => {
      // Clean previous test data
      await cleanupTestData();

      // Seed 10 leads
      const leads = await seedLeads(10);
      testLeadIds.push(...leads.map(l => l.id));

      const now = new Date();
      const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000);
      const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);

      // Make 2 leads re-engaged (inactive, then replied recently)
      for (let i = 0; i < 2; i++) {
        await supabaseAdmin.from('leads')
          .update({
            last_inbound_at: twoMonthsAgo.toISOString(),
            last_outbound_at: twoMonthsAgo.toISOString(),
          })
          .eq('id', leads[i].id);

        await supabaseAdmin.from('messages_out').insert({
          lead_id: leads[i].id,
          account_id: TEST_ACCOUNT_ID,
          body: 'Re-engagement message',
          provider_from: '+15555555555',
          provider_to: leads[i].phone,
          created_at: yesterday.toISOString(),
        });

        await supabaseAdmin.from('messages_in').insert({
          lead_id: leads[i].id,
          account_id: TEST_ACCOUNT_ID,
          body: 'Reply',
          provider_from: leads[i].phone,
          provider_to: '+15555555555',
          created_at: yesterday.toISOString(),
        });

        await supabaseAdmin.from('leads')
          .update({ last_inbound_at: yesterday.toISOString() })
          .eq('id', leads[i].id);
      }

      // Contact all 10 leads recently
      for (let i = 0; i < 10; i++) {
        await supabaseAdmin.from('messages_out').insert({
          lead_id: leads[i].id,
          account_id: TEST_ACCOUNT_ID,
          body: 'Message',
          provider_from: '+15555555555',
          provider_to: leads[i].phone,
          created_at: yesterday.toISOString(),
        });
      }

      // Fetch metrics
      const response = await fetch(`${BASE_URL}/api/metrics?range=7d&account_id=${TEST_ACCOUNT_ID}`);
      const data = await response.json();

      expect(data.ok).toBe(true);
      expect(data.kpis.reEngaged).toBe(2);
      expect(data.kpis.contacted).toBe(10);
      expect(data.kpis.reEngagementRate).toBe(20); // 2/10 * 100 = 20%
    });
  });
});

// Helper functions

async function seedLeads(count: number) {
  const leads: any[] = [];
  for (let i = 0; i < count; i++) {
    const phone = `+1555000${String(i).padStart(4, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({
        account_id: TEST_ACCOUNT_ID,
        name: `Test Lead ${i}`,
        phone,
        email: `testlead${i}@example.com`,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to seed lead:', error);
      throw error;
    }
    leads.push(data);
  }
  return leads;
}

