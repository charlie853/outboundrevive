-- =====================================================
-- DEBUG: Check all bookings and recent webhook activity
-- =====================================================

-- Step 1: Show all appointments (most recent first)
SELECT 
  '📅 ALL APPOINTMENTS' as section,
  a.id,
  a.provider,
  a.status,
  a.attendee_name,
  a.attendee_phone,
  a.attendee_email,
  a.created_at,
  a.scheduled_at,
  l.name as lead_name,
  l.phone as lead_phone
FROM appointments a
LEFT JOIN leads l ON a.lead_id = l.id
WHERE a.account_id = '11111111-1111-1111-1111-111111111111'
ORDER BY a.created_at DESC
LIMIT 10;

-- Step 2: Show leads with booked=true
SELECT 
  '✅ LEADS MARKED AS BOOKED' as section,
  id,
  name,
  phone,
  email,
  booked,
  appointment_set_at,
  created_at
FROM leads
WHERE account_id = '11111111-1111-1111-1111-111111111111'
  AND booked = true
ORDER BY appointment_set_at DESC NULLS LAST
LIMIT 10;

-- Step 3: Show recent system messages (webhook notifications)
SELECT 
  '📨 RECENT WEBHOOK MESSAGES' as section,
  mi.id,
  mi.body,
  mi.created_at,
  l.name as lead_name,
  l.phone as lead_phone
FROM messages_in mi
LEFT JOIN leads l ON mi.lead_id = l.id
WHERE mi.account_id = '11111111-1111-1111-1111-111111111111'
  AND mi.provider_from = 'system'
  AND mi.body LIKE '%Calendar%'
ORDER BY mi.created_at DESC
LIMIT 10;

-- Step 4: Check for leads that might not have E.164 phone format
SELECT 
  '⚠️ LEADS WITH NON-E164 PHONES' as section,
  id,
  name,
  phone,
  email
FROM leads
WHERE account_id = '11111111-1111-1111-1111-111111111111'
  AND phone !~ '^\+1[0-9]{10}$'
  AND phone IS NOT NULL
LIMIT 10;

-- Step 5: Count total appointments vs booked leads (should match)
SELECT 
  '📊 SUMMARY' as section,
  (SELECT COUNT(*) FROM appointments WHERE account_id = '11111111-1111-1111-1111-111111111111' AND status IN ('booked', 'rescheduled')) as appointments_count,
  (SELECT COUNT(*) FROM leads WHERE account_id = '11111111-1111-1111-1111-111111111111' AND booked = true) as booked_leads_count;

