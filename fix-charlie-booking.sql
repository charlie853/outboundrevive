-- Fix booking for Charlie Fregozo (818) 370-9444
-- Run this in Supabase SQL Editor

-- Step 1: Check if lead exists and get the ID
DO $$
DECLARE
  charlie_lead_id uuid;
  charlie_account_id uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  -- Try to find Charlie by phone (try both formats)
  SELECT id, account_id INTO charlie_lead_id, charlie_account_id
  FROM leads
  WHERE phone IN ('+18183709444', '(818) 370-9444', '8183709444', '+1 (818) 370-9444')
  LIMIT 1;

  -- If found, show info
  IF charlie_lead_id IS NOT NULL THEN
    RAISE NOTICE 'Found Charlie - Lead ID: %', charlie_lead_id;
    RAISE NOTICE 'Account ID: %', charlie_account_id;
    
    -- Create the appointment
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
      charlie_account_id,
      charlie_lead_id,
      'calendly',
      'manual-charlie-' || gen_random_uuid(),
      'booked',
      NOW() + INTERVAL '1 day',
      'Charlie Fregozo',
      'charlie@example.com',
      '+18183709444',
      '30 Min Intro Call',
      NOW()
    )
    ON CONFLICT (provider, provider_event_id) DO NOTHING;

    -- Update lead status
    UPDATE leads
    SET last_booking_status = 'booked',
        appointment_set_at = NOW(),
        phone = '+18183709444'  -- Normalize phone to E.164
    WHERE id = charlie_lead_id;

    RAISE NOTICE '✅ Appointment created successfully!';
    
  ELSE
    -- Charlie doesn't exist, create the lead first
    RAISE NOTICE '⚠️  Charlie not found, creating new lead...';
    
    INSERT INTO leads (
      account_id,
      name,
      phone,
      email,
      created_at
    ) VALUES (
      charlie_account_id,
      'Charlie Fregozo',
      '+18183709444',
      'charlie@example.com',
      NOW()
    )
    RETURNING id INTO charlie_lead_id;

    RAISE NOTICE 'Created lead with ID: %', charlie_lead_id;

    -- Now create the appointment
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
      charlie_account_id,
      charlie_lead_id,
      'calendly',
      'manual-charlie-' || gen_random_uuid(),
      'booked',
      NOW() + INTERVAL '1 day',
      'Charlie Fregozo',
      'charlie@example.com',
      '+18183709444',
      '30 Min Intro Call',
      NOW()
    );

    RAISE NOTICE '✅ Lead and appointment created successfully!';
  END IF;
END $$;

-- Verify it worked
SELECT 
  'Lead Info' as type,
  l.id,
  l.name,
  l.phone,
  l.last_booking_status,
  l.appointment_set_at
FROM leads l
WHERE l.phone = '+18183709444'

UNION ALL

SELECT 
  'Appointment Info' as type,
  a.id,
  a.provider,
  a.status,
  a.created_at::text,
  a.scheduled_at
FROM appointments a
JOIN leads l ON a.lead_id = l.id
WHERE l.phone = '+18183709444'
ORDER BY type;

-- Show total bookings for dashboard
SELECT 
  COUNT(*) as total_bookings,
  COUNT(CASE WHEN status = 'booked' THEN 1 END) as booked_count
FROM appointments
WHERE account_id = '11111111-1111-1111-1111-111111111111';

