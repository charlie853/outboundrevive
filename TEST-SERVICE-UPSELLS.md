# Service Upsells Cron - Testing Guide

## What Was Fixed

### 1. Column Name Mismatch Fixes
Fixed all references from `window` (Postgres reserved keyword) to `window_bucket`:
- ✅ `app/api/watchlist/route.ts` - Updated select and filter queries
- ✅ `app/api/insights/vertical/route.ts` - Updated select query
- ✅ `app/api/internal/scores/recompute/route.ts` - Updated upsert operation

### 2. Cron Configuration
Added service-upsells cron to `vercel.json`:
- ✅ Schedule: Every 6 hours (`0 */6 * * *`)
- ✅ Path: `/api/cron/service-upsells`
- ✅ Authentication: Uses `CRON_SECRET` or `ADMIN_API_KEY`

## How the Service Upsells Cron Works

The cron job (`/api/cron/service-upsells`) scans for service events in three trigger windows:

1. **PRE trigger (T-48h)**: Finds appointments scheduled 36-48 hours from now
   - Checks: `upsell_pre_sent_at IS NULL`
   - Window: `appt_time` between `now + 36h` and `now + 48h`

2. **RO trigger (RO-open)**: Finds repair orders that just opened
   - Checks: `upsell_ro_sent_at IS NULL` AND `ro_opened_at` exists
   - Window: `ro_opened_at` within last 1 hour

3. **POST trigger (T+24h)**: Finds repair orders closed 24h ago
   - Checks: `upsell_post_sent_at IS NULL` AND `ro_closed_at` exists
   - Window: `ro_closed_at` within last 24 hours

For each eligible event, it calls `/api/internal/offers/send` which:
- Selects the best offer based on `offers.rule_json` (vehicle make/model, mileage)
- Checks compliance (quiet hours, state caps, opt-outs)
- Sends SMS via existing pipeline
- Logs to `offer_sends` table with experiment variant
- Marks the trigger phase as sent (sets `upsell_pre_sent_at`, etc.)

## Testing Steps

### Step 1: Set Up Test Data

Run the SQL script in Supabase SQL Editor:

```bash
# The script creates:
# - Test lead
# - Test vehicle
# - 3 test service events (one for each trigger type)
# - Test offer

# Edit sql/test-service-upsells.sql first:
# Replace '11111111-1111-1111-1111-111111111111' with your actual account_id
```

Then run it:
```sql
-- Copy/paste from sql/test-service-upsells.sql
```

### Step 2: Verify Test Data

Check that service events are eligible:

```sql
SELECT 
  id,
  external_id,
  appt_time,
  ro_opened_at,
  ro_closed_at,
  CASE 
    WHEN upsell_pre_sent_at IS NULL 
      AND appt_time > NOW() + INTERVAL '36 hours' 
      AND appt_time < NOW() + INTERVAL '48 hours' 
    THEN 'PRE eligible'
    WHEN upsell_ro_sent_at IS NULL 
      AND ro_opened_at IS NOT NULL 
      AND ro_opened_at > NOW() - INTERVAL '1 hour' 
    THEN 'RO eligible'
    WHEN upsell_post_sent_at IS NULL 
      AND ro_closed_at IS NOT NULL 
      AND ro_closed_at > NOW() - INTERVAL '24 hours' 
    THEN 'POST eligible'
    ELSE 'Not eligible'
  END as trigger_status
FROM public.service_events
WHERE account_id = 'YOUR_ACCOUNT_ID'
ORDER BY created_at DESC;
```

### Step 3: Test Cron Endpoint Manually

Option A: Using the test script:
```bash
export ADMIN_API_KEY='your-admin-key'
export PUBLIC_BASE_URL='https://www.outboundrevive.com'
./scripts/test-service-upsells.sh
```

Option B: Using curl directly:
```bash
# Using CRON_SECRET
curl -X POST https://www.outboundrevive.com/api/cron/service-upsells \
  -H "Authorization: Bearer 9eb24ad1befaa66d73b3345431f4afb0" \
  -H "Content-Type: application/json"

# Or using x-cron-secret header
curl -X POST https://www.outboundrevive.com/api/cron/service-upsells \
  -H "x-cron-secret: 9eb24ad1befaa66d73b3345431f4afb0" \
  -H "Content-Type: application/json"

# Or using admin token
curl -X POST https://www.outboundrevive.com/api/cron/service-upsells \
  -H "x-admin-token: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "ok": true,
  "counts": {
    "pre": 1,
    "ro": 1,
    "post": 1
  },
  "responses": {
    "pre": { "ok": true, "sent": 1, ... },
    "ro": { "ok": true, "sent": 1, ... },
    "post": { "ok": true, "sent": 1, ... }
  }
}
```

### Step 4: Verify Offers Were Sent

Check the `offer_sends` table:

```sql
SELECT 
  os.id,
  os.sent_at,
  os.accepted,
  os.variant,
  o.title as offer_title,
  se.external_id as service_event_id,
  l.name as lead_name,
  l.phone
FROM public.offer_sends os
LEFT JOIN public.offers o ON o.id = os.offer_id
LEFT JOIN public.service_events se ON se.id = os.service_event_id
LEFT JOIN public.leads l ON l.id = se.lead_id
WHERE os.account_id = 'YOUR_ACCOUNT_ID'
ORDER BY os.sent_at DESC
LIMIT 10;
```

Check that service events were marked as sent:

```sql
SELECT 
  id,
  external_id,
  upsell_pre_sent_at,
  upsell_ro_sent_at,
  upsell_post_sent_at
FROM public.service_events
WHERE account_id = 'YOUR_ACCOUNT_ID'
ORDER BY created_at DESC;
```

### Step 5: Check SMS Messages

Verify messages were sent via the SMS pipeline:

```sql
SELECT 
  mo.id,
  mo.body,
  mo.created_at,
  mo.gate_log->>'category' as category,
  l.name as lead_name,
  l.phone
FROM public.messages_out mo
JOIN public.leads l ON l.id = mo.lead_id
WHERE mo.account_id = 'YOUR_ACCOUNT_ID'
  AND mo.created_at > NOW() - INTERVAL '1 hour'
ORDER BY mo.created_at DESC;
```

## Automated Testing in Vercel

The cron is configured to run **every 6 hours** via Vercel cron:

```json
{
  "path": "/api/cron/service-upsells",
  "schedule": "0 */6 * * *"
}
```

Vercel will automatically:
1. Call the endpoint at 00:00, 06:00, 12:00, 18:00 UTC
2. Authenticate using `CRON_SECRET` from environment variables
3. Log execution results in Vercel dashboard

## Monitoring

### Vercel Logs
Check Vercel deployment logs for:
- `[service-upsells]` log messages
- Execution counts (pre, ro, post)
- Any errors or skipped events

### Database Queries

Check recent cron activity:
```sql
-- See recent offer sends
SELECT COUNT(*) as total_sent, 
       COUNT(*) FILTER (WHERE accepted = true) as accepted,
       SUM(revenue_attributed) as total_revenue
FROM public.offer_sends
WHERE account_id = 'YOUR_ACCOUNT_ID'
  AND sent_at > NOW() - INTERVAL '24 hours';
```

## Troubleshooting

### Issue: Cron returns `{"ok": true, "counts": {"pre": 0, "ro": 0, "post": 0}}`

**Possible causes:**
1. No eligible service events in the trigger windows
2. All events already have upsell flags set
3. Events outside the time windows

**Fix:**
- Create new test events with correct timing
- Reset `upsell_*_sent_at` fields to NULL for testing
- Adjust event times to match trigger windows

### Issue: Offers not being sent

**Check:**
1. Does the account have active offers in `offers` table?
2. Do offers match the vehicle criteria (make/model/mileage)?
3. Are leads opted out?
4. Are quiet hours blocking sends?

### Issue: Authentication errors

**Verify:**
1. `CRON_SECRET` is set in Vercel environment variables
2. The secret matches: `9eb24ad1befaa66d73b3345431f4afb0`
3. Headers are correct (`Authorization: Bearer ...` or `x-cron-secret: ...`)

## Next Steps

Once testing confirms it works:
1. ✅ Deploy to production
2. ✅ Monitor first few cron executions
3. ✅ Set up alerts for cron failures (Vercel webhooks)
4. ✅ Add dashboard metrics for upsell performance
5. ✅ Document how to create offers for dealers

