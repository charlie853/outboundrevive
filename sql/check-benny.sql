-- Check if Benny exists and what phone format is stored
SELECT 
  'Looking for Benny with (415) 994-3981' as search,
  id,
  name,
  phone,
  email,
  booked,
  appointment_set_at
FROM leads
WHERE account_id = '11111111-1111-1111-1111-111111111111'
  AND (
    phone LIKE '%415%994%3981%' 
    OR phone = '+14159943981'
    OR phone = '4159943981'
    OR phone = '(415) 994-3981'
    OR name ILIKE '%benny%'
  );

-- Also check what E.164 format would be
SELECT '+14159943981' as expected_e164_format;

