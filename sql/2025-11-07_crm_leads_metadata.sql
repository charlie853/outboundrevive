-- CRM Lead Metadata Enhancements
-- Purpose: capture owner, stage/status, notes, and activity timestamps imported from CRMs
-- SAFE: additive changes only; all new columns are nullable and default to NULL

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_status TEXT,
  ADD COLUMN IF NOT EXISTS crm_stage TEXT,
  ADD COLUMN IF NOT EXISTS crm_description TEXT,
  ADD COLUMN IF NOT EXISTS crm_last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_owner TEXT,
  ADD COLUMN IF NOT EXISTS crm_owner_email TEXT;

-- Helpful indexes for filtering/sorting within tenant scope
CREATE INDEX IF NOT EXISTS idx_leads_crm_status
  ON public.leads (account_id, crm_status)
  WHERE crm_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_crm_stage
  ON public.leads (account_id, crm_stage)
  WHERE crm_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_crm_last_activity
  ON public.leads (account_id, crm_last_activity_at DESC)
  WHERE crm_last_activity_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_crm_owner_email
  ON public.leads (account_id, crm_owner_email)
  WHERE crm_owner_email IS NOT NULL;

COMMENT ON COLUMN public.leads.crm_status IS 'Latest status string pulled from the connected CRM';
COMMENT ON COLUMN public.leads.crm_stage IS 'Pipeline stage or lifecycle stage from the CRM';
COMMENT ON COLUMN public.leads.crm_description IS 'Free-form notes/description synced from the CRM';
COMMENT ON COLUMN public.leads.crm_last_activity_at IS 'Timestamp of the most recent CRM activity we received';


