-- =====================================================
-- TEST APPOINTMENTS DATA
-- =====================================================
-- This inserts sample appointments to test the dashboard metrics
-- Run this AFTER creating the appointments table

-- Get account_id (using default account)
DO $$
DECLARE
  test_account_id uuid := '11111111-1111-1111-1111-111111111111';
  lead1_id uuid;
  lead2_id uuid;
  lead3_id uuid;
BEGIN
  -- Get some lead IDs from your existing leads
  SELECT id INTO lead1_id FROM public.leads WHERE account_id = test_account_id LIMIT 1;
  SELECT id INTO lead2_id FROM public.leads WHERE account_id = test_account_id LIMIT 1 OFFSET 1;
  SELECT id INTO lead3_id FROM public.leads WHERE account_id = test_account_id LIMIT 1 OFFSET 2;

  -- Insert test appointments
  -- 1. Booked appointment (future)
  INSERT INTO public.appointments (
    account_id, lead_id, provider, provider_event_id, 
    status, scheduled_at, attendee_name, attendee_email, 
    event_type, created_at
  ) VALUES (
    test_account_id, 
    lead1_id,
    'cal.com',
    'test_booking_001',
    'booked',
    now() + interval '2 days',
    'Test Lead 1',
    'test1@example.com',
    '30 Min Intro Call',
    now() - interval '1 day'  -- Created yesterday (should show in 7D)
  );

  -- 2. Kept appointment (past, attended)
  INSERT INTO public.appointments (
    account_id, lead_id, provider, provider_event_id,
    status, scheduled_at, attendee_name, attendee_email,
    event_type, created_at
  ) VALUES (
    test_account_id,
    lead2_id,
    'calendly',
    'test_booking_002',
    'kept',
    now() - interval '2 days',
    'Test Lead 2',
    'test2@example.com',
    'Demo Call',
    now() - interval '5 days'  -- Created 5 days ago (should show in 7D)
  );

  -- 3. No-show appointment (past, missed)
  INSERT INTO public.appointments (
    account_id, lead_id, provider, provider_event_id,
    status, scheduled_at, attendee_name, attendee_email,
    event_type, created_at
  ) VALUES (
    test_account_id,
    lead3_id,
    'cal.com',
    'test_booking_003',
    'no_show',
    now() - interval '1 day',
    'Test Lead 3',
    'test3@example.com',
    '30 Min Intro Call',
    now() - interval '3 days'  -- Created 3 days ago (should show in 7D)
  );

  -- 4. Rescheduled appointment (counts as booked)
  INSERT INTO public.appointments (
    account_id, lead_id, provider, provider_event_id,
    status, scheduled_at, attendee_name, attendee_email,
    event_type, created_at
  ) VALUES (
    test_account_id,
    lead1_id,
    'cal.com',
    'test_booking_004',
    'rescheduled',
    now() + interval '3 days',
    'Test Lead 1',
    'test1@example.com',
    '30 Min Intro Call',
    now() - interval '2 days'  -- Created 2 days ago (should show in 7D)
  );

  RAISE NOTICE 'Test appointments inserted successfully!';
  RAISE NOTICE 'Expected 7D metrics:';
  RAISE NOTICE '  Booked: 2 (1 booked + 1 rescheduled)';
  RAISE NOTICE '  Kept: 1';
  RAISE NOTICE '  No-Show: 1';
  RAISE NOTICE '  Show-up Rate: 50%% (1 kept / 2 booked)';
END $$;

-- Verify the data
SELECT 
  status,
  COUNT(*) as count
FROM public.appointments
WHERE account_id = '11111111-1111-1111-1111-111111111111'
GROUP BY status
ORDER BY status;

-- Show all test appointments
SELECT 
  id,
  status,
  scheduled_at,
  attendee_name,
  event_type,
  created_at
FROM public.appointments
WHERE account_id = '11111111-1111-1111-1111-111111111111'
ORDER BY created_at DESC;

