# SMS Caps & Billing System

## Overview

OutboundRevive includes built-in SMS cap enforcement to prevent overspending and provide predictable billing. When an account reaches their monthly segment limit, outbound messaging automatically pauses while inbound replies continue to work.

## How It Works

### 1. **Segment Counting**

Every SMS is counted in "segments":
- **1 segment** = 160 characters
- Messages over 160 chars split into multiple segments
- Example: 300-character message = 2 segments

Both inbound and outbound messages count toward the monthly cap.

### 2. **Monthly Caps by Plan**

| Plan | Monthly Segments | Price |
|------|-----------------|-------|
| **Starter** (Free) | 500 | $0/mo |
| **Lite** | 1,000 | $299/mo |
| **Standard** (Popular) | 2,000 | $399/mo |
| **Pro** | 5,000 | $599/mo |
| **Enterprise** | Custom | Contact Sales |

### 3. **Cap Enforcement Logic**

The system checks caps at multiple points:

#### A. **Per-Message Check** (`app/api/sms/send/route.ts`)
```typescript
// Before sending each message:
const { data: bill } = await supabaseAdmin
  .from('tenant_billing')
  .select('monthly_cap_segments, segments_used')
  .eq('account_id', accountId)
  .maybeSingle();

if (bill && (bill.segments_used || 0) >= bill.monthly_cap_segments) {
  // Block outbound message
  return { error: 'monthly_cap_reached' };
}
```

#### B. **Dashboard Notifications**
- **80% warning**: Yellow banner with "Upgrade" button
- **100% reached**: Red banner, outbound paused

#### C. **Automatic Pause**
When cap is reached:
- ✅ Inbound replies: Still processed (always work)
- ❌ Outbound messages: Blocked until next cycle or upgrade
- ✅ AI responses to inbound: Still work (count as replies)
- ❌ Automated follow-ups: Paused

### 4. **Segment Tracking**

Segments are tracked in:
- `tenant_billing.segments_used` - Current month's usage
- `messages_in.segments` - Per-message segment count
- `messages_out.segments` - Per-message segment count

**Incrementing happens automatically:**
```sql
-- When a message is sent/received
UPDATE tenant_billing 
SET segments_used = segments_used + message_segments
WHERE account_id = ?;
```

### 5. **Monthly Reset**

Billing cycles reset monthly:
- `cycle_start` - Start of current billing period
- `cycle_end` - End of current billing period
- `segments_used` - Resets to 0 on new cycle

**Reset is handled by**: `app/api/cron/billing/reset/route.ts`
```typescript
// Runs monthly (1st of each month at midnight)
await supabaseAdmin.rpc('reset_monthly_billing_cycles');
```

## User Experience

### Dashboard Display

The dashboard shows usage in real-time:

```
┌─────────────────────────────────────┐
│ Monthly Usage                       │
├─────────────────────────────────────┤
│ ███████████████░░░░░░░░░  75%       │
│ 750 / 1,000 segments                │
└─────────────────────────────────────┘
```

### Warning Banners

#### 80% Warning (Amber)
```
⚠️  Approaching cap — consider upgrading.  [Upgrade →]
```

#### 100% Reached (Red)
```
🚫 Cap reached — outbound paused.  [Upgrade →]
```

Clicking "Upgrade" opens Stripe checkout with the next tier plan.

## Upgrading Plans

### From Dashboard

1. User sees warning banner
2. Clicks "Upgrade" button
3. Redirects to Stripe Checkout
4. Stripe webhook updates `tenant_billing` table
5. New cap takes effect immediately

### From Pricing Page

1. Visit `/pricing`
2. Click "Upgrade to [Plan]" button
3. Redirects to Stripe Checkout
4. Billing updates automatically

### Stripe Integration

**Environment Variables Required:**
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_LITE=price_... # Stripe Price ID for Lite plan
STRIPE_PRICE_STANDARD=price_... # Stripe Price ID for Standard plan
STRIPE_PRICE_PRO=price_... # Stripe Price ID for Pro plan
```

**Webhook Handler:** `app/api/webhooks/stripe/route.ts`
```typescript
// Handles:
- checkout.session.completed
- customer.subscription.updated
```

**Checkout API:** `app/api/billing/stripe/checkout/route.ts`
```typescript
// Creates Stripe session with:
- plan_id (lite, standard, pro)
- account_id (for webhook metadata)
- success_url & cancel_url
```

## Testing Cap Enforcement

### 1. **Set a Low Cap**
```sql
UPDATE tenant_billing 
SET monthly_cap_segments = 10
WHERE account_id = '11111111-1111-1111-1111-111111111111';
```

### 2. **Send Messages Until Cap**
Use the AI texter or manual send to hit the limit.

### 3. **Verify Block**
- Dashboard shows red banner
- New outbound messages return `monthly_cap_reached` error
- Inbound replies still work

### 4. **Test Upgrade Flow**
- Click "Upgrade" in dashboard
- Complete Stripe checkout (test mode)
- Verify new cap applied
- Confirm outbound messages resume

## Compliance & Safety

### Inbound Always Works
Even at 100% cap, inbound replies are:
- ✅ Received and logged
- ✅ Processed by AI
- ✅ Can trigger responses (which count as replies, not outbound)

This ensures:
- No lost conversations
- No compliance issues (TCPA requires processing STOP)
- No frustrated leads

### Outbound Safely Pauses
- No overage charges
- No surprise bills
- Predictable costs

### Grace Period (Optional Enhancement)
Consider adding a small grace buffer (e.g., +50 segments) for urgent replies.

## Database Schema

### `tenant_billing` Table
```sql
CREATE TABLE public.tenant_billing (
  account_id uuid PRIMARY KEY,
  plan_tier text, -- 'starter', 'lite', 'standard', 'pro'
  monthly_cap_segments int NOT NULL DEFAULT 500,
  cycle_start date NOT NULL DEFAULT CURRENT_DATE,
  cycle_end date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
  segments_used int NOT NULL DEFAULT 0,
  warn_80_sent boolean NOT NULL DEFAULT false, -- Email notification flag
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Indexes
```sql
CREATE INDEX idx_tenant_billing_account ON tenant_billing(account_id);
CREATE INDEX idx_tenant_billing_usage ON tenant_billing(segments_used);
```

## API Endpoints

### Get Billing Status
```
GET /api/billing/status
```
Response:
```json
{
  "ok": true,
  "plan_tier": "lite",
  "monthly_cap": 1000,
  "segments_used": 750,
  "percentage": 75,
  "cycle_start": "2025-11-01",
  "cycle_end": "2025-12-01"
}
```

### Get Plan Options
```
GET /api/billing/upgrade/preview
```
Response:
```json
{
  "ok": true,
  "plans": [
    {
      "id": "lite",
      "name": "Lite",
      "cap": 1000,
      "price": 29900,
      "priceFormatted": "$299/mo"
    },
    ...
  ]
}
```

### Create Checkout Session
```
POST /api/billing/stripe/checkout
Body: { "plan_id": "standard", "account_id": "..." }
```
Response:
```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/..."
}
```

## Future Enhancements

### 1. **Usage Notifications**
- Email at 50%, 80%, 100%
- Slack/Discord webhooks
- SMS notification to admin

### 2. **Overage Pricing**
- Allow $0.01/segment overages
- Capped at 10% over plan limit

### 3. **Annual Plans**
- 20% discount for annual billing
- Higher caps for annual customers

### 4. **Usage Analytics**
- Daily/weekly usage trends
- Forecast when cap will be hit
- Suggest optimal plan based on usage

### 5. **Team Limits**
- Per-user sending limits
- Department-level caps
- Multi-tenant support

## Troubleshooting

### Cap Not Enforcing
1. Check `tenant_billing` exists for account
2. Verify `segments_used` is updating
3. Check `app/api/sms/send/route.ts` logic
4. Look for errors in Vercel logs

### Dashboard Not Showing Usage
1. Check `/api/billing/status` response
2. Verify dashboard fetching with correct `account_id`
3. Check browser console for errors

### Stripe Webhook Not Working
1. Verify `STRIPE_WEBHOOK_SECRET` is set
2. Check Stripe webhook logs in dashboard
3. Test locally with Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
4. Ensure webhook includes `checkout.session.completed` and `customer.subscription.updated` events

### Segments Not Resetting
1. Check cron job is running: `/api/cron/billing/reset`
2. Verify `cycle_end` dates in `tenant_billing`
3. Check Vercel cron logs

## Summary

✅ **Fully implemented** SMS cap system
✅ **Real-time** usage tracking and enforcement
✅ **Automatic** outbound pause at 100%
✅ **Stripe** integration for upgrades
✅ **Dashboard** notifications and upgrade CTAs
✅ **Pricing** page with plan details

**User never gets surprised bills. System handles everything automatically.**

