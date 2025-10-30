-- Feature flags on accounts (non-destructive)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accounts' AND column_name='caps_enabled'
  ) THEN
    ALTER TABLE public.accounts ADD COLUMN caps_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accounts' AND column_name='cadences_enabled'
  ) THEN
    ALTER TABLE public.accounts ADD COLUMN cadences_enabled boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='accounts' AND column_name='new_charts_enabled'
  ) THEN
    ALTER TABLE public.accounts ADD COLUMN new_charts_enabled boolean NOT NULL DEFAULT false;
  END IF;
END $$;


