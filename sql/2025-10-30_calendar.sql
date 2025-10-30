-- Calendar appointments and booking lifecycle (ADD-ONLY)

CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  provider text NOT NULL, -- 'calcom' | 'calendly' | 'other'
  provider_event_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('booked','rescheduled','canceled','kept','no_show')),
  starts_at timestamptz,
  ends_at timestamptz,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appt_provider_event ON public.appointments(provider, provider_event_id);
CREATE INDEX IF NOT EXISTS idx_appt_account_lead ON public.appointments(account_id, lead_id, starts_at);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'touch_updated_at_appointments'
  ) THEN
    CREATE TRIGGER touch_updated_at_appointments
      BEFORE UPDATE ON public.appointments
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;


