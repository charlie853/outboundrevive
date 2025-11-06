# Testing Guide for OutboundRevive

This guide explains how to run and interpret tests for OutboundRevive.

## Quick Reference

```bash
# Run all tests
npm test

# Run smoke test (quick health checks)
npm run test:smoke

# Run specific test file
npx jest tests/inbound.test.ts

# Run with coverage
npm run test:coverage
```

## Test Report

See **[docs/test-audit.md](./docs/test-audit.md)** for a comprehensive audit report covering:
- What works ✅
- What's broken ❌
- What's missing ⚠️
- Prioritized next tasks

## Test Categories

### 1. Inbound SMS Tests
Tests for inbound webhook handling:
- "Who is this?" responses (LLM-generated, not canned)
- Scheduling intent (booking link included)
- Pricing questions
- STOP/PAUSE/HELP/START compliance

**File:** `tests/inbound.test.ts`

### 2. Segments & Caps Tests
Tests for SMS segment counting and monthly caps:
- GSM-7 vs UCS-2 encoding
- Monthly cap enforcement
- 80% warning threshold
- Hard stop at 100%

**File:** `tests/segments-caps.test.ts`

### 3. Threads Tests
Tests for thread completeness:
- Chronological ordering
- All messages visible (inbound + outbound)
- Out-of-order webhook handling
- Account isolation

**File:** `tests/threads.test.ts`

### 4. Follow-ups Tests
Tests for follow-up cadences:
- "Conversation died" logic
- Reminder scheduling
- STOP cancels queued follow-ups
- Context-aware follow-ups

**File:** `tests/followups.test.ts`

### 5. Analytics Tests
Tests for metrics accuracy:
- Replies = unique contacts
- Delivered % = delivered / sent
- Segments = inbound + outbound
- Account scoping

**File:** `tests/analytics.test.ts`

### 6. Isolation Tests
Tests for multi-tenant isolation:
- Account-scoped queries
- RLS policies
- Cross-account data leakage prevention

**File:** `tests/isolation.test.ts`

### 7. Admin Tests
Tests for admin endpoints:
- Resend initial SMS
- Opt-out handling
- E.164 normalization

**File:** `tests/admin.test.ts`

## Environment Setup

Create `.env.test` or export variables:

```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export DEFAULT_ACCOUNT_ID="11111111-1111-1111-1111-111111111111"
export TWILIO_DISABLE=1  # Disable real Twilio sends
```

## Smoke Test

The smoke test performs quick health checks without requiring full test data:

```bash
BASE_URL=https://outboundrevive-z73k.vercel.app npm run test:smoke
```

Checks:
- ✅ Health endpoints (`/api/ok`, `/api/health/sms`)
- ✅ Metrics endpoint structure
- ✅ Thread endpoint structure
- ✅ Billing status endpoint

## Current Status

**Test Coverage:** Scaffold exists, needs implementation

- ✅ Test infrastructure (Jest, helpers, utilities)
- ✅ Test files created (7 test files)
- ✅ Smoke test script
- ⚠️ Test cases are TODOs (need implementation)
- ⚠️ CI integration not set up

See `docs/test-audit.md` for detailed status of each feature area.

## Running Tests Locally

1. **Set up environment:**
   ```bash
   cp .env.example .env.test
   # Edit .env.test with your test credentials
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Check results:**
   - Tests should pass or skip (if not implemented)
   - Check console output for failures
   - Review coverage report if using `--coverage`

## Troubleshooting

**"Missing environment variables":**
- Ensure `.env.test` exists or variables are exported
- Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set

**"Tests timeout":**
- Increase timeout in `jest.config.js` (currently 30s)
- Check network if using production URLs

**"Lead not found":**
- Ensure `DEFAULT_ACCOUNT_ID` matches your test account
- Create test leads manually if needed

**"Test data not cleaned up":**
- Check `afterAll` hooks in test files
- Manually clean up test data in Supabase if needed

## Next Steps

1. **Implement test cases** (fill in TODOs in test files)
2. **Add CI integration** (GitHub Actions / Vercel)
3. **Increase coverage** (target >80%)
4. **Add E2E tests** (critical user flows)

See `docs/test-audit.md` for prioritized task list.

## Related Documentation

- [Test Audit Report](./docs/test-audit.md) - Comprehensive system audit
- [Test README](./tests/README.md) - Detailed test documentation
- [DB Schema](./DB_SCHEMA.sql) - Database schema reference

