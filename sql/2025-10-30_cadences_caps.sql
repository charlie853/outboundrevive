-- Cadences, Caps, and Supporting Tables (ADD-ONLY, SAFE MIGRATIONS)
-- Note: Uses IF NOT EXISTS; no destructive ops

-- Campaigns (per-tenant logical sequences like "new", "reactivation")
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text CHECK (type IN ('new','reactivation','winback','custom')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaigns_account ON public.campaigns(account_id);

-- Per-campaign cadence settings
CREATE TABLE IF NOT EXISTS public.campaign_cadence_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  max_touches int NOT NULL DEFAULT 3,
  min_spacing_hours int NOT NULL DEFAULT 24,
  active_windows jsonb NOT NULL DEFAULT '[]'::jsonb, -- e.g., [{"dow":[1,2,3,4,5],"start":"09:00","end":"17:00"}]
  cooldown_hours int NOT NULL DEFAULT 48, -- consider conversation died after X hours since last outbound with no inbound
  stop_on_booked boolean NOT NULL DEFAULT true,
  stop_on_opt_out boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cadence_settings_account_campaign ON public.campaign_cadence_settings(account_id,campaign_id);

-- Cadence runs (touch tracking)
CREATE TABLE IF NOT EXISTS public.cadence_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  touch_num int NOT NULL,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled|sent|cancelled|failed
  cancelled_at timestamptz,
  cancel_reason text
);
CREATE INDEX IF NOT EXISTS idx_cadence_runs_account_lead ON public.cadence_runs(account_id, lead_id);

-- Tenant billing & caps
CREATE TABLE IF NOT EXISTS public.tenant_billing (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  plan_tier text, -- lite|standard|pro|custom
  monthly_cap_segments int NOT NULL DEFAULT 1000,
  cycle_start date NOT NULL DEFAULT (CURRENT_DATE),
  cycle_end date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  segments_used int NOT NULL DEFAULT 0,
  warn_80_sent boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add segments column to messages for accounting (idempotent add)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='messages_in' AND column_name='segments'
  ) THEN
    ALTER TABLE public.messages_in ADD COLUMN segments int;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='messages_out' AND column_name='segments'
  ) THEN
    ALTER TABLE public.messages_out ADD COLUMN segments int;
  END IF;
END $$;

-- Per-tenant booking URL override on accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accounts' AND column_name='booking_url'
  ) THEN
    ALTER TABLE public.accounts ADD COLUMN booking_url text;
  END IF;
END $$;

-- Threads performance indexes (if missing)
CREATE INDEX IF NOT EXISTS idx_messages_in_thread ON public.messages_in(account_id, lead_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_messages_out_thread ON public.messages_out(account_id, lead_id, created_at, id);


