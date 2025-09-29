-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.Test (
  Charlie Test Client bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  owner_user_id smallint NOT NULL,
  name text,
  campaign_enabled jsonb,
  CONSTRAINT Test_pkey PRIMARY KEY (Charlie Test Client)
);
CREATE TABLE public.account_blueprints (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  vertical text,
  status text DEFAULT 'draft'::text,
  goals_json jsonb DEFAULT '{}'::jsonb,
  constraints_json jsonb DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  notes text,
  CONSTRAINT account_blueprints_pkey PRIMARY KEY (id)
);
CREATE TABLE public.account_followup_prefs (
  account_id uuid NOT NULL,
  freq_max_per_day integer NOT NULL DEFAULT 2,
  freq_max_per_week integer NOT NULL DEFAULT 10,
  quiet_start text NOT NULL DEFAULT '09:00'::text,
  quiet_end text NOT NULL DEFAULT '21:00'::text,
  timezone text NOT NULL DEFAULT 'America/New_York'::text,
  min_gap_minutes integer NOT NULL DEFAULT 360,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT account_followup_prefs_pkey PRIMARY KEY (account_id)
);
CREATE TABLE public.account_kb_articles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  tags ARRAY NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_url text,
  CONSTRAINT account_kb_articles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.accounts (
  id uuid NOT NULL,
  name text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT accounts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_followup_cursor (
  account_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  attempt integer NOT NULL DEFAULT 0,
  cadence ARRAY NOT NULL DEFAULT '{3,7,14}'::integer[],
  max_attempts integer NOT NULL DEFAULT 5,
  next_at timestamp with time zone,
  last_out_at timestamp with time zone,
  last_in_at timestamp with time zone,
  operator_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_followup_cursor_pkey PRIMARY KEY (lead_id)
);
CREATE TABLE public.ai_followup_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  attempt integer NOT NULL,
  planned_at timestamp with time zone NOT NULL,
  sent_sid text,
  status text NOT NULL,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_followup_log_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_settings (
  id text NOT NULL DEFAULT 'default'::text,
  timezone text NOT NULL DEFAULT 'America/New_York'::text,
  quiet_start text NOT NULL DEFAULT '09:00'::text,
  quiet_end text NOT NULL DEFAULT '19:00'::text,
  daily_cap integer NOT NULL DEFAULT 200,
  brand text DEFAULT 'OutboundRevive'::text,
  booking_link text DEFAULT ''::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  template_opener text DEFAULT 'Hi {{name}}—{{brand}} here re your earlier inquiry. We can hold 2 options. Reply YES to book. Txt STOP to opt out'::text,
  template_nudge text DEFAULT '{{brand}}: still want to book a quick chat? We can hold 2 options. Reply A/B or send a time. Txt STOP to opt out'::text,
  template_reslot text DEFAULT '{{brand}}: no problem. Early next week or later this week? Reply with a window. Txt STOP to opt out'::text,
  autopilot_enabled boolean NOT NULL DEFAULT false,
  kill_switch boolean NOT NULL DEFAULT false,
  consent_attested boolean DEFAULT false,
  templates jsonb DEFAULT '{}'::jsonb,
  managed_mode boolean NOT NULL DEFAULT true,
  active_blueprint_version_id uuid,
  sms_channel_status text DEFAULT 'unverified'::text,
  paused boolean DEFAULT false,
  blackout_dates jsonb DEFAULT '[]'::jsonb,
  auto_throttle boolean DEFAULT false,
  error_threshold integer DEFAULT 5,
  error_window_min integer DEFAULT 15,
  account_id uuid,
  CONSTRAINT app_settings_pkey PRIMARY KEY (id),
  CONSTRAINT app_settings_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.appointments (
  id bigint NOT NULL DEFAULT nextval('appointments_id_seq'::regclass),
  client_id uuid,
  phone text,
  contact_external_id text,
  booked_at timestamp with time zone,
  kept boolean DEFAULT false,
  notes text,
  lead_id uuid,
  account_id uuid,
  CONSTRAINT appointments_pkey PRIMARY KEY (id),
  CONSTRAINT appointments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT appointments_lead_fk FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT appointments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.attempts (
  id bigint NOT NULL DEFAULT nextval('attempts_id_seq'::regclass),
  client_id uuid,
  contact_external_id text,
  phone text,
  step text,
  body text,
  provider_sid text,
  status text,
  booked boolean DEFAULT false,
  kept boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  account_id uuid,
  CONSTRAINT attempts_pkey PRIMARY KEY (id),
  CONSTRAINT attempts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT attempts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.blueprint_sections (
  account_blueprint_id uuid,
  key text,
  data_json jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT blueprint_sections_account_blueprint_id_fkey FOREIGN KEY (account_blueprint_id) REFERENCES public.account_blueprints(id)
);
CREATE TABLE public.blueprint_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_blueprint_id uuid,
  version integer NOT NULL,
  notes text,
  published_at timestamp with time zone,
  CONSTRAINT blueprint_versions_pkey PRIMARY KEY (id),
  CONSTRAINT blueprint_versions_account_blueprint_id_fkey FOREIGN KEY (account_blueprint_id) REFERENCES public.account_blueprints(id)
);
CREATE TABLE public.campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT campaigns_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.change_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  submitted_by text,
  payload_json jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open'::text CHECK (status = ANY (ARRAY['open'::text, 'approved'::text, 'rejected'::text, 'applied'::text])),
  note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  CONSTRAINT change_requests_pkey PRIMARY KEY (id)
);
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  name text,
  messaging_service_sid text,
  nango_connection_id text,
  campaign_enabled boolean DEFAULT false,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  account_id uuid NOT NULL,
  CONSTRAINT clients_pkey PRIMARY KEY (id),
  CONSTRAINT clients_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.consent_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid,
  phone text NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['sms_marketing_granted'::text, 'revoked'::text, 'help'::text])),
  source text NOT NULL DEFAULT 'inbound_sms'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  account_id uuid,
  CONSTRAINT consent_events_pkey PRIMARY KEY (id),
  CONSTRAINT consent_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id)
);
CREATE TABLE public.crm_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  nango_connection_id text NOT NULL,
  crm_contact_id text NOT NULL,
  crm_provider text NOT NULL,
  external_data jsonb,
  last_synced_at timestamp with time zone,
  sync_status text DEFAULT 'pending'::text,
  sync_error text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  account_id uuid,
  CONSTRAINT crm_contacts_pkey PRIMARY KEY (id),
  CONSTRAINT crm_contacts_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT crm_contacts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
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
CREATE TABLE public.delivery_blocks (
  phone text NOT NULL,
  reason text,
  error_code text,
  until timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT delivery_blocks_pkey PRIMARY KEY (phone)
);
CREATE TABLE public.global_suppressions (
  phone text NOT NULL,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT global_suppressions_pkey PRIMARY KEY (phone)
);
CREATE TABLE public.knowledge_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  source_id uuid,
  url text,
  title text,
  content text,
  status text NOT NULL DEFAULT 'approved'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'hidden'::text])),
  checksum text,
  tokens integer,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  content_tsv tsvector DEFAULT to_tsvector('english'::regconfig, ((COALESCE(title, ''::text) || ' '::text) || COALESCE(content, ''::text))),
  CONSTRAINT knowledge_pages_pkey PRIMARY KEY (id),
  CONSTRAINT knowledge_pages_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.knowledge_sources(id)
);
CREATE TABLE public.knowledge_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'text'::text CHECK (type = ANY (ARRAY['url'::text, 'pdf'::text, 'text'::text])),
  url text,
  title text,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_sources_pkey PRIMARY KEY (id)
);
CREATE TABLE public.lead_assignments (
  lead_id uuid NOT NULL,
  operator_id text NOT NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  account_id uuid,
  CONSTRAINT lead_assignments_pkey PRIMARY KEY (lead_id),
  CONSTRAINT lead_assignments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT lead_assignments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
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
  CONSTRAINT messages_out_pkey PRIMARY KEY (id),
  CONSTRAINT messages_out_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id)
);
CREATE TABLE public.opt_outs (
  client_id uuid NOT NULL,
  phone text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT opt_outs_pkey PRIMARY KEY (client_id, phone),
  CONSTRAINT opt_outs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.outbound_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  sid text UNIQUE,
  body text NOT NULL,
  status text,
  error_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  account_id uuid,
  CONSTRAINT outbound_messages_pkey PRIMARY KEY (id),
  CONSTRAINT outbound_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT outbound_messages_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.prompt_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  blueprint_version_id uuid NOT NULL,
  intent text NOT NULL CHECK (intent = ANY (ARRAY['price'::text, 'schedule'::text, 'already_bought'::text, 'competitor'::text, 'timing'::text, 'faq'::text, 'fallback'::text])),
  body text NOT NULL,
  max_len integer NOT NULL DEFAULT 160,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT prompt_templates_pkey PRIMARY KEY (id),
  CONSTRAINT prompt_templates_blueprint_version_id_fkey FOREIGN KEY (blueprint_version_id) REFERENCES public.blueprint_versions(id)
);
CREATE TABLE public.rate_limits (
  rl_key text NOT NULL,
  window_start timestamp with time zone NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rate_limits_pkey PRIMARY KEY (window_start, rl_key)
);
CREATE TABLE public.replies (
  id bigint NOT NULL DEFAULT nextval('replies_id_seq'::regclass),
  client_id uuid,
  contact_external_id text,
  phone text,
  body text,
  intent text,
  created_at timestamp with time zone DEFAULT now(),
  message_sid text,
  lead_id uuid,
  account_id uuid,
  CONSTRAINT replies_pkey PRIMARY KEY (id),
  CONSTRAINT replies_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT replies_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id),
  CONSTRAINT replies_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  body text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  account_id uuid NOT NULL,
  CONSTRAINT templates_pkey PRIMARY KEY (id),
  CONSTRAINT templates_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.user_accounts (
  user_id uuid NOT NULL,
  account_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_accounts_pkey PRIMARY KEY (account_id, user_id),
  CONSTRAINT user_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT user_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id)
);
CREATE TABLE public.webhook_events (
  id text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT webhook_events_pkey PRIMARY KEY (id)
);