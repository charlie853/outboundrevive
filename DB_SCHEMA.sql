-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.accounts (
  id uuid NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT now(),
  outbound_paused boolean NOT NULL DEFAULT false,
  CONSTRAINT accounts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.deliverability_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id uuid,
  lead_id uuid,
  type text NOT NULL,
  meta_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  account_id uuid,
  CONSTRAINT deliverability_events_pkey PRIMARY KEY (id),
  CONSTRAINT deliverability_events_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  status text DEFAULT 'pending'::text,
  sent_at timestamp with time zone,
  replied boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  last_message_sid text,
  delivery_status text,
  error_code text,
  last_reply_at timestamp with time zone,
  last_reply_body text,
  intent text,
  opted_out boolean DEFAULT false,
  email text,
  step text CHECK (step = ANY (ARRAY['OPENER'::text, 'NUDGE'::text, 'RESLOT'::text])),
  last_step_at timestamp with time zone,
  booked boolean DEFAULT false,
  kept boolean DEFAULT false,
  last_sent_at timestamp with time zone,
  last_footer_at timestamp with time zone,
  appointment_set_at timestamp with time zone,
  account_id uuid NOT NULL DEFAULT '11111111-1111-1111-1111-111111111111'::uuid,
  tz text,
  last_inbound_at timestamp with time zone,
  CONSTRAINT leads_pkey PRIMARY KEY (id)
);
CREATE TABLE public.messages_in (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  body text NOT NULL,
  provider_sid text,
  provider_from text,
  provider_to text,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  account_id uuid,
  agent_processed_at timestamp with time zone,
  CONSTRAINT messages_in_pkey PRIMARY KEY (id),
  CONSTRAINT messages_in_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT messages_in_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.messages_out (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  sid text,
  body text NOT NULL,
  status text,
  error_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  dedup_key text,
  blueprint_version_id uuid,
  intent text,
  ai_source text CHECK (ai_source = ANY (ARRAY['template'::text, 'llm'::text, 'fallback'::text])),
  prompt_template_id uuid,
  used_snippets jsonb,
  provider_status text DEFAULT 'queued'::text CHECK (provider_status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text])),
  provider_error_code text,
  queued_at timestamp with time zone,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  failed_at timestamp with time zone,
  gate_log jsonb,
  cost_micro_usd bigint,
  account_id uuid,
  sent_by text DEFAULT 'ai'::text CHECK (sent_by = ANY (ARRAY['ai'::text, 'operator'::text])),
  operator_id text,
  parent_in_id uuid,
  CONSTRAINT messages_out_pkey PRIMARY KEY (id),
  CONSTRAINT messages_out_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT messages_out_parent_in_id_fkey FOREIGN KEY (parent_in_id) REFERENCES public.messages_in(id)
);
CREATE TABLE public.onboarding_state (
  account_id uuid NOT NULL,
  step text NOT NULL DEFAULT 'welcome'::text CHECK (step = ANY (ARRAY['welcome'::text, 'profile'::text, 'hours'::text, 'number'::text, 'kb'::text, 'imports'::text, 'done'::text])),
  business_name text,
  website text,
  timezone text,
  twilio_connected boolean NOT NULL DEFAULT false,
  kb_ingested boolean NOT NULL DEFAULT false,
  crm_connected boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_state_pkey PRIMARY KEY (account_id),
  CONSTRAINT onboarding_state_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.site_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT site_contacts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.site_waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  source text,
  ip inet,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT site_waitlist_pkey PRIMARY KEY (id)
);
CREATE TABLE public.twilio_accounts (
  account_id uuid NOT NULL,
  twilio_account_sid text NOT NULL,
  twilio_auth_token text NOT NULL,
  messaging_service_sid text,
  webhooks_ok boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT twilio_accounts_pkey PRIMARY KEY (account_id),
  CONSTRAINT twilio_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.user_accounts (
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  role text DEFAULT 'owner'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_accounts_pkey PRIMARY KEY (account_id, user_id),
  CONSTRAINT user_accounts_user_id_fkey1 FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_accounts_account_id_fkey1 FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.user_data (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  user_id uuid NOT NULL UNIQUE,
  nango_token text,
  crm text,
  CONSTRAINT user_data_pkey PRIMARY KEY (id),
  CONSTRAINT user_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);