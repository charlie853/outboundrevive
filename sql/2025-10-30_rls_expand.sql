-- Expand RLS to new tables (cadence, billing, appointments)

ALTER TABLE IF EXISTS public.campaigns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.campaign_cadence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cadence_runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_billing            ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.appointments              ENABLE ROW LEVEL SECURITY;

-- Helper: policies use mapping via user_data (user -> account)
-- Service role bypasses RLS automatically in Supabase.

-- campaigns
CREATE POLICY IF NOT EXISTS campaigns_rls ON public.campaigns
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

-- campaign_cadence_settings
CREATE POLICY IF NOT EXISTS cadence_settings_rls ON public.campaign_cadence_settings
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

-- cadence_runs
CREATE POLICY IF NOT EXISTS cadence_runs_rls ON public.cadence_runs
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

-- tenant_billing (read-only to users; updates via service role only)
CREATE POLICY IF NOT EXISTS tenant_billing_select_rls ON public.tenant_billing
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_data ud
      WHERE ud.user_id = auth.uid() AND ud.account_id = tenant_billing.account_id
    )
  );

-- appointments
CREATE POLICY IF NOT EXISTS appointments_rls ON public.appointments
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


