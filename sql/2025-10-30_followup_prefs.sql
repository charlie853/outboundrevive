-- Per-tenant follow-up preferences (UI-facing)

CREATE TABLE IF NOT EXISTS public.account_followup_prefs (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  freq_max_per_day int NOT NULL DEFAULT 20,
  freq_max_per_week int NOT NULL DEFAULT 100,
  min_gap_minutes int NOT NULL DEFAULT 10,
  quiet_start text NOT NULL DEFAULT '06:00',
  quiet_end text NOT NULL DEFAULT '22:00',
  timezone text NOT NULL DEFAULT 'America/New_York',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_followup_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS followup_prefs_rls ON public.account_followup_prefs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_data ud
      WHERE ud.user_id = auth.uid() AND ud.account_id = account_followup_prefs.account_id
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_data ud
      WHERE ud.user_id = auth.uid() AND ud.account_id = account_followup_prefs.account_id
    )
  );


