-- =====================================================
-- FIX: Add missing unique constraint to appointments table
-- =====================================================
-- This constraint allows webhooks to be idempotent (can be received multiple times)
-- and prevents duplicate appointments from being created

-- Add the unique constraint that was missing
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_provider_event_unique 
  ON public.appointments(provider, provider_event_id);

-- Verify it was created
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'appointments'
  AND indexname = 'idx_appointments_provider_event_unique';

