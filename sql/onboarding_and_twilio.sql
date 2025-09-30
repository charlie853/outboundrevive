-- Onboarding state (per account)
CREATE TABLE IF NOT EXISTS public.onboarding_state (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id),
  step text NOT NULL DEFAULT 'welcome' CHECK (step IN ('welcome','profile','hours','number','kb','imports','done')),
  business_name text,
  website text,
  timezone text,
  twilio_connected boolean DEFAULT false,
  kb_ingested boolean DEFAULT false,
  crm_connected boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

-- Twilio credentials per account (store secrets securely in production)
CREATE TABLE IF NOT EXISTS public.twilio_accounts (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id),
  twilio_account_sid text,
  twilio_auth_token text,
  messaging_service_sid text,
  webhooks_ok boolean DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

