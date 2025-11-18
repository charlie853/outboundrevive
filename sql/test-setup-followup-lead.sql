-- SQL Helper: Set up a test lead for follow-up testing
-- This creates/updates a lead to be eligible for follow-up enrollment

-- Replace these with your actual values:
-- @account_id: Your account UUID
-- @test_phone: Phone number to test with (E.164 format: +1234567890)
-- @test_name: Name for the test lead

-- Example usage:
-- Set account_id, phone, and name variables, then run this script in Supabase SQL Editor

-- Step 1: Find or create a test lead
DO $$
DECLARE
  v_account_id UUID := '11111111-1111-1111-1111-111111111111'; -- REPLACE WITH YOUR ACCOUNT ID
  v_test_phone TEXT := '+14155551234'; -- REPLACE WITH YOUR TEST PHONE
  v_test_name TEXT := 'Test Lead';
  v_lead_id UUID;
BEGIN
  -- Find existing lead or create new one
  SELECT id INTO v_lead_id
  FROM leads
  WHERE account_id = v_account_id
    AND phone = v_test_phone
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    -- Create new lead
    INSERT INTO leads (account_id, phone, name, opted_out, replied, booked)
    VALUES (v_account_id, v_test_phone, v_test_name, false, false, false)
    RETURNING id INTO v_lead_id;
    
    RAISE NOTICE 'Created new test lead: %', v_lead_id;
  ELSE
    RAISE NOTICE 'Found existing test lead: %', v_lead_id;
  END IF;

  -- Step 2: Set up lead to be eligible for follow-up
  -- Last outbound was 49 hours ago (eligible for follow-up)
  -- Last inbound is NULL or older than last outbound (conversation "died")
  UPDATE leads
  SET 
    last_sent_at = NOW() - INTERVAL '49 hours',
    last_inbound_at = NOW() - INTERVAL '50 hours', -- Older than last_sent_at
    last_reply_at = NULL,
    opted_out = false,
    replied = false,
    booked = false
  WHERE id = v_lead_id;

  RAISE NOTICE 'Test lead configured for follow-up enrollment';
  RAISE NOTICE 'Lead ID: %', v_lead_id;
  RAISE NOTICE 'Last sent: 49 hours ago';
  RAISE NOTICE 'Last inbound: 50 hours ago';
  
  -- Step 3: Cancel any existing follow-up cursors (fresh start)
  UPDATE ai_followup_cursor
  SET status = 'cancelled'
  WHERE lead_id = v_lead_id;
  
  RAISE NOTICE 'Cancelled any existing follow-up cursors';
  
  -- Step 4: Verify eligibility
  RAISE NOTICE '';
  RAISE NOTICE '✅ Test lead is ready!';
  RAISE NOTICE '';
  RAISE NOTICE 'To test enrollment, run:';
  RAISE NOTICE '  curl -X POST https://www.outboundrevive.com/api/cron/enroll-followups \';
  RAISE NOTICE '    -H "x-admin-token: YOUR_ADMIN_KEY"';
  RAISE NOTICE '';
  RAISE NOTICE 'To check if lead is enrolled, run:';
  RAISE NOTICE '  SELECT * FROM ai_followup_cursor WHERE lead_id = ''%'';', v_lead_id;
END $$;

-- Step 5: Verify the setup
SELECT 
  id,
  phone,
  name,
  last_sent_at,
  last_inbound_at,
  opted_out,
  replied,
  booked,
  CASE 
    WHEN last_sent_at < NOW() - INTERVAL '48 hours' THEN '✅ Eligible (silent 48+ hours)'
    ELSE '❌ Not eligible yet'
  END as eligibility_status
FROM leads
WHERE phone = '+14155551234' -- REPLACE WITH YOUR TEST PHONE
LIMIT 1;

-- Step 6: Check if RPC function can find this lead
-- SELECT * FROM leads_with_died_conversations(
--   '11111111-1111-1111-1111-111111111111', -- REPLACE WITH YOUR ACCOUNT ID
--   48
-- );


