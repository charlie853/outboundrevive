-- Schema tweaks for agent pipeline
ALTER TABLE public.messages_in  ADD COLUMN IF NOT EXISTS agent_processed_at timestamptz;
ALTER TABLE public.messages_out ADD COLUMN IF NOT EXISTS parent_in_id uuid REFERENCES public.messages_in(id);

-- Enable RLS on core tables
ALTER TABLE public.leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_in      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages_out     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_kb_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_embeddings    ENABLE ROW LEVEL SECURITY;

-- user_accounts(user_id uuid, account_id uuid) must exist

CREATE POLICY leads_rls ON public.leads
  USING (EXISTS (SELECT 1 FROM user_accounts ua WHERE ua.user_id = auth.uid() AND ua.account_id = leads.account_id));

CREATE POLICY msgs_in_rls ON public.messages_in
  USING (EXISTS (
    SELECT 1 FROM leads l JOIN user_accounts ua ON ua.account_id = l.account_id
    WHERE l.id = messages_in.lead_id AND ua.user_id = auth.uid()
  ));

CREATE POLICY msgs_out_rls ON public.messages_out
  USING (EXISTS (
    SELECT 1 FROM leads l JOIN user_accounts ua ON ua.account_id = l.account_id
    WHERE l.id = messages_out.lead_id AND ua.user_id = auth.uid()
  ));

CREATE POLICY appts_rls ON public.appointments
  USING (EXISTS (
    SELECT 1 FROM leads l JOIN user_accounts ua ON ua.account_id = l.account_id
    WHERE l.id = appointments.lead_id AND ua.user_id = auth.uid()
  ));

CREATE POLICY kb_articles_rls ON public.account_kb_articles
  USING (EXISTS (SELECT 1 FROM user_accounts ua WHERE ua.user_id = auth.uid() AND ua.account_id = account_kb_articles.account_id));

CREATE POLICY kb_embeddings_rls ON public.kb_embeddings
  USING (EXISTS (SELECT 1 FROM user_accounts ua WHERE ua.user_id = auth.uid() AND ua.account_id = kb_embeddings.account_id));

