-- Expand RLS to new tables (cadence, billing, appointments)
-- Safe migration: only applies to tables that exist

-- Helper: policies use mapping via user_data (user -> account)
-- Service role bypasses RLS automatically in Supabase.

-- campaigns (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaigns') THEN
    ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS campaigns_rls ON public.campaigns;
    CREATE POLICY campaigns_rls ON public.campaigns
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.user_data ud
          WHERE ud.user_id = auth.uid() AND ud.account_id = campaigns.account_id
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_data ud
          WHERE ud.user_id = auth.uid() AND ud.account_id = campaigns.account_id
        )
      );
  END IF;
END $$;

-- campaign_cadence_settings (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaign_cadence_settings') THEN
    ALTER TABLE public.campaign_cadence_settings ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS cadence_settings_rls ON public.campaign_cadence_settings;
    CREATE POLICY cadence_settings_rls ON public.campaign_cadence_settings
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.user_data ud
          WHERE ud.user_id = auth.uid() AND ud.account_id = campaign_cadence_settings.account_id
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_data ud
          WHERE ud.user_id = auth.uid() AND ud.account_id = campaign_cadence_settings.account_id
        )
      );
  END IF;
END $$;

-- cadence_runs (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='cadence_runs') THEN
    ALTER TABLE public.cadence_runs ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS cadence_runs_rls ON public.cadence_runs;
    CREATE POLICY cadence_runs_rls ON public.cadence_runs
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.user_data ud
          WHERE ud.user_id = auth.uid() AND ud.account_id = cadence_runs.account_id
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_data ud
          WHERE ud.user_id = auth.uid() AND ud.account_id = cadence_runs.account_id
        )
      );
  END IF;
END $$;

-- tenant_billing (read-only to users; updates via service role only) (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenant_billing') THEN
    ALTER TABLE public.tenant_billing ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_billing_select_rls ON public.tenant_billing;
    CREATE POLICY tenant_billing_select_rls ON public.tenant_billing
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM public.user_data ud
          WHERE ud.user_id = auth.uid() AND ud.account_id = tenant_billing.account_id
        )
      );
  END IF;
END $$;

-- appointments (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointments') THEN
    ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS appointments_rls ON public.appointments;
    CREATE POLICY appointments_rls ON public.appointments
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.user_data ud
          WHERE ud.user_id = auth.uid() AND ud.account_id = appointments.account_id
        )
      ) WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_data ud
          WHERE ud.user_id = auth.uid() AND ud.account_id = appointments.account_id
        )
      );
  END IF;
END $$;

