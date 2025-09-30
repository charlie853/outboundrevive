-- Add outbound pause flag to accounts (idempotent)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS outbound_paused boolean NOT NULL DEFAULT false;

