-- Update AI Follow-up System to use gentle cadence (3-4 follow-ups over several days)
-- Instead of aggressive 42 follow-ups over 21 days

-- Update default cadence in ai_followup_cursor table
ALTER TABLE public.ai_followup_cursor 
  ALTER COLUMN max_attempts SET DEFAULT 4;

-- Update default cadence in account_followup_settings
ALTER TABLE public.account_followup_settings
  ALTER COLUMN max_followups SET DEFAULT 4,
  ALTER COLUMN cadence_hours SET DEFAULT '[48, 96, 168, 240]'::jsonb; -- 48h (2d), 4d, 7d, 10d

-- Update existing cursors that are using old aggressive cadence
UPDATE public.ai_followup_cursor
SET max_attempts = 4,
    cadence = '[48, 96, 168, 240]'::jsonb
WHERE max_attempts > 10
  AND status IN ('active', 'processing');

-- Update existing account settings to use gentle cadence
UPDATE public.account_followup_settings
SET max_followups = 4,
    cadence_hours = '[48, 96, 168, 240]'::jsonb
WHERE max_followups > 10;

-- Comments
COMMENT ON COLUMN public.ai_followup_cursor.max_attempts IS 'Default: 4 follow-ups (gentle cadence over 10 days)';
COMMENT ON COLUMN public.account_followup_settings.max_followups IS 'Default: 4 follow-ups (gentle cadence: 48h, 4d, 7d, 10d)';
COMMENT ON COLUMN public.account_followup_settings.cadence_hours IS 'Default: [48, 96, 168, 240] hours = 2 days, 4 days, 7 days, 10 days';


