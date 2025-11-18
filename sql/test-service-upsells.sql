-- Test data setup for service-upsells cron
-- Run this in Supabase SQL Editor to create test service events

-- 1) Create a test lead (if needed)
INSERT INTO public.leads (id, name, phone, account_id, status)
VALUES (
  'test-service-lead-001',
  'Test Service Lead',
  '+14155551234',
  '11111111-1111-1111-1111-111111111111', -- Replace with your account_id
  'pending'
)
ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name;

-- 2) Create a test vehicle (if needed)
INSERT INTO public.vehicles (id, account_id, vin, year, make, model, mileage_band)
VALUES (
  'test-vehicle-001',
  '11111111-1111-1111-1111-111111111111', -- Replace with your account_id
  'TEST123456789',
  2020,
  'Toyota',
  'Camry',
  '25-50k'
)
ON CONFLICT (account_id, vin) DO NOTHING;

-- 3) Create a service event for PRE trigger (appointment 48h from now)
-- This will trigger the T-48h upsell
INSERT INTO public.service_events (
  id,
  account_id,
  lead_id,
  vehicle_id,
  appt_time,
  external_id,
  status,
  upsell_pre_sent_at,
  upsell_ro_sent_at,
  upsell_post_sent_at
)
VALUES (
  'test-service-pre-001',
  '11111111-1111-1111-1111-111111111111', -- Replace with your account_id
  'test-service-lead-001',
  'test-vehicle-001',
  NOW() + INTERVAL '40 hours', -- Within the 36-48h window
  'TEST-RO-PRE-001',
  'scheduled',
  NULL, -- Not sent yet
  NULL,
  NULL
)
ON CONFLICT (account_id, external_id) DO UPDATE SET appt_time = EXCLUDED.appt_time;

-- 4) Create a service event for RO trigger (RO just opened)
-- This will trigger the RO-open upsell
INSERT INTO public.service_events (
  id,
  account_id,
  lead_id,
  vehicle_id,
  ro_opened_at,
  external_id,
  status,
  upsell_pre_sent_at,
  upsell_ro_sent_at,
  upsell_post_sent_at
)
VALUES (
  'test-service-ro-001',
  '11111111-1111-1111-1111-111111111111', -- Replace with your account_id
  'test-service-lead-001',
  'test-vehicle-001',
  NOW() - INTERVAL '30 minutes', -- RO opened 30 min ago
  'TEST-RO-OPEN-001',
  'in_progress',
  NULL,
  NULL, -- Not sent yet
  NULL
)
ON CONFLICT (account_id, external_id) DO UPDATE SET ro_opened_at = EXCLUDED.ro_opened_at;

-- 5) Create a service event for POST trigger (RO closed 24h ago)
-- This will trigger the T+24h post-upsell
INSERT INTO public.service_events (
  id,
  account_id,
  lead_id,
  vehicle_id,
  ro_closed_at,
  external_id,
  status,
  upsell_pre_sent_at,
  upsell_ro_sent_at,
  upsell_post_sent_at
)
VALUES (
  'test-service-post-001',
  '11111111-1111-1111-1111-111111111111', -- Replace with your account_id
  'test-service-lead-001',
  'test-vehicle-001',
  NOW() - INTERVAL '20 hours', -- RO closed 20h ago
  'TEST-RO-POST-001',
  'completed',
  NULL,
  NULL,
  NULL -- Not sent yet
)
ON CONFLICT (account_id, external_id) DO UPDATE SET ro_closed_at = EXCLUDED.ro_closed_at;

-- 6) Create a test offer (if needed)
-- This offer will be eligible for the service events above
INSERT INTO public.offers (
  id,
  account_id,
  title,
  rule_json,
  est_price_low,
  est_price_high,
  vertical,
  active
)
VALUES (
  'test-offer-001',
  '11111111-1111-1111-1111-111111111111', -- Replace with your account_id
  'Brake Service Special',
  '{"vehicle_make": ["Toyota"], "mileage_band": ["25-50k", "50-75k"]}'::jsonb,
  299.00,
  499.00,
  'auto',
  true
)
ON CONFLICT DO NOTHING;

-- 7) Check what service events are eligible
-- Run this query to see which events will trigger upsells
SELECT 
  id,
  external_id,
  appt_time,
  ro_opened_at,
  ro_closed_at,
  CASE 
    WHEN upsell_pre_sent_at IS NULL 
      AND appt_time > NOW() + INTERVAL '36 hours' 
      AND appt_time < NOW() + INTERVAL '48 hours' 
    THEN 'PRE eligible'
    WHEN upsell_ro_sent_at IS NULL 
      AND ro_opened_at IS NOT NULL 
      AND ro_opened_at > NOW() - INTERVAL '1 hour' 
    THEN 'RO eligible'
    WHEN upsell_post_sent_at IS NULL 
      AND ro_closed_at IS NOT NULL 
      AND ro_closed_at > NOW() - INTERVAL '24 hours' 
    THEN 'POST eligible'
    ELSE 'Not eligible'
  END as trigger_status
FROM public.service_events
WHERE account_id = '11111111-1111-1111-1111-111111111111' -- Replace with your account_id
ORDER BY created_at DESC
LIMIT 10;

