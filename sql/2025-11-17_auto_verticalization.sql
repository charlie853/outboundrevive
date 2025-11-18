-- =====================================================
-- AUTO DEALER VERTICALIZATION – DATA FOUNDATIONS
-- Adds vertical-specific tables used by dealerships plus
-- generic question/experiment infrastructure shared by
-- future verticals (medspa, home services, etc.)
-- =====================================================

-- 1) Accounts now track their selected vertical / industry
ALTER TABLE public.accounts
ADD COLUMN IF NOT EXISTS vertical text DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_accounts_vertical ON public.accounts(vertical);

-- 2) Leads capture lightweight vehicle interest metadata
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS preferred_vehicle jsonb,
ADD COLUMN IF NOT EXISTS vehicle_interest text;

-- 3) Vehicles owned or serviced by a tenant
CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  vin text,
  year integer,
  make text,
  model text,
  trim text,
  mileage_band text,
  mileage numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, vin)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_account_id ON public.vehicles(account_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON public.vehicles(vin);

-- 4) Ownership records linking leads to vehicles
CREATE TABLE IF NOT EXISTS public.ownerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  purchased_at timestamptz,
  financed_term_months integer,
  lease_end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, lead_id, vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_ownerships_account_id ON public.ownerships(account_id);
CREATE INDEX IF NOT EXISTS idx_ownerships_lead_id ON public.ownerships(lead_id);

-- 5) Service events (appointments, repair orders)
CREATE TABLE IF NOT EXISTS public.service_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  appt_time timestamptz,
  ro_opened_at timestamptz,
  ro_closed_at timestamptz,
  advisor text,
  location_id text,
  services jsonb,
  external_id text,
  status text,
  upsell_pre_sent_at timestamptz,
  upsell_ro_sent_at timestamptz,
  upsell_post_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_service_events_account_id ON public.service_events(account_id);
CREATE INDEX IF NOT EXISTS idx_service_events_lead_id ON public.service_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_service_events_vehicle_id ON public.service_events(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_service_events_appt_time ON public.service_events(appt_time);

-- 6) Appointments can be linked back to service events (ROs)
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS service_event_id uuid REFERENCES public.service_events(id);

-- 7) Offers library (upsells, promotions, etc.)
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title text NOT NULL,
  rule_json jsonb,
  est_price_low numeric,
  est_price_high numeric,
  compliance_note text,
  vertical text DEFAULT 'auto',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offers_account_id ON public.offers(account_id);

-- 8) Experiments + assignments (generic infra)
CREATE TABLE IF NOT EXISTS public.experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text,
  description text,
  holdout_pct numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, key)
);

CREATE TABLE IF NOT EXISTS public.experiment_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  experiment_id uuid NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  variant text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb,
  UNIQUE(experiment_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_experiment_assignments_account ON public.experiment_assignments(account_id);

-- 9) Offer sends + attribution
CREATE TABLE IF NOT EXISTS public.offer_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  service_event_id uuid REFERENCES public.service_events(id) ON DELETE SET NULL,
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages_out(id) ON DELETE SET NULL,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  variant text,
  accepted boolean NOT NULL DEFAULT false,
  accepted_at timestamptz,
  revenue_attributed numeric,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_event_id, offer_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_offer_sends_account_id ON public.offer_sends(account_id);
CREATE INDEX IF NOT EXISTS idx_offer_sends_service_event ON public.offer_sends(service_event_id);

-- 10) Next-to-buy scores (watchlist)
CREATE TABLE IF NOT EXISTS public.scores_next_buy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  score numeric NOT NULL,
  window text NOT NULL,
  reason_json jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_next_buy_account ON public.scores_next_buy(account_id);
CREATE INDEX IF NOT EXISTS idx_scores_next_buy_window ON public.scores_next_buy(window);

-- 11) Conversation facts captured from micro-surveys / AI
CREATE TABLE IF NOT EXISTS public.conv_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  confidence numeric,
  source text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  extra jsonb,
  UNIQUE(lead_id, key)
);

CREATE INDEX IF NOT EXISTS idx_conv_facts_account_id ON public.conv_facts(account_id);
CREATE INDEX IF NOT EXISTS idx_conv_facts_key ON public.conv_facts(key);

-- 12) Question catalog + history for micro-surveys
CREATE TABLE IF NOT EXISTS public.question_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  vertical text,
  key text NOT NULL,
  template text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  cooldown_days integer NOT NULL DEFAULT 14,
  required boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_policy_account ON public.question_policy(account_id);
CREATE INDEX IF NOT EXISTS idx_question_policy_vertical ON public.question_policy(vertical);

CREATE TABLE IF NOT EXISTS public.question_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  key text NOT NULL,
  asked_at timestamptz NOT NULL DEFAULT now(),
  answered boolean NOT NULL DEFAULT false,
  answered_at timestamptz,
  last_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_history_lead ON public.question_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_question_history_key ON public.question_history(key);

-- Seed default auto vertical questions if none exist
INSERT INTO public.question_policy (id, account_id, vertical, key, template, priority, cooldown_days, required, active)
SELECT gen_random_uuid(), NULL, 'auto', 'mileage_band',
       'Quick one—about how many miles are on your ride? <25k / 25-50k / 50-75k / 75k+',
       100, 45, false, true
WHERE NOT EXISTS (SELECT 1 FROM public.question_policy WHERE vertical = 'auto' AND key = 'mileage_band');

INSERT INTO public.question_policy (id, account_id, vertical, key, template, priority, cooldown_days, required, active)
SELECT gen_random_uuid(), NULL, 'auto', 'timing_intent',
       'Thinking of upgrading soon or later this year? If soon, I can float options.',
       90, 30, false, true
WHERE NOT EXISTS (SELECT 1 FROM public.question_policy WHERE vertical = 'auto' AND key = 'timing_intent');

INSERT INTO public.question_policy (id, account_id, vertical, key, template, priority, cooldown_days, required, active)
SELECT gen_random_uuid(), NULL, 'auto', 'drivers_in_household',
       'How many drivers regularly use the car at home? 1 / 2 / 3+?',
       80, 60, false, true
WHERE NOT EXISTS (SELECT 1 FROM public.question_policy WHERE vertical = 'auto' AND key = 'drivers_in_household');

-- =====================================================
-- END
-- =====================================================

