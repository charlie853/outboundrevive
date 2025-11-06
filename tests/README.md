# OutboundRevive Test Suite

This directory contains integration tests for the OutboundRevive SMS follow-up service.

## Quick Start

```bash
# Install dependencies (if not already done)
npm install

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run smoke test (quick health checks)
npm run test:smoke
```

## Test Files

- `inbound.test.ts` - Inbound SMS handling (who is this, scheduling, pricing, STOP/PAUSE)
- `segments-caps.test.ts` - Segment counting and monthly caps
- `threads.test.ts` - Thread completeness and ordering
- `followups.test.ts` - Follow-up cadences and "conversation died" logic
- `analytics.test.ts` - Analytics accuracy (replies, delivered %, segments)
- `isolation.test.ts` - Multi-tenant isolation (RLS and account_id scoping)
- `admin.test.ts` - Admin resend endpoint
- `integration.test.ts` - Legacy scaffold (can be removed once other tests are complete)

## Environment Variables

Tests require the following environment variables:

```bash
# Required
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEFAULT_ACCOUNT_ID=11111111-1111-1111-1111-111111111111

# Optional (for full integration tests)
OPENAI_API_KEY=your-openai-key
BASE_URL=http://localhost:3000  # or production URL
CAL_BOOKING_URL=https://cal.com/test
BRAND=TestBrand

# Disable real Twilio sends in tests
TWILIO_DISABLE=1
```

Create a `.env.test` file or export these variables before running tests.

## Running Individual Tests

```bash
# Run a specific test file
npx jest tests/inbound.test.ts

# Run tests matching a pattern
npx jest -t "who is this"

# Run with verbose output
npx jest --verbose
```

## Test Structure

Each test file follows this pattern:

1. **Setup** (`beforeAll`) - Create test data (leads, messages)
2. **Tests** - Run test cases
3. **Cleanup** (`afterAll`) - Remove test data

Tests use helper utilities from `tests/helpers/test-utils.ts`:

- `getSupabaseAdmin()` - Get Supabase admin client
- `createTestLead()` - Create a test lead
- `cleanupTestLead()` - Clean up test data
- `simulateTwilioWebhook()` - Simulate Twilio inbound webhook
- `parseTwiML()` - Parse TwiML response
- `extractBookingLink()` - Extract booking link from message

## Smoke Test

The smoke test (`scripts/smoke-test.sh`) performs quick health checks:

- Health endpoints
- Metrics endpoint
- Thread endpoint structure
- Billing status endpoint

Run it with:

```bash
BASE_URL=https://outboundrevive-z73k.vercel.app npm run test:smoke
```

## Writing New Tests

1. Create a new test file in `tests/`
2. Import test utilities from `tests/helpers/test-utils.ts`
3. Use `beforeAll` to set up test data
4. Use `afterAll` to clean up test data
5. Write descriptive test cases with `it()` blocks

Example:

```typescript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { getSupabaseAdmin, createTestLead, cleanupTestLead, TEST_ACCOUNT_ID } from './helpers/test-utils';

describe('My Feature', () => {
  let testLeadId: string;

  beforeAll(async () => {
    const lead = await createTestLead(supabase, TEST_ACCOUNT_ID, '+14155551234', 'Test Lead');
    testLeadId = lead.id;
  });

  afterAll(async () => {
    if (testLeadId) {
      await cleanupTestLead(supabase, testLeadId);
    }
  });

  it('should do something', async () => {
    // Test implementation
    expect(true).toBe(true);
  });
});
```

## CI Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test
  env:
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
    DEFAULT_ACCOUNT_ID: ${{ secrets.DEFAULT_ACCOUNT_ID }}
    TWILIO_DISABLE: 1
```

## Test Coverage

Current coverage is **scaffold only** - tests need to be implemented. See `docs/test-audit.md` for detailed status.

## Troubleshooting

**Tests fail with "Missing SUPABASE_URL":**
- Set environment variables before running tests
- Create `.env.test` file with required variables

**Tests fail with "Lead not found":**
- Ensure `DEFAULT_ACCOUNT_ID` matches your test account
- Check that test data cleanup is working (may need manual cleanup)

**Tests timeout:**
- Increase timeout in `jest.config.js` or individual test files
- Check network connectivity if using production URLs

## Next Steps

1. Implement test cases (fill in TODOs)
2. Add CI integration
3. Increase test coverage to >80%
4. Add E2E tests for critical flows

See `docs/test-audit.md` for comprehensive audit and prioritized next tasks.

