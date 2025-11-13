import { describe, it, expect } from '@jest/globals';
import { DateTime } from 'luxon';
import { __test__ } from '../pages/api/metrics';

const { dedupeMessagesOut, buildDeliverySeries, buildReplySeries, buildFunnel } = __test__;

describe('metrics helper utilities', () => {
  const timezone = 'America/Los_Angeles';

  it('dedupes provider SIDs and prefers terminal statuses', () => {
    const rows = [
      {
        id: 'msg-1',
        lead_id: 'lead-1',
        provider_sid: 'sid-123',
        sid: null,
        sent_at: '2025-05-01T15:00:00.000Z',
        created_at: '2025-05-01T15:00:00.000Z',
        provider_status: 'sent',
        status: 'sent',
      },
      {
        id: 'msg-2',
        lead_id: 'lead-1',
        provider_sid: 'sid-123',
        sid: null,
        sent_at: '2025-05-01T15:00:00.000Z',
        created_at: '2025-05-01T15:05:00.000Z',
        provider_status: 'delivered',
        status: 'delivered',
      },
    ];

    const result = dedupeMessagesOut(rows as any);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ status: 'delivered', leadId: 'lead-1', key: 'sid-123' });
  });

  it('buckets delivery data using tenant timezone across midnight boundaries', () => {
    const since = DateTime.fromISO('2025-05-01T00:00:00', { zone: timezone });
    const rows = [
      {
        id: 'msg-a',
        lead_id: 'lead-a',
        provider_sid: 'sid-a',
        sid: null,
        sent_at: DateTime.fromISO('2025-05-01T23:30:00', { zone: timezone }).toUTC().toISO(),
        created_at: DateTime.fromISO('2025-05-01T23:30:00', { zone: timezone }).toUTC().toISO(),
        provider_status: 'delivered',
        status: 'delivered',
      },
      {
        id: 'msg-b',
        lead_id: 'lead-b',
        provider_sid: 'sid-b',
        sid: null,
        sent_at: DateTime.fromISO('2025-05-02T00:15:00', { zone: timezone }).toUTC().toISO(),
        created_at: DateTime.fromISO('2025-05-02T00:15:00', { zone: timezone }).toUTC().toISO(),
        provider_status: 'failed',
        status: 'failed',
      },
    ];

    const normalized = dedupeMessagesOut(rows as any);
    const { buckets, contacted, delivered } = buildDeliverySeries(normalized, timezone, 'day', since);

    expect(buckets).toHaveLength(2);
    expect(buckets[0].label).toBe('May 1');
    expect(buckets[0].delivered).toBe(1);
    expect(buckets[0].failed).toBe(0);
    expect(buckets[1].label).toBe('May 2');
    expect(buckets[1].failed).toBe(1);
    expect(buckets[1].delivered).toBe(0);
    buckets.forEach((bucket) => {
      expect(bucket.failed).toBeLessThanOrEqual(bucket.sent);
      expect(bucket.delivered).toBeLessThanOrEqual(bucket.sent);
      expect(bucket.sent).toBeGreaterThan(0);
    });
    expect(contacted.size).toBe(2);
    expect(delivered.size).toBe(1);
  });

  it('computes reply buckets and funnel metrics with consistent rates', () => {
    const since = DateTime.fromISO('2025-05-01T00:00:00', { zone: timezone });
    const normalized = dedupeMessagesOut([
      {
        id: 'msg-1',
        lead_id: 'lead-1',
        provider_sid: 'sid-1',
        sid: null,
        sent_at: DateTime.fromISO('2025-05-01T10:00:00', { zone: timezone }).toUTC().toISO(),
        created_at: DateTime.fromISO('2025-05-01T10:00:00', { zone: timezone }).toUTC().toISO(),
        provider_status: 'delivered',
        status: 'delivered',
      },
      {
        id: 'msg-2',
        lead_id: 'lead-2',
        provider_sid: 'sid-2',
        sid: null,
        sent_at: DateTime.fromISO('2025-05-01T11:00:00', { zone: timezone }).toUTC().toISO(),
        created_at: DateTime.fromISO('2025-05-01T11:00:00', { zone: timezone }).toUTC().toISO(),
        provider_status: 'delivered',
        status: 'delivered',
      },
    ] as any);

    const delivery = buildDeliverySeries(normalized, timezone, 'day', since);
    const replies = buildReplySeries(
      [
        {
          id: 'in-1',
          lead_id: 'lead-1',
          created_at: DateTime.fromISO('2025-05-01T12:00:00', { zone: timezone }).toUTC().toISO(),
        },
        {
          id: 'in-2',
          lead_id: 'lead-2',
          created_at: DateTime.fromISO('2025-05-01T12:30:00', { zone: timezone }).toUTC().toISO(),
        },
      ],
      timezone,
      'day',
      since
    );
    const bookingData = new Set(['lead-1']);
    const funnel = buildFunnel(
      timezone,
      '7d',
      new Set([...delivery.contacted, ...replies.replied, ...bookingData]),
      delivery.contacted,
      delivery.delivered,
      replies.replied,
      bookingData
    );

    expect(replies.buckets).toHaveLength(1);
    expect(replies.buckets[0].replies).toBe(2);
    expect(funnel.stages.find((s) => s.key === 'leads')?.count).toBe(2);
    expect(Math.round((funnel.rates.contactRate ?? 0) * 100)).toBe(100);
    expect(Math.round((funnel.rates.replyRate ?? 0) * 100)).toBe(100);
    expect(Math.round((funnel.rates.bookingRate ?? 0) * 100)).toBe(50);
  });
});

