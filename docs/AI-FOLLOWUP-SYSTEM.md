# AI Follow-Up System

## Overview

The AI Follow-Up System automatically re-engages leads when conversations "die" (no reply for X hours). It sends gentle, context-aware follow-ups at strategic intervals to revive dormant conversations.

## How It Works

### 1. Conversation Died Detection
- **Trigger**: Lead hasn't replied for 48+ hours after your last outbound message
- **Check**: Hourly cron job (`/api/cron/enroll-followups`) scans for eligible leads
- **Enrollment**: Lead is added to follow-up sequence via `ai_followup_cursor` table

### 2. Follow-Up Cadence (Default - Aggressive)
**Schedule**: 2 texts per day at statistically best times for 21 days

| Day | Texts | Times (Local) | Cumulative |
|-----|-------|---------------|------------|
| 1 | 2 | 10:30am, 3:30pm | 2 |
| 2-7 | 2/day | 10:30am, 3:30pm | 14 |
| 8-14 | 2/day | 10:30am, 3:30pm | 28 |
| 15-21 | 2/day | 10:30am, 3:30pm | 42 |

**Total**: Max 42 follow-ups over 21 days (3 weeks), then stop.

**Message Style**:
- Days 1-7: "Hi {{name}}, just checking back—still interested?"
- Days 8-14: Lighter nudges, vary name usage
- Days 15-21: Final check-ins, "should I hold off?"

**Compliance Caps**:
- **Normal states**: Max 2 follow-ups/day (already at limit)
- **FL/OK**: Max 3 total messages/day (includes all outbound, not just follow-ups)

### 3. Auto-Cancellation
Follow-ups are automatically cancelled when:
- ✅ Lead replies (any inbound message)
- ✅ Lead opts out (STOP/PAUSE)
- ✅ Lead books an appointment
- ✅ Max attempts reached (4 by default)

### 4. Sending Rules
- **Quiet Hours**: 
  - Normal states: 8am–9pm local time
  - FL/OK: 8am–8pm local time (stricter)
- **Daily Caps**: 
  - Normal states: Max 2 follow-ups/day per lead
  - FL/OK: Max 3 total messages/day per lead (all outbound combined)
- **Best Times**: 
  - Morning: 10:30am local
  - Afternoon: 3:30pm local
  - Alternates between these two slots throughout the day
- **State Compliance**: Stricter rules for FL/OK automatically enforced

## Configuration

### Per-Account Settings (`account_followup_settings`)

```sql
SELECT * FROM account_followup_settings WHERE account_id = 'YOUR_ACCOUNT_ID';
```

| Setting | Default | Description |
|---------|---------|-------------|
| `conversation_died_hours` | 48 | Hours of silence before enrolling lead |
| `max_followups` | 42 | Total follow-ups before giving up (2/day * 21 days) |
| `cadence_hours` | `[12,24,36,...]` | Hours between each follow-up (12h = 2/day) |
| `preferred_send_times` | `[{"hour":10,"minute":30}, {"hour":15,"minute":30}]` | Best times for sending (10:30am, 3:30pm local) |
| `max_per_day_normal` | 2 | Max follow-ups/day for normal states |
| `max_per_day_strict` | 3 | Max total messages/day for FL/OK |
| `quiet_hours_start` | 8 | Start of quiet hours (8am local) |
| `quiet_hours_end` | 21 | End of quiet hours (9pm local) |
| `quiet_hours_end_strict` | 20 | End for FL/OK (8pm local) |
| `stop_on_reply` | `true` | Cancel sequence when lead replies |
| `stop_on_booking` | `true` | Cancel sequence when lead books |
| `max_weeks_no_reply` | 3 | Stop after 3 weeks of no replies |

### Updating Settings

```sql
-- Change conversation died threshold to 72 hours
UPDATE account_followup_settings
SET conversation_died_hours = 72
WHERE account_id = 'YOUR_ACCOUNT_ID';

-- Less aggressive: 1 per day for 21 days (24h intervals)
UPDATE account_followup_settings
SET cadence_hours = '[24,48,72,96,120,144,168,192,216,240,264,288,312,336,360,384,408,432,456,480,504]'::jsonb,
    max_followups = 21
WHERE account_id = 'YOUR_ACCOUNT_ID';

-- Very conservative: 1 per week for 4 weeks
UPDATE account_followup_settings
SET cadence_hours = '[168,336,504,672]'::jsonb,
    max_followups = 4
WHERE account_id = 'YOUR_ACCOUNT_ID';

-- DEFAULT (Aggressive): 2 per day for 21 days
-- Already set, but here's how to reset to default:
UPDATE account_followup_settings
SET cadence_hours = '[12,24,36,48,60,72,84,96,108,120,132,144,156,168,180,192,204,216,228,240,252,264,276,288,300,312,324,336,348,360,372,384,396,408,420,432,444,456,468,480,492,504]'::jsonb,
    max_followups = 42
WHERE account_id = 'YOUR_ACCOUNT_ID';
```

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| `/api/cron/enroll-followups` | Hourly | Find leads with died conversations, enroll them |
| `/api/internal/followups/tick` | Every 10 min | Send due follow-ups from `ai_followup_cursor` |

**Auth**: Both require `CRON_SECRET` or `ADMIN_API_KEY` header.

## Database Schema

### `ai_followup_cursor`
Tracks active follow-up sequences per lead.

| Column | Type | Description |
|--------|------|-------------|
| `lead_id` | UUID | PK, references `leads(id)` |
| `account_id` | UUID | Account owning this lead |
| `status` | TEXT | `active`, `processing`, `done`, `cancelled` |
| `attempt` | INT | Current attempt (0-indexed) |
| `max_attempts` | INT | Stop after this many |
| `cadence` | JSONB | `[2,4,7,10]` - days between |
| `next_at` | TIMESTAMPTZ | Next scheduled send time |

### `ai_followup_log`
Historical log of all follow-up attempts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `lead_id` | UUID | Lead this attempt was for |
| `attempt` | INT | Which attempt (1, 2, 3...) |
| `sent_sid` | TEXT | Twilio SID if sent |
| `status` | TEXT | `sent`, `skipped`, `failed` |
| `reason` | TEXT | Why skipped/failed |

## Message Tone & Content

Follow-up messages use the **same LLM system** as normal replies, with special guidance:

- **Short**: 1-2 sentences, ~150 chars
- **Light**: No guilt trips, friendly check-in
- **Context-aware**: References prior conversation when relevant
- **Name usage**: Use name on 1st follow-up after silence, then occasionally (not every time)
- **No immediate CTA**: Don't push calendar link in first follow-up; warm them up first

### Example Follow-Ups

**Attempt 1** (2 days after silence):
> Hi Sarah, just checking back—still want to explore automating your follow-ups?

**Attempt 2** (4 days later):
> Quick check-in—did you want me to send that overview of how we handle lead revival?

**Attempt 3** (7 days later):
> Still thinking it over? Happy to answer any questions.

**Attempt 4** (10 days later):
> Hi Sarah, last nudge—want to see how this could help your team or should I hold off?

## Manual Operations

### Enroll a Lead Manually
```sql
INSERT INTO ai_followup_cursor (lead_id, account_id, status, attempt, max_attempts, cadence, next_at)
VALUES (
  'LEAD_ID',
  'ACCOUNT_ID',
  'active',
  0,
  4,
  '[2,4,7,10]'::jsonb,
  NOW() + INTERVAL '2 days'
);
```

### Cancel Follow-Ups for a Lead
```sql
SELECT cancel_followups_for_lead('LEAD_ID', 'manual_cancel');
```

### View Active Follow-Ups
```sql
SELECT 
  c.lead_id,
  l.name,
  l.phone,
  c.attempt,
  c.max_attempts,
  c.next_at,
  c.status
FROM ai_followup_cursor c
JOIN leads l ON l.id = c.lead_id
WHERE c.account_id = 'YOUR_ACCOUNT_ID'
  AND c.status = 'active'
ORDER BY c.next_at ASC;
```

### View Follow-Up History
```sql
SELECT 
  log.attempt,
  log.status,
  log.reason,
  log.sent_sid,
  log.created_at,
  l.name,
  l.phone
FROM ai_followup_log log
JOIN leads l ON l.id = log.lead_id
WHERE log.account_id = 'YOUR_ACCOUNT_ID'
ORDER BY log.created_at DESC
LIMIT 50;
```

## Testing

### Test Enrollment
```bash
curl -X POST https://yourapp.com/api/cron/enroll-followups \
  -H "x-admin-token: YOUR_ADMIN_KEY"
```

### Test Sending Due Follow-Ups
```bash
curl -X POST https://yourapp.com/api/internal/followups/tick \
  -H "x-admin-token: YOUR_ADMIN_KEY" \
  -H "content-type: application/json" \
  -d '{"limit": 10, "max_chars": 160}'
```

### Simulate Died Conversation
```sql
-- Make a lead look like conversation died 3 days ago
UPDATE leads
SET last_sent_at = NOW() - INTERVAL '72 hours',
    last_inbound_at = NOW() - INTERVAL '96 hours'
WHERE id = 'TEST_LEAD_ID';

-- Run enrollment (or wait for hourly cron)
-- Then check ai_followup_cursor for new entry
```

## Metrics & Monitoring

### Enrollment Rate
```sql
SELECT 
  DATE(created_at) AS date,
  COUNT(*) AS enrolled,
  COUNT(*) FILTER (WHERE status = 'done') AS completed,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
FROM ai_followup_cursor
WHERE account_id = 'YOUR_ACCOUNT_ID'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Reply Rate by Attempt
```sql
WITH attempts AS (
  SELECT 
    log.attempt,
    log.lead_id,
    log.created_at,
    EXISTS (
      SELECT 1 FROM messages_in mi
      WHERE mi.lead_id = log.lead_id
        AND mi.created_at > log.created_at
        AND mi.created_at < log.created_at + INTERVAL '48 hours'
    ) AS got_reply
  FROM ai_followup_log log
  WHERE log.account_id = 'YOUR_ACCOUNT_ID'
    AND log.status = 'sent'
)
SELECT 
  attempt,
  COUNT(*) AS sent,
  COUNT(*) FILTER (WHERE got_reply) AS replied,
  ROUND(100.0 * COUNT(*) FILTER (WHERE got_reply) / COUNT(*), 1) AS reply_rate_pct
FROM attempts
GROUP BY attempt
ORDER BY attempt;
```

## Troubleshooting

### Follow-Ups Not Sending
1. Check cron jobs are running: Vercel → Project → Cron Jobs tab
2. Verify `CRON_SECRET` or `ADMIN_API_KEY` is set in env vars
3. Check logs: `vercel logs --follow`
4. Ensure account is not paused: `SELECT outbound_paused FROM accounts WHERE id = '...'`

### Lead Not Enrolling
```sql
-- Check if conversation actually died
SELECT 
  id,
  name,
  phone,
  last_sent_at,
  last_inbound_at,
  opted_out,
  (last_inbound_at IS NULL OR last_inbound_at < last_sent_at) AS no_reply_since_last_sent,
  (last_sent_at < NOW() - INTERVAL '48 hours') AS long_enough_ago
FROM leads
WHERE id = 'LEAD_ID';

-- Check if already enrolled
SELECT * FROM ai_followup_cursor WHERE lead_id = 'LEAD_ID';
```

### Follow-Ups Sending at Wrong Times
- Check `account_followup_settings.preferred_send_times`
- Verify quiet hours: `account_followup_prefs` (if exists)
- Review `isQuietHours()` logic in `/pages/api/webhooks/twilio/inbound.ts`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  1. Hourly Cron: /api/cron/enroll-followups                │
│     - Finds leads with died conversations                   │
│     - Inserts into ai_followup_cursor                       │
│     - Sets next_at based on cadence_days[0]                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Every 10min: /api/internal/followups/tick               │
│     - SELECT WHERE next_at <= NOW() AND status = 'active'   │
│     - Drafts message using LLM + lead context               │
│     - Sends via /api/sms/send                               │
│     - Updates attempt++, next_at = NOW() + cadence[attempt] │
│     - Logs to ai_followup_log                               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Lead Replies: /api/webhooks/twilio/inbound              │
│     - Detects inbound message                               │
│     - Calls cancel_followups_for_lead()                     │
│     - Sets cursor status = 'cancelled'                      │
│     - Cancels scheduled cadence_runs                        │
└─────────────────────────────────────────────────────────────┘
```

## Best Practices

1. **Start Conservative**: Use default 48h / [2,4,7,10] cadence
2. **Monitor Reply Rates**: Check metrics weekly, adjust if <5% reply rate
3. **Respect Opt-Outs**: System auto-cancels on STOP/PAUSE, never override
4. **Test Before Launch**: Simulate died conversations on test leads
5. **Review Messages**: Spot-check generated follow-ups for tone/quality
6. **Don't Over-Nudge**: 4 follow-ups max is plenty; more = spam

## Roadmap

- [ ] Per-lead timezone detection for smarter send times
- [ ] A/B test different cadences automatically
- [ ] ML-based optimal send time prediction
- [ ] Custom follow-up templates per lead bucket (new/cold/in-progress)
- [ ] Slack/email alerts when follow-up gets a reply
- [ ] Dashboard UI for viewing/managing active sequences

