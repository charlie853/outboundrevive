-- CRM Connections Table
-- Stores Nango OAuth connections per account
-- SAFE: New table, doesn't affect existing code

CREATE TABLE IF NOT EXISTS public.crm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'hubspot', 'salesforce', 'zoho-crm', 'gohighlevel'
  nango_connection_id TEXT NOT NULL UNIQUE,
  connection_metadata JSONB DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure one active connection per provider per account
  UNIQUE(account_id, provider, is_active) WHERE is_active = true
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_crm_connections_account ON public.crm_connections(account_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crm_connections_provider ON public.crm_connections(provider) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_crm_connections_nango_id ON public.crm_connections(nango_connection_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_crm_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER crm_connections_updated_at
  BEFORE UPDATE ON public.crm_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_crm_connections_updated_at();

-- Comments for documentation
COMMENT ON TABLE public.crm_connections IS 'Stores CRM OAuth connections via Nango for each account';
COMMENT ON COLUMN public.crm_connections.nango_connection_id IS 'Unique connection ID from Nango OAuth flow';
COMMENT ON COLUMN public.crm_connections.connection_metadata IS 'Additional connection details (scopes, user info, etc.)';
COMMENT ON COLUMN public.crm_connections.is_active IS 'False when disconnected, allows historical tracking';

