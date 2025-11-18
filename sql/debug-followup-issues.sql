-- Debug Follow-Up Issues
-- Run this in Supabase SQL Editor to diagnose why follow-ups aren't working

-- 1. Check if follow-up tables exist
SELECT 
  'ai_followup_cursor' as table_name,
  COUNT(*) as row_count
FROM ai_followup_cursor

UNION ALL

SELECT 
  'ai_followup_log' as table_name,
  COUNT(*) as row_count
FROM ai_followup_log

UNION ALL

SELECT 
  'account_followup_settings' as table_name,
  COUNT(*) as row_count
FROM account_followup_settings;

-- 2. Check leads that SHOULD be eligible for follow-up
-- (conversation "died" - no reply for 48+ hours)
SELECT 
  l.id,
  l.name,
  l.phone,
  l.account_id,
  l.opted_out,
  l.replied,
  l.booked,
  l.last_sent_at,
  l.last_inbound_at,
  l.last_reply_at,
  CASE 
    WHEN l.opted_out = true THEN '❌ Opted out'
    WHEN l.last_sent_at IS NULL THEN '❌ Never sent'
    WHEN l.last_sent_at > NOW() - INTERVAL '48 hours' THEN '⏰ Too recent (< 48h)'
    WHEN l.last_inbound_at IS NOT NULL AND l.last_inbound_at >= l.last_sent_at THEN '❌ Has recent inbound'
    WHEN EXISTS (
      SELECT 1 FROM ai_followup_cursor c 
      WHERE c.lead_id = l.id AND c.status IN ('active', 'processing')
    ) THEN '✅ Already enrolled'
    ELSE '✅ ELIGIBLE'
  END as eligibility_status,
  NOW() - l.last_sent_at as time_since_last_sent
FROM leads l
WHERE l.account_id IN (
  SELECT id FROM accounts WHERE outbound_paused = false LIMIT 5
)
ORDER BY l.last_sent_at DESC NULLS LAST
LIMIT 20;

-- 3. Check existing follow-up cursors
SELECT 
  c.lead_id,
  l.name,
  l.phone,
  c.status,
  c.attempt,
  c.max_attempts,
  c.cadence,
  c.next_at,
  c.created_at,
  CASE 
    WHEN c.next_at <= NOW() THEN '✅ Ready to send'
    ELSE '⏰ Scheduled for later'
  END as send_status
FROM ai_followup_cursor c
JOIN leads l ON l.id = c.lead_id
WHERE c.status IN ('active', 'processing')
ORDER BY c.next_at ASC
LIMIT 10;

-- 4. Check recent follow-up logs (attempts)
SELECT 
  log.lead_id,
  l.name,
  l.phone,
  log.attempt,
  log.status,
  log.reason,
  log.planned_at,
  log.sent_sid,
  log.created_at
FROM ai_followup_log log
JOIN leads l ON l.id = log.lead_id
ORDER BY log.created_at DESC
LIMIT 10;

-- 5. Check for leads with missing phone numbers
SELECT 
  id,
  name,
  phone,
  account_id,
  CASE 
    WHEN phone IS NULL OR phone = '' THEN '❌ Missing phone'
    ELSE '✅ Has phone'
  END as phone_status
FROM leads
WHERE id IN (
  SELECT DISTINCT lead_id FROM ai_followup_cursor WHERE status IN ('active', 'processing')
)
ORDER BY created_at DESC;

-- 6. Test RPC function (replace with your account_id)
-- SELECT * FROM leads_with_died_conversations(
--   'YOUR_ACCOUNT_ID_HERE'::uuid,
--   48
-- );

-- 7. Fix common issues:
-- Fix missing phone number:
-- UPDATE leads SET phone = '+14155551234' WHERE id = 'LEAD_ID_HERE' AND (phone IS NULL OR phone = '');

-- Make a lead eligible for testing (set last_sent_at to 49 hours ago):
-- UPDATE leads 
-- SET 
--   last_sent_at = NOW() - INTERVAL '49 hours',
--   last_inbound_at = NOW() - INTERVAL '50 hours',
--   last_reply_at = NULL,
--   opted_out = false,
--   replied = false,
--   booked = false
-- WHERE id = 'LEAD_ID_HERE';

-- Cancel existing cursors to start fresh:
-- UPDATE ai_followup_cursor 
-- SET status = 'cancelled' 
-- WHERE lead_id = 'LEAD_ID_HERE';


