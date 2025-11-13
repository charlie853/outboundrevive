-- =====================================================
-- APPOINTMENTS TABLE
-- =====================================================
-- Stores appointment lifecycle data from calendar webhooks
-- (Cal.com, Calendly, Google Calendar, etc.)
--
-- This table is populated by calendar webhook handlers when:
-- - An appointment is booked
-- - An appointment is rescheduled
-- - An appointment is attended (kept)
-- - An appointment is no-show
-- - An appointment is cancelled
--
-- STATUS VALUES:
-- - 'booked': Initial booking created
-- - 'rescheduled': Booking was moved to a new time
-- - 'kept': Appointment was attended
-- - 'no_show': Appointment was missed
-- - 'cancelled': Appointment was cancelled

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  lead_id uuid,
  
  -- Calendar provider info
  provider text NOT NULL, -- 'cal.com', 'calendly', 'google', 'manual'
  provider_event_id text, -- External event ID from calendar provider
  provider_booking_uid text, -- Unique booking ID from provider
  
  -- Appointment details
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'rescheduled', 'kept', 'no_show', 'cancelled')),
  scheduled_at timestamp with time zone NOT NULL, -- When the appointment is scheduled for
  duration_minutes integer DEFAULT 30, -- Length of appointment
  
  -- Attendee info
  attendee_name text,
  attendee_email text,
  attendee_phone text,
  
  -- Metadata
  event_type text, -- e.g., '30 Min Intro Call', 'Demo', 'Consultation'
  notes text, -- Any notes from booking or cancellation
  metadata jsonb, -- Full webhook payload for reference
  
  -- Timestamps
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  CONSTRAINT appointments_pkey PRIMARY KEY (id),
  CONSTRAINT appointments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE,
  CONSTRAINT appointments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_account_id ON public.appointments(account_id);
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON public.appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_created_at ON public.appointments(created_at);
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON public.appointments(scheduled_at);

-- CRITICAL: Unique constraint for idempotent webhook handling
-- Prevents duplicate appointments when webhook fires multiple times
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_provider_event_unique 
  ON public.appointments(provider, provider_event_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_appointments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointments_updated_at_trigger
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_appointments_updated_at();

-- RLS policies (enable RLS)
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can see appointments for their account
-- Note: user_data.user_id is UUID (matches auth.uid()), user_data.id is bigint
CREATE POLICY appointments_select_own_account ON public.appointments
  FOR SELECT
  USING (account_id IN (
    SELECT account_id FROM public.user_data WHERE user_id = auth.uid()
  ));

-- Policy: Service role can do everything
CREATE POLICY appointments_service_role_all ON public.appointments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- SAMPLE DATA (for testing)
-- =====================================================
-- This is commented out by default. Uncomment to insert test data:
/*
INSERT INTO public.appointments (account_id, lead_id, provider, status, scheduled_at, attendee_name, attendee_email, event_type)
VALUES 
  -- Sample booked appointment
  ('11111111-1111-1111-1111-111111111111', 
   (SELECT id FROM public.leads WHERE account_id = '11111111-1111-1111-1111-111111111111' LIMIT 1),
   'cal.com',
   'booked',
   now() + interval '2 days',
   'John Smith',
   'john@example.com',
   '30 Min Intro Call'),
   
  -- Sample kept appointment (past)
  ('11111111-1111-1111-1111-111111111111',
   (SELECT id FROM public.leads WHERE account_id = '11111111-1111-1111-1111-111111111111' LIMIT 1 OFFSET 1),
   'calendly',
   'kept',
   now() - interval '2 days',
   'Jane Doe',
   'jane@example.com',
   'Demo Call'),
   
  -- Sample no-show (past)
  ('11111111-1111-1111-1111-111111111111',
   (SELECT id FROM public.leads WHERE account_id = '11111111-1111-1111-1111-111111111111' LIMIT 1 OFFSET 2),
   'cal.com',
   'no_show',
   now() - interval '1 day',
   'Bob Johnson',
   'bob@example.com',
   '30 Min Intro Call');
*/

-- =====================================================
-- NOTES FOR WEBHOOK INTEGRATION
-- =====================================================
-- When implementing calendar webhooks (Cal.com, Calendly, etc.), the handler should:
--
-- 1. On booking creation:
--    INSERT INTO appointments (account_id, lead_id, provider, provider_event_id, status, scheduled_at, ...)
--    VALUES (..., 'booked', ...);
--
-- 2. On rescheduling:
--    UPDATE appointments SET status = 'rescheduled', scheduled_at = new_time WHERE provider_event_id = ...;
--    -- OR create a new row and link it to the original
--
-- 3. On attendance (after meeting ends):
--    UPDATE appointments SET status = 'kept' WHERE provider_event_id = ... AND scheduled_at < now();
--
-- 4. On no-show detection:
--    UPDATE appointments SET status = 'no_show' WHERE provider_event_id = ... AND scheduled_at < now() - interval '30 minutes';
--
-- 5. On cancellation:
--    UPDATE appointments SET status = 'cancelled' WHERE provider_event_id = ...;
--
-- Example webhook handler locations:
-- - app/api/webhooks/cal/route.ts
-- - app/api/webhooks/calendly/route.ts
-- - app/api/webhooks/google-calendar/route.ts

