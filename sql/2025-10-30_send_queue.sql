-- Lightweight send queue (ADD-ONLY)

-- Feature flag on accounts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accounts' AND column_name='queue_enabled'
  ) THEN
    ALTER TABLE public.accounts ADD COLUMN queue_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Queue table
CREATE TABLE IF NOT EXISTS public.send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  body text NOT NULL,
  attempt int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','sent','failed','dead_letter')),
  error text,
  dedup_key text,
  run_after timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_send_queue_ready ON public.send_queue(status, run_after);
CREATE INDEX IF NOT EXISTS idx_send_queue_account ON public.send_queue(account_id, status, run_after);

-- touch trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='touch_updated_at') THEN
    CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname='touch_updated_at_send_queue'
  ) THEN
    CREATE TRIGGER touch_updated_at_send_queue BEFORE UPDATE ON public.send_queue
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END $$;

-- RLS
ALTER TABLE public.send_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS send_queue_rls ON public.send_queue
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = send_queue.account_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_data ud WHERE ud.user_id = auth.uid() AND ud.account_id = send_queue.account_id)
  );


