-- AI Follow-up System Enhancement
-- Creates missing tables and adds configurable cadence logic
-- SAFE: All CREATE IF NOT EXISTS, won't break existing data

-- AI Follow-up Cursor (tracks per-lead follow-up state)
CREATE TABLE IF NOT EXISTS public.ai_followup_cursor (
  lead_id UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'processing', 'done', 'cancelled')),
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 42, -- default: 42 follow-ups (2/day * 21 days)
  cadence JSONB NOT NULL DEFAULT '[12,24,36,48,60,72,84,96,108,120,132,144,156,168,180,192,204,216,228,240,252,264,276,288,300,312,324,336,348,360,372,384,396,408,420,432,444,456,468,480,492,504]'::jsonb, -- hours between follow-ups: 12h intervals for 2/day
  last_out_at TIMESTAMPTZ,
  next_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_followup_cursor_account ON public.ai_followup_cursor(account_id);
CREATE INDEX IF NOT EXISTS idx_ai_followup_cursor_next_at ON public.ai_followup_cursor(status, next_at) WHERE status = 'active';

-- AI Follow-up Log (historical tracking)
CREATE TABLE IF NOT EXISTS public.ai_followup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  attempt INT NOT NULL,
  planned_at TIMESTAMPTZ NOT NULL,
  sent_sid TEXT,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_followup_log_lead ON public.ai_followup_log(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_followup_log_account ON public.ai_followup_log(account_id, created_at DESC);

-- Account Follow-up Settings (per-tenant config)
CREATE TABLE IF NOT EXISTS public.account_followup_settings (
  account_id UUID PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Timing
  conversation_died_hours INT NOT NULL DEFAULT 48, -- conversation "died" after X hours of silence
  max_followups INT NOT NULL DEFAULT 42, -- total follow-ups before giving up (2/day * 21 days = 42)
  cadence_hours JSONB NOT NULL DEFAULT '[12,24,36,48,60,72,84,96,108,120,132,144,156,168,180,192,204,216,228,240,252,264,276,288,300,312,324,336,348,360,372,384,396,408,420,432,444,456,468,480,492,504]'::jsonb, -- 2 per day for 21 days, in hours
  
  -- Sending windows (best times for replies - local time hours)
  preferred_send_times JSONB NOT NULL DEFAULT '[{"hour": 10, "minute": 30}, {"hour": 15, "minute": 30}]'::jsonb, -- 10:30am and 3:30pm local
  
  -- Per-lead caps
  max_per_day_normal INT NOT NULL DEFAULT 2, -- normal states: max 2/day
  max_per_day_strict INT NOT NULL DEFAULT 3, -- FL/OK: max 3/day total (including all outbound)
  
  -- Compliance
  respect_quiet_hours BOOLEAN NOT NULL DEFAULT true,
  quiet_hours_start INT NOT NULL DEFAULT 8, -- 8am local
  quiet_hours_end INT NOT NULL DEFAULT 21, -- 9pm local
  quiet_hours_start_strict INT NOT NULL DEFAULT 8, -- 8am for FL/OK
  quiet_hours_end_strict INT NOT NULL DEFAULT 20, -- 8pm for FL/OK
  
  -- Behavior
  stop_on_reply BOOLEAN NOT NULL DEFAULT true, -- stop sequence when lead replies
  stop_on_booking BOOLEAN NOT NULL DEFAULT true, -- stop sequence when lead books
  max_weeks_no_reply INT NOT NULL DEFAULT 3, -- stop after 3 weeks of no replies
  
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings for existing accounts
INSERT INTO public.account_followup_settings (account_id)
SELECT id FROM public.accounts
WHERE NOT EXISTS (
  SELECT 1 FROM public.account_followup_settings WHERE account_id = accounts.id
)
ON CONFLICT (account_id) DO NOTHING;

-- Helper function: detect leads with "died" conversations needing follow-up enrollment
CREATE OR REPLACE FUNCTION public.leads_with_died_conversations(
  p_account_id UUID,
  p_conversation_died_hours INT DEFAULT 48
) RETURNS TABLE (lead_id UUID, last_sent_at TIMESTAMPTZ, last_inbound_at TIMESTAMPTZ)
LANGUAGE SQL
AS $$
  SELECT 
    l.id AS lead_id,
    l.last_sent_at,
    l.last_inbound_at
  FROM public.leads l
  WHERE l.account_id = p_account_id
    AND COALESCE(l.opted_out, false) = false
    AND l.last_sent_at IS NOT NULL
    -- No inbound reply since last outbound, or inbound is older than last outbound
    AND (l.last_inbound_at IS NULL OR l.last_inbound_at < l.last_sent_at)
    -- Last outbound was X hours ago
    AND l.last_sent_at < (NOW() - MAKE_INTERVAL(hours => p_conversation_died_hours))
    -- Not already in an active follow-up sequence
    AND NOT EXISTS (
      SELECT 1 FROM public.ai_followup_cursor c
      WHERE c.lead_id = l.id
        AND c.status IN ('active', 'processing')
    );
$$;

-- Helper function: cancel follow-ups for a lead (used on opt-out or booking)
CREATE OR REPLACE FUNCTION public.cancel_followups_for_lead(
  p_lead_id UUID,
  p_reason TEXT DEFAULT 'manual_cancel'
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Cancel active cursor
  UPDATE public.ai_followup_cursor
  SET status = 'cancelled',
      updated_at = NOW()
  WHERE lead_id = p_lead_id
    AND status IN ('active', 'processing');
  
  -- Cancel scheduled cadence runs
  UPDATE public.cadence_runs
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancel_reason = p_reason
  WHERE lead_id = p_lead_id
    AND status = 'scheduled';
END;
$$;

-- Comments for documentation
COMMENT ON TABLE public.ai_followup_cursor IS 'Tracks active AI follow-up sequences per lead';
COMMENT ON TABLE public.ai_followup_log IS 'Historical log of all follow-up attempts';
COMMENT ON TABLE public.account_followup_settings IS 'Per-account configuration for AI follow-up behavior';
COMMENT ON COLUMN public.account_followup_settings.conversation_died_hours IS 'Hours of silence before considering conversation "died"';
COMMENT ON COLUMN public.account_followup_settings.cadence_hours IS 'Array of hours between follow-up attempts, e.g. [12,24,36,...] for 2/day schedule';
COMMENT ON COLUMN public.account_followup_settings.preferred_send_times IS 'Best times for sending (local time), e.g. [{"hour":10,"minute":30},{"hour":15,"minute":30}]';
COMMENT ON COLUMN public.account_followup_settings.max_per_day_normal IS 'Max follow-ups per day for normal states (not FL/OK)';
COMMENT ON COLUMN public.account_followup_settings.max_per_day_strict IS 'Max total messages per day for FL/OK (includes all outbound, not just follow-ups)';

