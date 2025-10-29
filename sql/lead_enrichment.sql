-- Lead Enrichment Schema Migration
-- Adds CRM metadata and classification fields to leads table
-- SAFE: All columns nullable with defaults, won't break existing queries

-- Add enrichment columns to leads table
ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS lead_type TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS crm_id TEXT,
  ADD COLUMN IF NOT EXISTS crm_source TEXT,
  ADD COLUMN IF NOT EXISTS crm_url TEXT,
  ADD COLUMN IF NOT EXISTS last_crm_sync_at TIMESTAMPTZ;

-- Add check constraint for lead_type (optional but helps data quality)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_lead_type_check'
  ) THEN
    ALTER TABLE public.leads 
      ADD CONSTRAINT leads_lead_type_check 
      CHECK (lead_type IS NULL OR lead_type IN ('new', 'old'));
  END IF;
END $$;

-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_lead_type ON public.leads(lead_type) WHERE lead_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company ON public.leads(company) WHERE company IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_crm_id ON public.leads(crm_id, crm_source) WHERE crm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_last_crm_sync ON public.leads(last_crm_sync_at DESC) WHERE last_crm_sync_at IS NOT NULL;

-- Add unique constraint on crm_id + crm_source (prevent duplicate imports)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_crm_unique 
  ON public.leads(account_id, crm_source, crm_id) 
  WHERE crm_id IS NOT NULL AND crm_source IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.leads.lead_type IS 'Classification: "new" (never contacted, cold) or "old" (warm, existing relationship)';
COMMENT ON COLUMN public.leads.company IS 'Company/business name from CRM or enrichment';
COMMENT ON COLUMN public.leads.role IS 'Job title or role from CRM';
COMMENT ON COLUMN public.leads.crm_id IS 'Original contact ID in source CRM';
COMMENT ON COLUMN public.leads.crm_source IS 'Source CRM provider (hubspot, salesforce, gohighlevel, etc)';
COMMENT ON COLUMN public.leads.crm_url IS 'Direct link to contact record in CRM';
COMMENT ON COLUMN public.leads.last_crm_sync_at IS 'Last time this lead was synced from CRM';

-- Migration summary
DO $$
BEGIN
  RAISE NOTICE 'Lead enrichment migration complete:';
  RAISE NOTICE '  - Added 7 new columns (all nullable)';
  RAISE NOTICE '  - Added 4 performance indexes';
  RAISE NOTICE '  - Added unique constraint on crm_id + crm_source';
  RAISE NOTICE '  - Existing data unaffected';
END $$;

