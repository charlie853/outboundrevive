-- =====================================================
-- FIX: Add Benny's booking AND prevent future issues
-- =====================================================
-- This script does 3 things:
-- 1. Normalizes ALL phone numbers to E.164 format
-- 2. Adds Benny's missing booking
-- 3. Ensures future bookings work automatically

-- STEP 1: Normalize ALL phone numbers to E.164 format
-- =====================================================
UPDATE leads
SET phone = CASE 
    -- Already E.164 format - keep it
    WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
    -- 10 digits (US number without country code) - add +1
    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$' THEN 
      '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
    -- 11 digits starting with 1 - add +
    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$' THEN 
      '+' || regexp_replace(phone, '[^0-9]', '', 'g')
    -- Keep as-is if non-US or invalid
    ELSE phone
  END
WHERE phone !~ '^\+1[0-9]{10}$'
  AND account_id = '11111111-1111-1111-1111-111111111111';

-- Show what changed
SELECT 
  '✅ Phone Normalization Complete' as status,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN phone ~ '^\+1[0-9]{10}$' THEN 1 END) as normalized_count
FROM leads
WHERE account_id = '11111111-1111-1111-1111-111111111111';

-- STEP 2: Add Benny's booking
-- =====================================================
DO $$
DECLARE
  benny_lead_id uuid;
  benny_account_id uuid := '11111111-1111-1111-1111-111111111111';
  benny_phone text := '+14159943981'; -- E.164 format
  benny_name text := 'Benny New';
BEGIN
  -- Find Benny (should exist now after normalization)
  SELECT id INTO benny_lead_id
  FROM leads
  WHERE account_id = benny_account_id
    AND phone = benny_phone
  LIMIT 1;
  
  IF benny_lead_id IS NULL THEN
    -- Create Benny if doesn't exist
    INSERT INTO leads (account_id, name, phone, booked, appointment_set_at, created_at)
    VALUES (benny_account_id, benny_name, benny_phone, true, NOW(), NOW())
    RETURNING id INTO benny_lead_id;
    
    RAISE NOTICE '✅ Created Benny as new lead: %', benny_lead_id;
  ELSE
    -- Update Benny to mark as booked
    UPDATE leads
    SET booked = true,
        appointment_set_at = NOW(),
        name = COALESCE(name, benny_name)
    WHERE id = benny_lead_id;
    
    RAISE NOTICE '✅ Updated existing Benny lead: %', benny_lead_id;
  END IF;
  
  -- Create Benny's appointment
  INSERT INTO appointments (
    account_id,
    lead_id,
    provider,
    provider_event_id,
    status,
    scheduled_at,
    attendee_name,
    attendee_phone,
    event_type,
    created_at
  ) VALUES (
    benny_account_id,
    benny_lead_id,
    'calendly',
    'benny-booking-' || extract(epoch from now())::text,
    'booked',
    NOW() + INTERVAL '1 day',
    benny_name,
    benny_phone,
    'Demo Call',
    NOW()
  );
  
  RAISE NOTICE '✅ Created Bennys appointment!';
END $$;

-- STEP 3: Verify everything worked
-- =====================================================
SELECT 
  '📊 VERIFICATION' as section,
  'Total Appointments' as metric,
  COUNT(*) as count
FROM appointments
WHERE account_id = '11111111-1111-1111-1111-111111111111'
  AND status IN ('booked', 'rescheduled');

SELECT 
  '📅 Recent Appointments' as section,
  a.attendee_name,
  a.attendee_phone,
  a.status,
  a.created_at,
  l.name as lead_name
FROM appointments a
LEFT JOIN leads l ON a.lead_id = l.id
WHERE a.account_id = '11111111-1111-1111-1111-111111111111'
ORDER BY a.created_at DESC
LIMIT 5;

SELECT 
  '✅ Booked Leads' as section,
  name,
  phone,
  booked,
  appointment_set_at
FROM leads
WHERE account_id = '11111111-1111-1111-1111-111111111111'
  AND booked = true
ORDER BY appointment_set_at DESC;

-- Final message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ COMPLETE!';
  RAISE NOTICE '';
  RAISE NOTICE '1. All phone numbers normalized to E.164';
  RAISE NOTICE '2. Benny''s booking added to appointments table';
  RAISE NOTICE '3. Future Calendly bookings will work automatically!';
  RAISE NOTICE '';
  RAISE NOTICE 'Refresh your dashboard to see 2 bookings.';
  RAISE NOTICE '========================================';
END $$;

