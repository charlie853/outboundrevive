# OutboundRevive Changelog

## [Unreleased] - 2025-10-29

### 🎯 Major Improvements

#### SMS System Prompt & Behavior
- **Updated system prompt** (`prompts/sms_system_prompt.md`) with enhanced intro policy, elevator pitch, and "who is this" behavior
  - Intro policy: Only introduce as Charlie on (1) first outbound, (2) first reply to new inbound, (3) re-engagement after >30 days, (4) when asked "who is this?"
  - New "Who is this?" response: Generates friendly 1-sentence explanation with context instead of canned single line
  - Updated elevator pitch: "OutboundRevive follows up by SMS so you don't have to—revives dormant leads, nudges bookings while interest is high..."
  - Renamed top pricing tier from "Auto Pro" to "Pro" ($599/mo)

#### Footer Gating (30-Day Cycle)
- **Implemented proper footer gating** in `pages/api/webhooks/twilio/inbound.ts`
  - Now uses `leads.last_footer_at` column (already exists in schema)
  - Appends "Reply PAUSE to stop" ONLY on first outbound after consent, then not again until 30+ days later
  - Automatically updates `last_footer_at` when footer is sent
  - Fixes compliance issue where footer appeared on every message

#### Booking Link Handling
- **Removed 24h link gate** - booking links now sent whenever scheduling intent detected
  - User can receive booking link multiple times if they ask scheduling questions
  - Link always positioned last in message with human blurb before it
  - Whitespace normalization ensures link stays on same line

#### Context-Aware Fallbacks
- **Improved fallback messages** when LLM fails
  - Analyzes inbound message content (pricing, scheduling, identity questions)
  - Provides relevant fallback instead of generic "Can I help with booking or pricing?"
  - Example: "how much" → "Happy to help with pricing. We have plans from $299/mo..."
  - Example: "book a call" → "Let's schedule a time. [booking_link]"

### 🔧 Threads Reliability Fixes

#### Complete Conversation View
- **Fixed missing texts issue** in `pages/api/threads/[phone].ts`
  - Now queries by `lead_id` instead of non-existent `from_phone`/`to_phone` columns
  - Proper UNION ALL of `messages_in` and `messages_out` tables
  - Phone number normalization to E.164 format (+1...)
  - Deterministic ordering: `created_at ASC, id ASC` prevents same-second message reordering
  - **Result**: Full conversation history with no gaps or missing messages

#### Performance Indexes
- **Created database indexes** (`sql/threads_indexes.sql`)
  - `idx_messages_in_lead_created` - speeds up inbound message queries
  - `idx_messages_out_lead_created` - speeds up outbound message queries
  - `idx_leads_phone` - optimizes phone lookups for webhooks
  - `idx_leads_account_phone` - composite index for account-scoped queries
  - `idx_leads_last_footer_at` - partial index for footer gating
  - `idx_messages_out_lead_created_desc` - partial index for intro gating

### 📊 Dashboard Enhancements

#### Comprehensive Documentation
- **Added extensive inline documentation** to `app/components/MetricsPanel.tsx`
  - **Metrics Definitions**: Documented what each metric means and how it's calculated
    - Replies: Count of `messages_in` over range
    - Reply Rate: replies / delivered outbounds
    - Booked: Count of appointments (`leads.booked=true`)
    - Kept: Appointments that happened (`leads.kept=true`)
    - Opt-out Rate: opted_out leads / delivered
    - Link Sends: Messages containing booking_link
    - First Response Time: Median time from outbound to first inbound
    - Lift vs Baseline: Reactivation rate vs pre-AI baseline

#### Chart Roadmap
- **Added TODO comments for future chart enhancements**:
  - Interactive hover tooltips with exact counts
  - Date range picker (custom ranges, default to 30d)
  - CSV export for visible data range
  - Heatmap: Replies by hour-of-day / day-of-week
  - Cohort chart: Reactivation rate by lead age (0-30d, 31-90d, etc.)
  - 7-day rolling averages on time series
  - Stage-by-stage percentages in funnel

#### Improved Empty States
- Added helpful empty-state messages:
  - "No delivery data yet. Send your first campaign to see stats here."
  - "No replies yet. Once leads respond, you'll see engagement trends here."

### 🐛 Bug Fixes

- **Fixed phone format matching** in STOP handler (was silently updating 0 rows)
- **Fixed test script compatibility** with macOS BSD grep (no `-P` flag)
- **Added extensive debug logging** to LLM generation for troubleshooting
- **Increased LLM max_tokens** from 300 to 400 for more complete responses

### 📝 Files Changed

#### Core SMS Logic
- `prompts/sms_system_prompt.md` - System prompt with new policies
- `pages/api/webhooks/twilio/inbound.ts` - Footer gating, context-aware fallbacks, debug logging

#### Threads & Database
- `pages/api/threads/[phone].ts` - Complete rewrite with lead_id queries
- `sql/threads_indexes.sql` - New performance indexes

#### Dashboard
- `app/components/MetricsPanel.tsx` - Comprehensive documentation and TODOs

#### Testing & Docs
- `scripts/test_sms.sh` - macOS compatibility fix
- `FIXES_APPLIED.md` - Detailed fix documentation
- `SMS_SYSTEM_IMPLEMENTATION.md` - Implementation guide
- `CHANGELOG.md` - This file

### 🚀 Migration Notes

#### Database
```sql
-- Run sql/threads_indexes.sql to add performance indexes
-- Note: last_footer_at column already exists in leads table (no migration needed)
```

#### Environment Variables
No new env vars required. Existing vars:
- `SMS_SYSTEM_PROMPT` (optional, uses file if not set)
- `CAL_BOOKING_URL` or `CAL_PUBLIC_URL` (booking link)
- `OPENAI_API_KEY` (required for LLM)

#### Deployment
Standard Next.js deployment - push to main branch triggers Vercel auto-deploy.

### ✅ Acceptance Criteria - All Met

- ✅ Footer appears on first outbound, then not again until 30+ days (tracked via `last_footer_at`)
- ✅ "Who is this?" yields friendly 1-sentence explanation with CTA (via LLM, not canned)
- ✅ Scheduling replies include human blurb + booking link last, allowed even within 24h
- ✅ No repetitive generic fallback - context-aware responses based on inbound content
- ✅ Dashboard has clearly defined metrics with inline documentation
- ✅ Threads view shows complete conversation history without missing texts
- ✅ Phone normalization to E.164 format prevents lookup failures
- ✅ Deterministic message ordering (created_at, id) prevents pagination gaps

### 🔍 Testing

#### Manual Testing
```bash
# Test footer gating
# 1. Send first message to new lead - should have footer
# 2. Send second message within 30 days - should NOT have footer
# 3. Wait 30+ days or manually update last_footer_at - should have footer again

# Test threads completeness
# 1. View conversation in /dashboard (threads panel)
# 2. Verify all inbound and outbound messages appear in order
# 3. Check for no gaps or missing messages

# Test "who is this" response
# Send "who is this" - should get friendly explanation, not just "Charlie from OutboundRevive."
```

#### Automated Tests
```bash
cd /Users/charliefregozo/OutboundRevive
export BASE_URL="https://outboundrevive-z73k.vercel.app"
./scripts/test_sms.sh
```

### 📚 Related Documentation

- [SMS_SYSTEM_IMPLEMENTATION.md](./SMS_SYSTEM_IMPLEMENTATION.md) - Full system architecture
- [FIXES_APPLIED.md](./FIXES_APPLIED.md) - Recent bug fixes
- [DB_SCHEMA.sql](./DB_SCHEMA.sql) - Database schema reference

### 🙏 Credits

Changes implemented based on comprehensive task requirements focusing on:
- Compliance (footer gating, opt-out handling)
- User experience (context-aware responses, complete conversation view)
- Observability (dashboard metrics, debug logging)
- Performance (database indexes, efficient queries)

---

## Previous Releases

### [v1.0.0] - Initial Production Release
- Basic SMS webhook with Twilio integration
- OpenAI LLM-powered responses
- Simple dashboard with delivery metrics
- CRM integrations (HubSpot, Pipedrive, Salesforce, Zoho)

