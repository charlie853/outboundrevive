# OutboundRevive Test & Audit Report

**Generated:** 2025-01-XX  
**Scope:** End-to-end system audit and test coverage  
**Status:** In Progress

---

## Executive Summary

This document provides a comprehensive audit of the OutboundRevive SMS follow-up service, covering all major flows, identifying gaps, and documenting what works vs. what needs attention.

### Overall Status

- ✅ **Core SMS Flow:** Working (inbound → AI reply → TwiML)
- ✅ **Segment Counting:** Implemented (GSM-7/UCS-2)
- ✅ **Multi-tenant Isolation:** account_id scoping in place
- ⚠️ **Follow-up Cadences:** Partially implemented (needs UI)
- ⚠️ **Calendar Webhooks:** Endpoints exist, needs full testing
- ⚠️ **RLS Policies:** Not fully enabled (data isolation via code)
- ❌ **Integration Tests:** Scaffold exists, needs implementation

---

## 1. Inbound SMS → AI Reply → TwiML

### Status: ✅ **Working**

**What Works:**
- Inbound webhook handler (`pages/api/webhooks/twilio/inbound.ts`) processes Twilio form data
- LLM generates contextual replies (no canned responses)
- "Who is this?" returns natural, brand-voiced explanation
- Scheduling intent includes booking link (last in message)
- Pricing questions use tenant pricing, <320 chars
- STOP/PAUSE/HELP/START handled correctly
- TwiML response format is valid
- Post-processing: link last, whitespace normalized, length clamped

**Gaps Found:**
- Footer gating logic exists but needs verification of 30-day rule
- E.164 normalization is in place but could be more robust for edge cases
- No automated test coverage for inbound webhook (tests scaffolded)

**Test Results:**
- Manual tests: ✅ PASS
- Automated tests: ⚠️ PARTIAL (scaffold exists in `tests/inbound.test.ts`)

---

## 2. Follow-ups, "Conversation Died", Cadences

### Status: ⚠️ **Partially Working**

**What Works:**
- Follow-up tick endpoint exists (`app/api/internal/followups/tick/route.ts`)
- Conversation state checking (`getConversationState`) implemented
- STOP/PAUSE cancels queued `cadence_runs`
- Reminder logic respects daily/weekly caps
- Context-aware follow-ups (reads prior thread)

**Gaps Found:**
- ❌ **No UI for cadence configuration** (`account_followup_prefs` table exists but no UI)
- ⚠️ "Conversation died" threshold not clearly documented (defaults to 24-48h?)
- ⚠️ No test coverage for follow-up timing logic
- ⚠️ Cadence scheduling logic needs verification with realistic data

**Test Results:**
- Manual tests: ⚠️ PARTIAL (endpoint exists, needs end-to-end verification)
- Automated tests: ⚠️ PARTIAL (scaffold in `tests/followups.test.ts`)

**Recommended Next Steps:**
1. Build UI for `account_followup_prefs` (follow-ups page exists but needs wiring)
2. Add integration test that creates lead, sends initial, waits, verifies reminder
3. Document "conversation died" thresholds clearly

---

## 3. Segments & Monthly Caps

### Status: ✅ **Working**

**What Works:**
- Segment counting implemented (`lib/messaging/segments.ts`)
- GSM-7 and UCS-2 encoding handled correctly
- Monthly caps enforced in `app/api/sms/send/route.ts`
- 80% warning threshold implemented
- Hard stop at 100% cap
- Inbound segments count toward cap (inbound webhook updates `tenant_billing`)
- Outbound segments count toward cap (send route updates `tenant_billing`)

**Gaps Found:**
- ⚠️ Monthly reset job exists (`app/api/cron/billing/reset/route.ts`) but needs cron verification
- ⚠️ No test for billing cycle reset
- ⚠️ Cap warning notification (dashboard shows but no email/webhook?)

**Test Results:**
- Manual tests: ✅ PASS
- Automated tests: ⚠️ PARTIAL (scaffold in `tests/segments-caps.test.ts`)

**Recommended Next Steps:**
1. Add integration test for monthly reset
2. Verify cron job is scheduled in Vercel
3. Add notification channel for 80% warning (email/webhook)

---

## 4. Threads Page

### Status: ✅ **Working**

**What Works:**
- Thread endpoint (`app/api/ui/leads/[id]/thread/route.ts`) merges inbound and outbound
- Messages sorted chronologically (timestamp + direction tiebreaker)
- All messages visible (no missing inbound/outbound)
- E.164 normalization prevents lookup failures
- Account-scoped queries prevent cross-tenant bleed

**Gaps Found:**
- ⚠️ No test for out-of-order webhook handling (idempotency)
- ⚠️ No test for rapid-fire inbound messages (race conditions)
- ⚠️ Thread UI might not handle very long threads efficiently (pagination?)

**Test Results:**
- Manual tests: ✅ PASS
- Automated tests: ⚠️ PARTIAL (scaffold in `tests/threads.test.ts`)

**Recommended Next Steps:**
1. Add test for duplicate webhook handling (idempotency by `provider_sid`)
2. Test with 100+ messages per thread
3. Verify pagination if threads get very long

---

## 5. Analytics & Dashboard

### Status: ✅ **Working**

**What Works:**
- Metrics endpoint (`pages/api/metrics.ts`) scoped by `account_id`
- Replies = unique contacts (fixed: now counts unique `lead_id`s)
- Delivered % = delivered / sent (excludes queued)
- Segments KPI = inbound + outbound segments
- Charts structure exists (delivery over time, replies per day)
- Dashboard UI displays KPIs

**Gaps Found:**
- ⚠️ Charts data is minimal (single data point, needs time-series)
- ⚠️ Dashboard theme matching not verified (homepage vs dashboard)
- ⚠️ Funnel visualization not implemented
- ⚠️ Heatmap, carrier breakdown, intents endpoints exist but not wired to UI

**Test Results:**
- Manual tests: ✅ PASS (basic KPIs)
- Automated tests: ⚠️ PARTIAL (scaffold in `tests/analytics.test.ts`)

**Recommended Next Steps:**
1. Build time-series charts (daily buckets)
2. Wire heatmap/carrier/intents endpoints to dashboard
3. Verify dashboard theme matches homepage
4. Add funnel visualization

---

## 6. Booking Link & Calendar

### Status: ⚠️ **Partially Working**

**What Works:**
- Booking link resolver (`lib/config.ts`) uses tenant booking URL
- Link always placed last in SMS
- Calendar webhook endpoints exist:
  - `app/api/webhooks/calendar/calcom/route.ts`
  - `app/api/webhooks/calendar/calendly/route.ts`
- `appointments` table exists
- Lead booking status updates

**Gaps Found:**
- ❌ **No test coverage for calendar webhooks**
- ⚠️ Booking lifecycle (booked → kept → no-show) not fully tested
- ⚠️ Calendar webhook authentication not verified
- ⚠️ No test for booking link fallback logic

**Test Results:**
- Manual tests: ⚠️ NOT TESTED
- Automated tests: ❌ MISSING

**Recommended Next Steps:**
1. Test Cal.com webhook with real events
2. Test Calendly webhook with real events
3. Verify booking status updates in threads
4. Test booking link fallback when tenant booking URL not set

---

## 7. Multi-tenant & Safety (Data Isolation)

### Status: ✅ **Working (Code-level)**

**What Works:**
- All queries scoped by `account_id`
- No cross-tenant data access in code paths
- Account-scoped: leads, messages, billing, cadences, appointments

**Gaps Found:**
- ❌ **RLS policies not fully enabled** (relying on code-level scoping)
- ⚠️ No integration test for RLS bypass attempts
- ⚠️ Service role key bypasses RLS (expected, but should be documented)

**Test Results:**
- Manual tests: ✅ PASS (code review confirms scoping)
- Automated tests: ⚠️ PARTIAL (scaffold in `tests/isolation.test.ts`)

**Recommended Next Steps:**
1. Enable RLS policies on all tables (see `sql/2025-10-30_rls_expand.sql`)
2. Add integration test that verifies RLS blocks cross-account access
3. Document service role key usage (admin-only)

---

## 8. Admin Tools & Resend Initial

### Status: ✅ **Working**

**What Works:**
- Admin resend endpoint exists (`pages/api/admin/leads/resend-initial.ts`)
- Honors opt-out state
- E.164 normalization
- Logs reason for resend

**Gaps Found:**
- ⚠️ No test coverage
- ⚠️ Admin authentication not verified (should use service role key)

**Test Results:**
- Manual tests: ⚠️ NOT TESTED
- Automated tests: ⚠️ PARTIAL (scaffold in `tests/admin.test.ts`)

**Recommended Next Steps:**
1. Add integration test for admin resend
2. Verify admin authentication (service role key required)
3. Test with various phone formats

---

## 9. Test Infrastructure

### Status: ⚠️ **Scaffold Exists**

**What Exists:**
- Jest configuration (`jest.config.js`)
- Test setup (`tests/setup.ts`)
- Test utilities (`tests/helpers/test-utils.ts`)
- Test files scaffolded:
  - `tests/inbound.test.ts`
  - `tests/segments-caps.test.ts`
  - `tests/threads.test.ts`
  - `tests/followups.test.ts`
  - `tests/analytics.test.ts`
  - `tests/isolation.test.ts`
  - `tests/admin.test.ts`
- Smoke test script (`scripts/smoke-test.sh`)

**Gaps Found:**
- ❌ **Tests are mostly TODOs** (scaffold only)
- ❌ No CI integration
- ⚠️ Test environment variables not documented
- ⚠️ No test data seeding strategy

**Recommended Next Steps:**
1. Implement test cases (fill in TODOs)
2. Add CI integration (GitHub Actions / Vercel)
3. Document test environment setup
4. Create test data seeding scripts

---

## 10. Missing Features vs. Spec

### High Priority Gaps

1. **Follow-up Cadence UI** ❌
   - Table exists (`account_followup_prefs`)
   - Backend API exists (`app/api/ui/followups/prefs/route.ts`)
   - UI page exists (`app/followups/page.tsx`) but needs wiring
   - **Impact:** Users can't configure follow-up timing

2. **Calendar Webhook Testing** ❌
   - Endpoints exist but not tested
   - **Impact:** Booking status updates may not work

3. **RLS Policies** ❌
   - Migration exists but not applied
   - **Impact:** Data isolation relies on code (less secure)

4. **Integration Test Suite** ❌
   - Scaffold exists but not implemented
   - **Impact:** No automated regression testing

### Medium Priority Gaps

5. **Dashboard Charts** ⚠️
   - Time-series data not implemented
   - Funnel visualization missing
   - **Impact:** Limited analytics insights

6. **Monthly Reset Job** ⚠️
   - Cron exists but needs verification
   - **Impact:** Caps may not reset monthly

7. **Billing Upgrade Flow** ⚠️
   - Stripe integration exists but needs end-to-end test
   - **Impact:** Users may not be able to upgrade

### Low Priority Gaps

8. **Heatmap/Carrier Breakdown UI** ⚠️
   - Endpoints exist but not wired
   - **Impact:** Advanced analytics not visible

9. **Test Coverage** ⚠️
   - Most tests are TODOs
   - **Impact:** Risk of regressions

---

## 11. Prioritized Next Tasks

### Immediate (Week 1)
1. ✅ **Enable RLS policies** (run `sql/2025-10-30_rls_expand.sql`)
2. ✅ **Wire follow-up cadence UI** (connect `app/followups/page.tsx` to API)
3. ✅ **Test calendar webhooks** (Cal.com + Calendly with real events)
4. ✅ **Verify monthly reset cron** (check Vercel cron config)

### Short-term (Week 2-3)
5. ✅ **Implement integration tests** (fill in TODOs in test files)
6. ✅ **Build time-series charts** (update `pages/api/metrics.ts` to bucket by day)
7. ✅ **Add funnel visualization** (new endpoint + UI component)
8. ✅ **Test billing upgrade flow** (end-to-end Stripe checkout)

### Medium-term (Month 1)
9. ✅ **Wire heatmap/carrier/intents** (connect endpoints to dashboard)
10. ✅ **Add CI integration** (GitHub Actions for tests)
11. ✅ **Document test environment** (README for running tests)
12. ✅ **Verify dashboard theme** (match homepage styling)

---

## 12. Test Execution

### Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run specific test file
npx jest tests/inbound.test.ts

# Run smoke test
chmod +x scripts/smoke-test.sh
BASE_URL=https://outboundrevive-z73k.vercel.app ./scripts/smoke-test.sh
```

### Environment Variables Required

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEFAULT_ACCOUNT_ID=11111111-1111-1111-1111-111111111111
OPENAI_API_KEY=your-openai-key (optional for tests)
BASE_URL=http://localhost:3000 (or production URL)
```

---

## 13. Assumptions & Notes

### Assumptions Made During Audit

1. **Segment Counting:** Both inbound and outbound segments count toward monthly cap (verified in code)
2. **Conversation Died:** Default threshold is 24-48 hours (not explicitly documented)
3. **Billing Cycle:** Monthly reset happens on the 1st of each month (needs verification)
4. **RLS:** Currently disabled, relying on code-level scoping (needs migration)
5. **Footer Gating:** 30-day rule is enforced (needs verification with test data)

### Conservative Choices

- Tests assume `TWILIO_DISABLE=1` to avoid real SMS sends
- Tests use service role key (bypasses RLS) for setup/teardown
- Smoke tests check endpoint availability, not full functionality

---

## 14. Conclusion

OutboundRevive has a **solid foundation** with core SMS flows working correctly. The main gaps are:

1. **Test Coverage** (scaffold exists, needs implementation)
2. **UI Completion** (follow-up cadence settings)
3. **RLS Policies** (migration exists, needs application)
4. **Calendar Webhook Testing** (endpoints exist, needs verification)

**Recommendation:** Focus on the immediate tasks (Week 1) to close the highest-priority gaps, then build out test coverage to prevent regressions.

---

**Last Updated:** 2025-01-XX  
**Next Review:** After implementing Week 1 tasks

