-- Threads Reliability and Performance Indexes
-- These indexes improve query performance for the threads view and ensure no missing messages

-- Index for messages_in queries by lead_id with ordering
CREATE INDEX IF NOT EXISTS idx_messages_in_lead_created 
ON public.messages_in (lead_id, created_at ASC, id ASC);

-- Index for messages_out queries by lead_id with ordering
CREATE INDEX IF NOT EXISTS idx_messages_out_lead_created 
ON public.messages_out (lead_id, created_at ASC, id ASC);

-- Index for leads lookup by phone (E.164 normalized)
CREATE INDEX IF NOT EXISTS idx_leads_phone 
ON public.leads (phone);

-- Index for leads by account_id and phone (webhook lookups)
CREATE INDEX IF NOT EXISTS idx_leads_account_phone 
ON public.leads (account_id, phone);

-- Index for footer gating queries
CREATE INDEX IF NOT EXISTS idx_leads_last_footer_at 
ON public.leads (id, last_footer_at) 
WHERE last_footer_at IS NOT NULL;

-- Index for intro gating - checking recent outbound messages
CREATE INDEX IF NOT EXISTS idx_messages_out_lead_created_desc 
ON public.messages_out (lead_id, created_at DESC) 
WHERE sent_by = 'ai';

-- Comments explaining the indexes
COMMENT ON INDEX idx_messages_in_lead_created IS 'Speeds up threads view by querying inbound messages for a lead in chronological order';
COMMENT ON INDEX idx_messages_out_lead_created IS 'Speeds up threads view by querying outbound messages for a lead in chronological order';
COMMENT ON INDEX idx_leads_phone IS 'Optimizes phone number lookups for webhook processing';
COMMENT ON INDEX idx_leads_account_phone IS 'Composite index for account-scoped phone lookups';
COMMENT ON INDEX idx_leads_last_footer_at IS 'Partial index for footer gating - only indexes leads that have sent a footer';
COMMENT ON INDEX idx_messages_out_lead_created_desc IS 'Partial index for intro gating - checking if we recently introduced ourselves';

