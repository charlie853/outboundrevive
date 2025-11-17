-- Create a test booking that will show up in dashboard metrics
-- Run this in Supabase SQL Editor

-- Step 1: Create a test lead (or use existing one)
INSERT INTO leads (
  account_id,
  name,
  phone,
  email,
  created_at
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Test Booking User',
  '+15559998888',
  'testbooking@example.com',
  NOW()
) ON CONFLICT (phone) DO NOTHING;

-- Step 2: Get the lead_id
DO $$
DECLARE
  test_lead_id uuid;
BEGIN
  SELECT id INTO test_lead_id 
  FROM leads 
  WHERE phone = '+15559998888';

  -- Step 3: Create appointment
  INSERT INTO appointments (
    account_id,
    lead_id,
    provider,
    provider_event_id,
    status,
    scheduled_at,
    attendee_name,
    attendee_email,
    attendee_phone,
    event_type,
    created_at
  ) VALUES (
    '11111111-1111-1111-1111-111111111111',
    test_lead_id,
    'calendly',
    'test-booking-' || gen_random_uuid(),
    'booked',
    NOW() + INTERVAL '1 day',
    'Test Booking User',
    'testbooking@example.com',
    '+15559998888',
    '30 Min Intro Call',
    NOW()
  );

  -- Step 4: Update lead status
  UPDATE leads
  SET last_booking_status = 'booked',
      appointment_set_at = NOW()
  WHERE id = test_lead_id;
END $$;

-- Verify it worked
SELECT 
  a.status,
  a.provider,
  a.created_at,
  l.name,
  l.phone
FROM appointments a
JOIN leads l ON a.lead_id = l.id
WHERE a.account_id = '11111111-1111-1111-1111-111111111111'
ORDER BY a.created_at DESC
LIMIT 5;

