# SMS System: Unified LLM Prompt + JSON Contract Implementation

## Overview

The Twilio inbound SMS webhook (`pages/api/webhooks/twilio/inbound.ts`) now uses a **single, authoritative system prompt** with **strict JSON output contract** enforcement. All business logic (intro timing, footer gating, link spam prevention, compliance) is handled server-side via post-processing guards.

## What Changed

### 1. **Authoritative System Prompt** (`prompts/sms_system_prompt.md`)

**Location**: `prompts/sms_system_prompt.md`

**Content includes:**
- Charlie from OutboundRevive identity & intro policy
- Pricing: $299 onboarding + $299-$599/mo tiers (Lite/Standard/Auto Pro)
- Objection playbook (price, timing, authority, competitor, etc.)
- Booking flow & Calendly link policy
- Compliance rules (STOP/PAUSE/HELP, footer gating, quiet hours, daily caps)
- JSON output contract specification

**Loading priority:**
1. `process.env.SMS_SYSTEM_PROMPT` (if set)
2. `prompts/sms_system_prompt.md` file
3. Minimal fallback (if both fail)

### 2. **Strict JSON Output Contract**

The LLM must return JSON:

```json
{
  "intent": "book | pricing_request | availability | objection_price | ...",
  "confidence": 0.0,
  "message": "final SMS text under 320 chars",
  "needs_footer": true/false,
  "actions": [
    {"type":"create_hold","start":"ISO8601","end":"ISO8601"},
    {"type":"send_booking_link","url":"..."},
    {"type":"suppress_number"},
    ...
  ],
  "hold_until": "ISO8601 or null",
  "policy_flags": {
    "quiet_hours_block": false,
    "state_cap_block": false,
    "footer_appended": false,
    "opt_out_processed": false
  }
}
```

**Enforcement:**
- Parse JSON; if invalid, retry once with "return valid JSON per contract"
- On double-failure, minimal fallback: `"Thanks for reaching out. Can I help with booking or pricing?"`

### 3. **Template Variable Substitution**

The system prompt uses `{{variable}}` tokens. The handler computes and injects:

| Variable | Source | Example |
|----------|--------|---------|
| `{{brand}}` | `process.env.BRAND` or "OutboundRevive" | OutboundRevive |
| `{{first_name}}` | `leads.name` split | John |
| `{{booking_link}}` | `CAL_BOOKING_URL` | https://cal.com/... |
| `{{time1}}`, `{{time2}}` | Next 2 business slots | Tue 2p, Wed 10a |
| `{{service}}` | Hardcoded or dynamic | appointment scheduling |
| `{{pricing_range}}` | Hardcoded | $299-$599/mo |
| `{{entry_option}}` | Hardcoded | Lite at $299/mo |
| `{{differentiator}}` | Hardcoded | AI-powered lead revival |

Variables are injected before sending to LLM.

### 4. **Server-Side Post-Processing Guards**

All compliance & UX rules enforced **after** LLM responds, **before** TwiML:

#### **Intro Gating**
- Track per thread: query last 5 `messages_out` for lead
- Intro allowed **only** if:
  1. First message in thread, OR
  2. Last message >30 days ago, OR
  3. No recent "Charlie from OutboundRevive" in last 5 messages, OR
  4. User asks "who is this?"
- LLM receives `needs_intro=true/false` in context

#### **Footer Gating**
- Query `messages_out` for last 30 days
- Add "If not interested, text back PAUSE." **only** if:
  1. No recent footer in last 30d, OR
  2. LLM sets `needs_footer=true`
- Footer appended to final TwiML body (not duplicated in `messages_out.body`)

#### **24h Link Gate**
- Before sending, check `messages_out.body` for `booking_link` in last 24h
- If found: **strip all booking URLs** from LLM output
- Prevents link spam; user can still ask again to override

#### **Link-Last Enforcement**
- If booking URL present in message, move to end
- Pattern: `"<core text> <booking_link>"`
- Ensures clean SMS formatting

#### **Quiet Hours**
- Check phone NPA (area code)
- FL/OK: 8am–8pm local (NPAs: 239, 305, 321, ..., 405, 539, 580, 918)
- Other states: 8am–9pm local
- **Note**: Currently simplified UTC check; production should use proper timezone mapping

#### **Daily Caps**
- Query `messages_out` count in last 24h
- FL/OK: ≤3 messages
- Other: ≤1 message
- **Note**: Caps skipped for inbound replies (user-initiated context)

#### **Robotic Opener Stripping**
- Removes: "Happy to help", "Got it", "Thanks for reaching out" from start of message
- Keeps response natural

#### **Length Clamp**
- Max 320 chars
- If over: preserve booking link at end, truncate core text

#### **Compliance Keywords (Pre-LLM)**
Handled **before** LLM call:
- `STOP`, `STOPALL`, `UNSUBSCRIBE`, `CANCEL`, `END`, `QUIT`, `REMOVE` → mark `opted_out=true`, reply "You're paused...", exit
- `PAUSE` → reply "You're paused...", exit
- `HELP` → reply "Help: booking & support...", exit

### 5. **Persistence (`persistOut`)**
- Looks up `lead_id` from phone
- Inserts into `messages_out` with correct schema: `{lead_id, account_id, body, sent_by: "ai"}`
- Appends footer to `body` if `needs_footer=true` **before** insert
- TwiML response uses same final body (including footer)

## Testing

### Run Acceptance Tests

```bash
cd /Users/charliefregozo/OutboundRevive
export BASE_URL="https://outboundrevive-z73k.vercel.app"  # or http://localhost:3000
./scripts/test_sms.sh
```

### Test Suite Coverage

| Test | Checks |
|------|--------|
| **Health** | `/api/ok`, `/api/health/sms` endpoints |
| **A: Scheduling** | Blurb + link, link at end, ≤320 chars |
| **B: Identity** | "who is this" → exact "Charlie from OutboundRevive." |
| **C: Pricing** | ≤320 chars, contains `$`, 1-2 sentences |
| **D: Link Gate** | 2nd request <24h has no link |
| **E: STOP** | Confirmation message, subsequent messages suppressed |
| **F: PAUSE** | Confirmation message |
| **G: HELP** | Includes opt-out instructions |

### Manual Testing (curl)

```bash
# Scheduling
curl -X POST "http://localhost:3000/api/webhooks/twilio/inbound" \
  -d "From=%2B14155551234&To=%2B14155556789&Body=book+a+call"

# Pricing
curl -X POST "http://localhost:3000/api/webhooks/twilio/inbound" \
  -d "From=%2B14155551234&To=%2B14155556789&Body=how+much+does+this+cost"

# STOP
curl -X POST "http://localhost:3000/api/webhooks/twilio/inbound" \
  -d "From=%2B14155551234&To=%2B14155556789&Body=STOP"
```

## Environment Variables

### Required

- `OPENAI_API_KEY` — OpenAI API key for LLM calls
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key
- `DEFAULT_ACCOUNT_ID` — Account UUID

### Optional

- `SMS_SYSTEM_PROMPT` — Override prompt (if set, takes precedence over file)
- `LLM_MODEL` — Model name (default: `gpt-4o-mini`)
- `OPENAI_MODEL` — Alias for `LLM_MODEL` (deprecated, use `LLM_MODEL`)
- `BRAND` — Brand name (default: `OutboundRevive`)
- `CAL_BOOKING_URL` — Calendly booking link
- `CAL_PUBLIC_URL` — Alias for booking link
- `CAL_URL` — Alias for booking link

## Architecture Decisions

### Why JSON Contract?

1. **Structured output**: Intent, confidence, actions are machine-parsable
2. **Testability**: Can assert on `intent` field without regex
3. **Extensibility**: `actions[]` array supports future workflow triggers (create_hold, escalate_to_human, etc.)
4. **Compliance flags**: `policy_flags` object makes auditing explicit

### Why Server-Side Guards?

- **Security**: LLM cannot bypass compliance rules (opt-outs, quiet hours, caps)
- **Consistency**: Same gating logic regardless of model or prompt changes
- **Auditability**: All decisions logged server-side
- **Cost control**: Link gate prevents redundant Calendly link sends

### Why Template Variables?

- **Flexibility**: Can swap pricing tiers without retraining
- **Personalization**: `{{first_name}}` makes messages human
- **Dynamic slots**: `{{time1}}/{{time2}}` always current
- **Multi-brand**: Same prompt works for different `{{brand}}` values

## Monitoring & Debugging

### Key Log Fields

```json
{
  "route": "twilio/inbound",
  "lead_id": "uuid",
  "from": "+1...",
  "intent": "book",
  "needs_intro": false,
  "needs_footer": true,
  "link_gated": false,
  "final_length": 142
}
```

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Generic pricing | Prompt file not loaded | Check `prompts/sms_system_prompt.md` exists |
| Link always sent | Gate query failing | Check `messages_out` has `lead_id` column and data |
| STOP not working | Phone format mismatch | Check `leads.phone` format matches Twilio `From` |
| Footer every message | Footer gating failing | Check `messages_out` query for recent messages |
| JSON parse errors | Model output invalid | Check logs for raw LLM response; may need model upgrade |

### Vercel Logs

```bash
# View live logs
vercel logs --follow

# Filter for inbound webhook
vercel logs | grep "twilio/inbound"
```

## Migration Notes

### From Old System

**Removed:**
- Old inline pricing rules (now in prompt file)
- Hardcoded "who is this" early return (now LLM-powered with "who is this" policy)
- `postProcessSms` function (replaced with new guards)
- `generateWithLLM` function (replaced with JSON contract version)

**Kept:**
- `parseTwilioForm`, `escapeXml` (unchanged)
- `persistOut` (updated to use `lead_id`, adds footer logic)
- STOP/PAUSE/HELP keyword handling (moved earlier in flow)

**Schema Dependencies:**
- `leads`: `id`, `name`, `phone`, `opted_out`, `account_id`
- `messages_out`: `id`, `lead_id`, `account_id`, `body`, `sent_by`, `created_at`
- No new columns required

## Future Enhancements

### Near-Term
1. **Timezone-aware quiet hours**: Replace UTC proxy with proper `tz` lookup from lead or account settings
2. **Lead scoring**: Use `confidence` field to prioritize high-intent leads
3. **Action execution**: Implement `actions[]` handlers (e.g., `create_hold` → Cal.com API)
4. **A/B testing**: Track `intent` distribution to optimize prompt

### Long-Term
1. **Multi-brand support**: Load prompt per `account_id` from DB
2. **Dynamic pricing**: Inject `pricing_range` from account settings, not hardcoded
3. **Sentiment analysis**: Add `sentiment` field to JSON contract
4. **Human handoff**: Implement `escalate_to_human` action → Slack notification

## Rollback Plan

If issues arise:

1. **Revert commit:**
   ```bash
   git revert 3634750
   git push origin main
   ```

2. **Or roll back on Vercel:**
   - Go to https://vercel.com/dashboard
   - Select OutboundRevive project
   - Deployments → find previous deployment → "Promote to Production"

3. **Restore old handler:**
   - Previous version at commit `e525ba3` had working basic system
   - That version had schema fixes but not unified prompt

## Questions?

- **Where is the prompt?** `prompts/sms_system_prompt.md` (or `SMS_SYSTEM_PROMPT` env)
- **How to change pricing?** Edit `prompts/sms_system_prompt.md`, redeploy
- **How to test locally?** `npm run dev`, then `./scripts/test_sms.sh` with `BASE_URL=http://localhost:3000`
- **How to see LLM output?** Check Vercel logs for `"route":"twilio/inbound"` entries

---

**Commit**: `3634750`  
**PR Title**: feat(sms): unify LLM system prompt + strict JSON contract; intro/link/footer gating; quiet-hours caps; tests  
**Date**: 2025-10-29

