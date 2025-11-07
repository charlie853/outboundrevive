-- Complete CRM Integration Setup
-- Run this in Supabase SQL Editor to fix all CRM-related database issues
-- SAFE: All changes are additive (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)

-- ============================================================
-- 1. Ensure user_data table has CRM fields (for legacy support)
-- ============================================================
DO $$ 
BEGIN
  -- Add nango_token column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_data' 
    AND column_name = 'nango_token'
  ) THEN
    ALTER TABLE public.user_data ADD COLUMN nango_token TEXT;
  END IF;

  -- Add crm column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_data' 
    AND column_name = 'crm'
  ) THEN
    ALTER TABLE public.user_data ADD COLUMN crm TEXT;
  END IF;
END $$;

-- ============================================================
-- 2. Create crm_connections table (new source of truth)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.crm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'hubspot', 'salesforce', 'zoho-crm', 'gohighlevel', 'pipedrive'
  nango_connection_id TEXT NOT NULL UNIQUE,
  connection_metadata JSONB DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique constraint: one active connection per provider per account
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_connections_active_unique 
  ON public.crm_connections(account_id, provider) 
  WHERE is_active = true;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_crm_connections_account 
  ON public.crm_connections(account_id) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_crm_connections_provider 
  ON public.crm_connections(provider) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_crm_connections_nango_id 
  ON public.crm_connections(nango_connection_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_crm_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_connections_updated_at ON public.crm_connections;
CREATE TRIGGER crm_connections_updated_at
  BEFORE UPDATE ON public.crm_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_connections_updated_at();

-- ============================================================
-- 3. Add CRM metadata columns to leads table
-- ============================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_id TEXT,
  ADD COLUMN IF NOT EXISTS crm_source TEXT,
  ADD COLUMN IF NOT EXISTS company TEXT,
  ADD COLUMN IF NOT EXISTS lead_type TEXT,
  ADD COLUMN IF NOT EXISTS last_crm_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_status TEXT,
  ADD COLUMN IF NOT EXISTS crm_stage TEXT,
  ADD COLUMN IF NOT EXISTS crm_description TEXT,
  ADD COLUMN IF NOT EXISTS crm_last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crm_owner TEXT,
  ADD COLUMN IF NOT EXISTS crm_owner_email TEXT;

-- Create indexes for CRM fields
CREATE INDEX IF NOT EXISTS idx_leads_crm_id 
  ON public.leads(account_id, crm_id) 
  WHERE crm_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_crm_source 
  ON public.leads(account_id, crm_source) 
  WHERE crm_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_company 
  ON public.leads(account_id, company) 
  WHERE company IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_crm_status
  ON public.leads(account_id, crm_status)
  WHERE crm_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_crm_stage
  ON public.leads(account_id, crm_stage)
  WHERE crm_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_crm_last_activity
  ON public.leads(account_id, crm_last_activity_at DESC)
  WHERE crm_last_activity_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_crm_owner_email
  ON public.leads(account_id, crm_owner_email)
  WHERE crm_owner_email IS NOT NULL;

-- Unique constraint for CRM deduplication (one lead per CRM ID + source per account)
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_crm_unique 
  ON public.leads(account_id, crm_source, crm_id) 
  WHERE crm_id IS NOT NULL AND crm_source IS NOT NULL;

-- ============================================================
-- 4. Add comments for documentation
-- ============================================================
COMMENT ON TABLE public.crm_connections IS 'Stores CRM OAuth connections via Nango for each account';
COMMENT ON COLUMN public.crm_connections.nango_connection_id IS 'Unique connection ID from Nango OAuth flow';
COMMENT ON COLUMN public.crm_connections.connection_metadata IS 'Additional connection details (scopes, user info, etc.)';
COMMENT ON COLUMN public.crm_connections.is_active IS 'False when disconnected, allows historical tracking';

COMMENT ON COLUMN public.leads.crm_id IS 'External CRM contact/lead ID for deduplication';
COMMENT ON COLUMN public.leads.crm_source IS 'CRM provider (hubspot, salesforce, etc.)';
COMMENT ON COLUMN public.leads.company IS 'Company name from CRM';
COMMENT ON COLUMN public.leads.lead_type IS 'Lead type classification (new, reactivation, etc.)';
COMMENT ON COLUMN public.leads.last_crm_sync_at IS 'Last time this lead was synced from CRM';
COMMENT ON COLUMN public.leads.crm_status IS 'Latest status string pulled from the connected CRM';
COMMENT ON COLUMN public.leads.crm_stage IS 'Pipeline stage or lifecycle stage from the CRM';
COMMENT ON COLUMN public.leads.crm_description IS 'Free-form notes/description synced from the CRM';
COMMENT ON COLUMN public.leads.crm_last_activity_at IS 'Timestamp of the most recent CRM activity we received';
COMMENT ON COLUMN public.leads.crm_owner IS 'CRM owner name';
COMMENT ON COLUMN public.leads.crm_owner_email IS 'CRM owner email';

-- ============================================================
-- Done! 
-- ============================================================
-- This migration adds:
-- 1. user_data.nango_token and user_data.crm (legacy support)
-- 2. crm_connections table (new source of truth)
-- 3. All CRM metadata fields to leads table
-- 4. Proper indexes and constraints for performance and deduplication

