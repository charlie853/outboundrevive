-- =====================================================
-- PROPER FIX: Normalize ALL phone numbers to E.164 format
-- =====================================================
-- This ensures ALL future Calendly bookings will match correctly
-- Run this ONCE to fix all existing leads

-- Step 1: Show what will change (preview)
SELECT 
  'PREVIEW - These phones will be normalized' as status,
  id,
  name,
  phone as old_phone,
  CASE 
    -- Already E.164 format
    WHEN phone ~ '^\+1[0-9]{10}$' THEN phone
    -- 10 digits (US number without country code)
    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10}$' THEN 
      '+1' || regexp_replace(phone, '[^0-9]', '', 'g')
    -- 11 digits starting with 1
    WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^1[0-9]{10}$' THEN 
      '+' || regexp_replace(phone, '[^0-9]', '', 'g')
    -- Keep as-is if non-US or invalid
    ELSE phone
  END as new_phone
FROM leads
WHERE phone !~ '^\+1[0-9]{10}$'  -- Not already in E.164
LIMIT 10;

-- Step 2: Actually normalize the phone numbers
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
WHERE phone !~ '^\+1[0-9]{10}$';

-- Step 3: Show what was changed
SELECT 
  '✅ SUMMARY' as status,
  COUNT(*) as total_leads,
  COUNT(CASE WHEN phone ~ '^\+1[0-9]{10}$' THEN 1 END) as normalized_count,
  COUNT(CASE WHEN phone !~ '^\+1[0-9]{10}$' THEN 1 END) as non_standard_count
FROM leads;

-- Step 4: Show any remaining non-standard phones (international, etc.)
SELECT 
  '⚠️ Non-US or Invalid Phones' as status,
  id,
  name,
  phone
FROM leads
WHERE phone !~ '^\+1[0-9]{10}$'
LIMIT 10;

