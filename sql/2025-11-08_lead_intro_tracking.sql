-- Lead intro tracking
-- Adds intro_sent_at to prevent duplicate outreach and speed gating checks

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS intro_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_intro_sent
  ON public.leads (account_id, intro_sent_at)
  WHERE intro_sent_at IS NOT NULL;

-- Optional backfill: if a lead already has an initial outreach logged, stamp intro_sent_at
UPDATE public.leads l
SET intro_sent_at = COALESCE(intro_sent_at, m.created_at)
FROM public.messages_out m
WHERE l.intro_sent_at IS NULL
  AND m.lead_id = l.id
  AND m.intent = 'initial_outreach'
  AND m.created_at IS NOT NULL;


