-- Prompt versions table for per-tenant prompt editor
CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  version INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, version)
);

CREATE INDEX IF NOT EXISTS idx_prompt_versions_account_active ON public.prompt_versions(account_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prompt_versions_account_version ON public.prompt_versions(account_id, version DESC);

-- Add owner columns to leads if not exists
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS crm_owner TEXT,
  ADD COLUMN IF NOT EXISTS crm_owner_email TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_crm_owner ON public.leads(account_id, crm_owner) WHERE crm_owner IS NOT NULL;

-- RLS for prompt_versions
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own prompt versions" ON public.prompt_versions
  FOR SELECT USING (account_id IN (SELECT account_id FROM public.user_data WHERE user_id = auth.uid()));

CREATE POLICY "Service role can manage prompt versions" ON public.prompt_versions
  FOR ALL USING (auth.role() = 'service_role');

