# Fixes Applied (2025-10-29)

## Issues Fixed

### 1. ✅ **Test Script Compatibility**
**Problem**: Test script failing with `grep: invalid option -- P`  
**Cause**: macOS uses BSD grep, not GNU grep (no `-P` Perl regex support)  
**Fix**: Changed `grep -oP` to `sed -n` pattern matching  
**File**: `scripts/test_sms.sh`

### 2. ✅ **24h Link Gate Removed**
**Problem**: User wants booking links sent every time, not gated by 24h rule  
**Fix**: 
- Set `linkGateHit = false` (line 528 in inbound.ts)
- Updated prompt: removed "at most once per 24h" restriction
- Links now sent whenever scheduling intent detected  
**Files**: `pages/api/webhooks/twilio/inbound.ts`, `prompts/sms_system_prompt.md`

### 3. ✅ **"Auto Pro" Renamed to "Pro"**
**Problem**: User wants simpler tier name  
**Fix**: Changed all references from "Auto Pro" to "Pro" in pricing section  
**File**: `prompts/sms_system_prompt.md`

### 4. ✅ **Repeating Fallback Message Debug**
**Problem**: Bot repeating "Can I help with booking or pricing?" instead of reading messages  
**Cause**: Likely LLM call failing or JSON parsing issues  
**Fix**: Added extensive debug logging:
- Prompt loading confirmation (length + first 200 chars)
- OpenAI API call status (model, context preview)
- Raw LLM response (first 200 chars)
- JSON parse success/failure with details
- Explicit JSON structure reminder in system prompt
- Increased `max_tokens` from 300 to 400
- Added try/catch with detailed error logging

**What to Check**:
After deployment, check Vercel logs for:
```
System prompt loaded, length: XXXX, first 200 chars: ...
Calling OpenAI with model: gpt-4o-mini, context: ...
LLM raw response (attempt 1): {"intent":"...
Successfully parsed LLM output: {"intent":"...", "msg_len":...}
```

If you see:
- `"OPENAI_API_KEY missing"` → API key not set in env
- `"OpenAI API error: 401"` → Invalid API key
- `"LLM JSON parse failed"` → Model returning invalid JSON (see raw response)
- `"Parsed JSON but no message field"` → Model not following contract
- `"LLM failed after 2 attempts"` → Using fallback message

## How to Test

### 1. Wait for Vercel Deployment
Check: https://vercel.com/dashboard (~1-2 minutes)

### 2. Run Test Suite (Fixed)
```bash
cd /Users/charliefregozo/OutboundRevive
export BASE_URL="https://outboundrevive-z73k.vercel.app"
./scripts/test_sms.sh
```

Should now work on macOS without grep errors.

### 3. Manual Test (Check Real Responses)
```bash
# Test pricing
curl -X POST "https://outboundrevive-z73k.vercel.app/api/webhooks/twilio/inbound" \
  -d "From=%2B14155551234&To=%2B14155556789&Body=how+much+does+this+cost"

# Test scheduling  
curl -X POST "https://outboundrevive-z73k.vercel.app/api/webhooks/twilio/inbound" \
  -d "From=%2B14155551234&To=%2B14155556789&Body=book+a+call"

# Test general question
curl -X POST "https://outboundrevive-z73k.vercel.app/api/webhooks/twilio/inbound" \
  -d "From=%2B14155551234&To=%2B14155556789&Body=tell+me+about+your+service"
```

### 4. Check Logs
```bash
vercel logs --follow
# or
vercel logs | grep "LLM output"
```

## Expected Behavior Now

| Scenario | Before | After |
|----------|--------|-------|
| **Booking request** | Link only first time in 24h | Link sent every time |
| **Pricing question** | "Can I help..." (fallback) | "$299-$599/mo + details" |
| **General question** | "Can I help..." (fallback) | Contextual response from LLM |
| **Tier name** | "Auto Pro" | "Pro" |
| **Test script** | Fails on macOS | Works on macOS/Linux |

## Next Steps

1. **Monitor logs** after deployment for 5-10 test messages
2. **Check if LLM is being called** (look for "Calling OpenAI with model:")
3. **Verify responses are contextual** (not just fallback)
4. **If still seeing fallback**, check for:
   - Missing `OPENAI_API_KEY` in Vercel env vars
   - Invalid API key (401 errors)
   - Model name issues (should be `gpt-4o-mini` or `gpt-4o`)
   - Prompt file not loading (check "System prompt loaded, length:" in logs)

## Rollback Plan

If issues persist:
```bash
git revert a4ec7ad
git push origin main
```

Or use Vercel dashboard → Deployments → promote previous version (`47ee327`)

## Environment Variables to Verify

Make sure these are set in Vercel:
- ✅ `OPENAI_API_KEY` (required)
- ✅ `SUPABASE_URL` (required)
- ✅ `SUPABASE_SERVICE_ROLE_KEY` (required)
- ✅ `DEFAULT_ACCOUNT_ID` (required)
- ✅ `CAL_BOOKING_URL` or `CAL_PUBLIC_URL` (your Calendly link)
- 🔧 `LLM_MODEL` (optional, defaults to `gpt-4o-mini`)
- 🔧 `BRAND` (optional, defaults to `OutboundRevive`)
- 🔧 `SMS_SYSTEM_PROMPT` (optional, uses file if not set)

---

**Commit**: `a4ec7ad`  
**Deployed**: 2025-10-29  
**Status**: 🚀 Deploying to Vercel...

