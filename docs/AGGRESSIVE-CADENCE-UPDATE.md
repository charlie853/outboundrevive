# Aggressive Follow-Up Cadence Update

## Summary

Updated the AI follow-up system from a conservative 4-touch cadence to an aggressive 42-touch cadence over 21 days, with 2 texts sent per day at statistically optimal times while maintaining full compliance with state-specific regulations.

---

## What Changed

### Before (Conservative)
- **Total Follow-Ups**: 4
- **Duration**: ~23 days
- **Schedule**: Sporadic (days 2, 4, 7, 10)
- **Daily Max**: N/A (never hit daily limits)

### After (Aggressive)
- **Total Follow-Ups**: 42
- **Duration**: 21 days (3 weeks)
- **Schedule**: 2 per day, every day
- **Send Times**: 10:30am and 3:30pm local
- **Daily Max**: 2/day (normal states), 3/day total for FL/OK

---

## New Schedule

| Week | Days | Texts/Day | Total Texts | Cumulative |
|------|------|-----------|-------------|------------|
| 1 | 1-7 | 2 | 14 | 14 |
| 2 | 8-14 | 2 | 14 | 28 |
| 3 | 15-21 | 2 | 14 | 42 |

**Send Times** (Local):
- Morning: 10:30am
- Afternoon: 3:30pm

---

## Compliance Rules

### Normal States (Non-FL/OK)
- ✅ **Max 2 follow-ups per day** per lead
- ✅ Quiet hours: 8am–9pm local
- ✅ Auto-stop after 21 days (3 weeks)

### Florida & Oklahoma (Stricter)
- ✅ **Max 3 total messages per day** per lead (includes ALL outbound, not just follow-ups)
- ✅ Quiet hours: 8am–8pm local (1 hour earlier cutoff)
- ✅ Auto-stop after 21 days (3 weeks)

### Auto-Cancellation (All States)
Sequences immediately stop when:
- Lead replies (any inbound message)
- Lead opts out (STOP/PAUSE)
- Lead books an appointment
- Max attempts reached (42)

---

## Technical Changes

### Database Schema (`sql/2025-11-10_ai_followup_system.sql`)
```sql
-- Updated defaults
max_followups INT NOT NULL DEFAULT 42, -- was: 4
cadence_hours JSONB NOT NULL DEFAULT '[12,24,36,...]'::jsonb, -- was: cadence_days '[2,4,7,10]'

-- New fields
max_per_day_normal INT NOT NULL DEFAULT 2,
max_per_day_strict INT NOT NULL DEFAULT 3,
quiet_hours_end_strict INT NOT NULL DEFAULT 20, -- 8pm for FL/OK
max_weeks_no_reply INT NOT NULL DEFAULT 3
```

### Enrollment Logic (`app/api/cron/enroll-followups/route.ts`)
- Changed from `cadence_days` to `cadence_hours`
- Updated `calculateNextSendTime()` to alternate between morning (10:30am) and afternoon (3:30pm) slots
- Uses `preferred_send_times` from account settings

### Tick Logic (`app/api/internal/followups/tick/route.ts`)
- Updated to use hours-based cadence instead of days
- Changed from `addDays(stepDays)` to `Date.now() + stepHours * 60 * 60 * 1000`
- Max attempts increased from 5 to 42

---

## Configuration

### View Current Settings
```sql
SELECT 
  conversation_died_hours,
  max_followups,
  cadence_hours,
  max_per_day_normal,
  max_per_day_strict,
  quiet_hours_end,
  quiet_hours_end_strict
FROM account_followup_settings
WHERE account_id = 'YOUR_ACCOUNT_ID';
```

### Adjust Aggressiveness

#### Less Aggressive: 1 per day for 21 days
```sql
UPDATE account_followup_settings
SET cadence_hours = '[24,48,72,96,120,144,168,192,216,240,264,288,312,336,360,384,408,432,456,480,504]'::jsonb,
    max_followups = 21
WHERE account_id = 'YOUR_ACCOUNT_ID';
```

#### Conservative: 1 per week for 4 weeks
```sql
UPDATE account_followup_settings
SET cadence_hours = '[168,336,504,672]'::jsonb,
    max_followups = 4
WHERE account_id = 'YOUR_ACCOUNT_ID';
```

#### Reset to Default (Aggressive)
```sql
UPDATE account_followup_settings
SET cadence_hours = '[12,24,36,48,60,72,84,96,108,120,132,144,156,168,180,192,204,216,228,240,252,264,276,288,300,312,324,336,348,360,372,384,396,408,420,432,444,456,468,480,492,504]'::jsonb,
    max_followups = 42
WHERE account_id = 'YOUR_ACCOUNT_ID';
```

---

## Message Tone Across 21 Days

### Week 1 (Days 1-7)
- Use lead's name on first follow-up
- Friendly check-ins: "Hi {{name}}, just checking back—still interested?"
- Short, context-aware nudges

### Week 2 (Days 8-14)
- Vary name usage (not every message)
- Lighter touch: "Quick check-in—want that overview?"
- Acknowledge prior context when relevant

### Week 3 (Days 15-21)
- Final push: "Last check—should I hold off?"
- More direct but still friendly
- Clear value proposition

---

## Testing

### Verify Hourly Enrollment
```bash
curl -X POST https://www.outboundrevive.com/api/cron/enroll-followups \
  -H "x-cron-secret: YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "ok": true,
  "enrolled": N,
  "skipped": M,
  "accounts_processed": 1
}
```

### Check Active Sequences
```sql
SELECT 
  l.name,
  l.phone,
  c.attempt,
  c.max_attempts,
  c.next_at,
  c.cadence
FROM ai_followup_cursor c
JOIN leads l ON l.id = c.lead_id
WHERE c.account_id = 'YOUR_ACCOUNT_ID'
  AND c.status = 'active'
ORDER BY c.next_at ASC
LIMIT 10;
```

### Simulate Aggressive Cadence
```sql
-- Create test lead with died conversation
INSERT INTO leads (account_id, name, phone, last_sent_at, last_inbound_at)
VALUES (
  'YOUR_ACCOUNT_ID',
  'Test Lead',
  '+15555551234',
  NOW() - INTERVAL '48 hours',
  NOW() - INTERVAL '72 hours'
);

-- Run enrollment (or wait for hourly cron)
-- Check ai_followup_cursor for new entry with 42 max_attempts
```

---

## Monitoring

### Daily Stats
```sql
SELECT 
  DATE(created_at) AS date,
  COUNT(*) AS attempts,
  COUNT(*) FILTER (WHERE status = 'sent') AS sent,
  COUNT(*) FILTER (WHERE status = 'skipped') AS skipped
FROM ai_followup_log
WHERE account_id = 'YOUR_ACCOUNT_ID'
  AND created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Reply Rates by Week
```sql
WITH attempts_by_week AS (
  SELECT 
    log.lead_id,
    log.attempt,
    FLOOR(log.attempt / 14.0) AS week_num, -- 14 attempts per week (2/day * 7)
    log.created_at,
    EXISTS (
      SELECT 1 FROM messages_in mi
      WHERE mi.lead_id = log.lead_id
        AND mi.created_at > log.created_at
        AND mi.created_at < log.created_at + INTERVAL '24 hours'
    ) AS got_reply
  FROM ai_followup_log log
  WHERE log.status = 'sent'
    AND log.account_id = 'YOUR_ACCOUNT_ID'
)
SELECT 
  week_num + 1 AS week,
  COUNT(*) AS sent,
  COUNT(*) FILTER (WHERE got_reply) AS replied,
  ROUND(100.0 * COUNT(*) FILTER (WHERE got_reply) / COUNT(*), 1) AS reply_rate_pct
FROM attempts_by_week
GROUP BY week_num
ORDER BY week_num;
```

### Opt-Out Rate
```sql
SELECT 
  COUNT(DISTINCT c.lead_id) AS total_enrolled,
  COUNT(DISTINCT c.lead_id) FILTER (WHERE c.status = 'cancelled' AND l.opted_out = true) AS opted_out,
  ROUND(100.0 * COUNT(DISTINCT c.lead_id) FILTER (WHERE c.status = 'cancelled' AND l.opted_out = true) / COUNT(DISTINCT c.lead_id), 2) AS opt_out_rate_pct
FROM ai_followup_cursor c
JOIN leads l ON l.id = c.lead_id
WHERE c.account_id = 'YOUR_ACCOUNT_ID'
  AND c.created_at >= CURRENT_DATE - INTERVAL '30 days';
```

---

## Expected Results

### Success Metrics (First Month)
- ✅ **Reply Rate Week 1**: 8-12%
- ✅ **Reply Rate Week 2**: 4-8%
- ✅ **Reply Rate Week 3**: 2-5%
- ✅ **Opt-Out Rate**: <2%
- ✅ **Booking Rate**: 1-3% (of enrolled leads)

### Warning Signs
- ⚠️ Opt-out rate >5% → Reduce aggressiveness
- ⚠️ Reply rate Week 1 <5% → Review message quality
- ⚠️ Many "held" due to caps → Check for other outbound campaigns conflicting

---

## Rollback Plan

If results are poor or opt-out rate is too high:

```sql
-- Revert to conservative 4-touch cadence
UPDATE account_followup_settings
SET cadence_hours = '[48,96,168,240]'::jsonb, -- 2d, 4d, 7d, 10d
    max_followups = 4
WHERE account_id = 'YOUR_ACCOUNT_ID';

-- Cancel all active aggressive sequences
UPDATE ai_followup_cursor
SET status = 'cancelled',
    updated_at = NOW()
WHERE account_id = 'YOUR_ACCOUNT_ID'
  AND status = 'active'
  AND max_attempts > 10; -- Only cancel aggressive ones
```

---

## Files Changed

- `sql/2025-11-10_ai_followup_system.sql` - Schema with new defaults
- `app/api/cron/enroll-followups/route.ts` - Updated enrollment logic
- `app/api/internal/followups/tick/route.ts` - Hours-based cadence
- `docs/AI-FOLLOWUP-SYSTEM.md` - Updated documentation

---

## Deployment Checklist

- [x] SQL migration updated with new defaults
- [x] Enrollment cron uses hours-based cadence
- [x] Tick route calculates next attempt correctly
- [x] Documentation reflects aggressive schedule
- [x] Compliance caps enforced (2/day normal, 3/day FL/OK)
- [x] Quiet hours respect state rules (8-9pm normal, 8-8pm FL/OK)
- [ ] **Run SQL migration in production Supabase**
- [ ] Monitor first 24 hours closely
- [ ] Check opt-out rate after 1 week

---

**Status**: ✅ **Ready for Production**

Deployed to `main` branch, commit `9ead74a`.

Run SQL migration to activate the new aggressive cadence!

