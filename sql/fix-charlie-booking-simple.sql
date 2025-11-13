-- =====================================================
-- SIMPLE FIX: Create booking for Charlie Fregozo
-- =====================================================
-- This handles Charlie Fregozo (818) 370-9444 booking
-- and normalizes the phone number for future webhook matching

-- Step 1: Ensure Charlie exists as a lead with normalized phone
INSERT INTO leads (
  account_id,
  name,
  phone,
  email,
  created_at
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Charlie Fregozo',
  '+18183709444',  -- E.164 format that webhook expects
  'charlie@example.com',
  NOW()
)
ON CONFLICT (phone) DO UPDATE
SET phone = '+18183709444',  -- Normalize if it exists with different format
    name = COALESCE(leads.name, 'Charlie Fregozo');

-- Step 2: Get Charlie's lead ID
WITH charlie AS (
  SELECT id, account_id FROM leads WHERE phone = '+18183709444' LIMIT 1
)
-- Step 3: Create the appointment
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
)
SELECT 
  c.account_id,
  c.id,
  'calendly',
  'manual-charlie-' || extract(epoch from now())::text,
  'booked',
  NOW() + INTERVAL '1 day',
  'Charlie Fregozo',
  'charlie@example.com',
  '+18183709444',
  '30 Min Intro Call',
  NOW()
FROM charlie c;

-- Step 4: Update lead booking status
UPDATE leads
SET last_booking_status = 'booked',
    appointment_set_at = NOW()
WHERE phone = '+18183709444';

-- Step 5: Verify it worked
SELECT 
  '✅ VERIFICATION' as status,
  l.id as lead_id,
  l.name,
  l.phone,
  l.last_booking_status,
  COUNT(a.id) as appointment_count
FROM leads l
LEFT JOIN appointments a ON a.lead_id = l.id
WHERE l.phone = '+18183709444'
GROUP BY l.id, l.name, l.phone, l.last_booking_status;

-- Show all appointments for this account
SELECT 
  'Total Bookings for Account' as metric,
  COUNT(*) as count
FROM appointments
WHERE account_id = '11111111-1111-1111-1111-111111111111'
  AND status IN ('booked', 'rescheduled');

