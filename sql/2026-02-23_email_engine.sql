-- OutboundRevive Email Engine — core schema
-- Run after existing migrations. All tables scoped by account_id.

-- Domains: sending domain + DNS state
CREATE TABLE IF NOT EXISTS public.email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  domain text NOT NULL,
  dns_status jsonb DEFAULT '{}',  -- { spf: ok|pending|fail, dkim: ..., dmarc: ... }
  tracking_domain text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_email_domains_account ON public.email_domains(account_id);

-- Sending inboxes: Gmail / Microsoft / SMTP
CREATE TABLE IF NOT EXISTS public.email_sending_inboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.email_domains(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('gmail','microsoft','smtp')),
  email_address text NOT NULL,
  credentials_ref text,  -- env key name or encrypted ref; never store raw secrets
  warmup_status jsonb DEFAULT '{}',  -- { status, recommended_daily_limit, provider_job_id }
  daily_limit int NOT NULL DEFAULT 50,
  health_score numeric(5,2),  -- 0-100
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_sending_inboxes_account ON public.email_sending_inboxes(account_id);
CREATE INDEX IF NOT EXISTS idx_email_sending_inboxes_domain ON public.email_sending_inboxes(domain_id);

-- Suppression: global (account_id NULL) or per-account
CREATE TABLE IF NOT EXISTS public.email_suppression (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,  -- NULL = global
  email text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('unsub','bounce','complaint')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_suppression_lookup ON public.email_suppression(
  COALESCE(account_id::text, 'global'), lower(trim(email)), reason
);
CREATE INDEX IF NOT EXISTS idx_email_suppression_email ON public.email_suppression(lower(email));
CREATE INDEX IF NOT EXISTS idx_email_suppression_account ON public.email_suppression(account_id);

-- Campaigns
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','completed')),
  settings jsonb DEFAULT '{}',  -- max_new_per_day, time_windows, sending_inbox_ids, etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_account ON public.email_campaigns(account_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON public.email_campaigns(account_id, status);

-- Campaign steps
CREATE TABLE IF NOT EXISTS public.email_campaign_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  delay_days int NOT NULL DEFAULT 0,
  delay_time_window text,  -- e.g. "09:00-17:00" for send window
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_campaign_steps_campaign ON public.email_campaign_steps(campaign_id);

-- Subsequence rules: label or keyword -> action
CREATE TABLE IF NOT EXISTS public.email_subsequence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('label','keyword')),
  trigger_value text NOT NULL,  -- label name or regex/keywords
  target_flow text NOT NULL,   -- 'stop' | uuid of alternate campaign
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_subsequence_rules_campaign ON public.email_subsequence_rules(campaign_id);

-- Threads: one per lead+campaign+inbox conversation
CREATE TABLE IF NOT EXISTS public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sending_inbox_id uuid NOT NULL REFERENCES public.email_sending_inboxes(id) ON DELETE CASCADE,
  provider_thread_id text,
  subject text,
  labels jsonb DEFAULT '[]',   -- ['interested','meeting_booked']
  assignee_id text,            -- user id or email for Unibox assignment
  assigned_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_threads_account ON public.email_threads(account_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_campaign ON public.email_threads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_lead ON public.email_threads(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_last_message ON public.email_threads(account_id, last_message_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_threads_dedup ON public.email_threads(campaign_id, lead_id, sending_inbox_id);

-- Messages: sent and received
CREATE TABLE IF NOT EXISTS public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('out','in')),
  provider_message_id text,
  subject text,
  body_plain text,
  body_html text,
  sent_at timestamptz,
  opened_at timestamptz,
  event_log jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON public.email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_provider ON public.email_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Send queue (same pattern as send_queue)
CREATE TABLE IF NOT EXISTS public.email_send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES public.email_campaign_steps(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  sending_inbox_id uuid NOT NULL REFERENCES public.email_sending_inboxes(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed','dead_letter')),
  run_after timestamptz NOT NULL DEFAULT now(),
  attempt int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  locked_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_send_queue_ready ON public.email_send_queue(status, run_after);
CREATE INDEX IF NOT EXISTS idx_email_send_queue_account ON public.email_send_queue(account_id, status, run_after);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_queue_dedup ON public.email_send_queue(lead_id, step_id) WHERE status IN ('queued','processing');

-- Event log: sent, opened, replied, bounced, unsubscribed, label_changed, subsequence_triggered
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('sent','opened','replied','bounced','unsubscribed','label_changed','subsequence_triggered')),
  meta jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_events_account ON public.email_events(account_id);
CREATE INDEX IF NOT EXISTS idx_email_events_campaign ON public.email_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_created ON public.email_events(account_id, created_at DESC);

-- Touch trigger for updated_at (use $fn$ to avoid nested $$ conflict)
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END $fn$;

DROP TRIGGER IF EXISTS touch_email_domains ON public.email_domains;
CREATE TRIGGER touch_email_domains BEFORE UPDATE ON public.email_domains
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_email_sending_inboxes ON public.email_sending_inboxes;
CREATE TRIGGER touch_email_sending_inboxes BEFORE UPDATE ON public.email_sending_inboxes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_email_campaigns ON public.email_campaigns;
CREATE TRIGGER touch_email_campaigns BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_email_campaign_steps ON public.email_campaign_steps;
CREATE TRIGGER touch_email_campaign_steps BEFORE UPDATE ON public.email_campaign_steps
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_email_threads ON public.email_threads;
CREATE TRIGGER touch_email_threads BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_email_send_queue ON public.email_send_queue;
CREATE TRIGGER touch_email_send_queue BEFORE UPDATE ON public.email_send_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- RLS
ALTER TABLE public.email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sending_inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppression ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_subsequence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_domains_rls ON public.email_domains
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_domains.account_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_domains.account_id));

CREATE POLICY email_sending_inboxes_rls ON public.email_sending_inboxes
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_sending_inboxes.account_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_sending_inboxes.account_id));

CREATE POLICY email_suppression_rls ON public.email_suppression
  FOR ALL USING (
    account_id IS NULL
    OR EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_suppression.account_id)
  )
  WITH CHECK (
    account_id IS NULL
    OR EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_suppression.account_id)
  );

CREATE POLICY email_campaigns_rls ON public.email_campaigns
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_campaigns.account_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_campaigns.account_id));

CREATE POLICY email_campaign_steps_rls ON public.email_campaign_steps
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    JOIN public.user_data ud ON ud.account_id = c.account_id AND ud.user_id = auth.uid()
    WHERE c.id = email_campaign_steps.campaign_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    JOIN public.user_data ud ON ud.account_id = c.account_id AND ud.user_id = auth.uid()
    WHERE c.id = email_campaign_steps.campaign_id
  ));

CREATE POLICY email_subsequence_rules_rls ON public.email_subsequence_rules
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    JOIN public.user_data ud ON ud.account_id = c.account_id AND ud.user_id = auth.uid()
    WHERE c.id = email_subsequence_rules.campaign_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.email_campaigns c
    JOIN public.user_data ud ON ud.account_id = c.account_id AND ud.user_id = auth.uid()
    WHERE c.id = email_subsequence_rules.campaign_id
  ));

CREATE POLICY email_threads_rls ON public.email_threads
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_threads.account_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_threads.account_id));

CREATE POLICY email_messages_rls ON public.email_messages
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.email_threads t
    JOIN public.user_data ud ON ud.account_id = t.account_id AND ud.user_id = auth.uid()
    WHERE t.id = email_messages.thread_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.email_threads t
    JOIN public.user_data ud ON ud.account_id = t.account_id AND ud.user_id = auth.uid()
    WHERE t.id = email_messages.thread_id
  ));

CREATE POLICY email_send_queue_rls ON public.email_send_queue
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_send_queue.account_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_send_queue.account_id));

CREATE POLICY email_events_rls ON public.email_events
  FOR ALL USING (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_events.account_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = email_events.account_id));
