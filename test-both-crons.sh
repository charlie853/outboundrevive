#!/bin/bash

BASE_URL="https://www.outboundrevive.com"
ADMIN_KEY="8355ea299aac55d849aa4d54acf9134758f931106edddac70472cc98880cb085"

echo "🔍 Testing OutboundRevive Cron Jobs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: CRM Sync
echo "1️⃣  Testing CRM Sync (Hourly)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Endpoint: $BASE_URL/api/cron/sync-crm"
echo "   Schedule: Every hour (0 * * * *)"
echo ""

RESPONSE_CRM=$(curl -s -X POST "$BASE_URL/api/cron/sync-crm" \
  -H "x-admin-token: $ADMIN_KEY" \
  -H "Content-Type: application/json")

echo "   Response:"
echo "$RESPONSE_CRM" | jq '.' 2>/dev/null || echo "$RESPONSE_CRM"
echo ""

# Check if successful
if echo "$RESPONSE_CRM" | jq -e '.ok == true' >/dev/null 2>&1; then
  echo "   ✅ CRM Sync is working!"
  SYNCED=$(echo "$RESPONSE_CRM" | jq -r '.accounts_synced // 0')
  echo "   📊 Accounts synced: $SYNCED"
else
  echo "   ❌ CRM Sync failed"
  ERROR=$(echo "$RESPONSE_CRM" | jq -r '.error // "unknown"')
  echo "   Error: $ERROR"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 2: Follow-Up Enrollment
echo "2️⃣  Testing Follow-Up Enrollment (Hourly)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Endpoint: $BASE_URL/api/cron/enroll-followups"
echo "   Schedule: Every hour (0 * * * *)"
echo ""

RESPONSE_ENROLL=$(curl -s -X POST "$BASE_URL/api/cron/enroll-followups" \
  -H "x-admin-token: $ADMIN_KEY" \
  -H "Content-Type: application/json")

echo "   Response:"
echo "$RESPONSE_ENROLL" | jq '.' 2>/dev/null || echo "$RESPONSE_ENROLL"
echo ""

# Check if successful
if echo "$RESPONSE_ENROLL" | jq -e '.ok == true' >/dev/null 2>&1; then
  echo "   ✅ Follow-Up Enrollment is working!"
  ENROLLED=$(echo "$RESPONSE_ENROLL" | jq -r '.enrolled // 0')
  SKIPPED=$(echo "$RESPONSE_ENROLL" | jq -r '.skipped // 0')
  echo "   📊 Enrolled: $ENROLLED, Skipped: $SKIPPED"
else
  echo "   ❌ Follow-Up Enrollment failed"
  ERROR=$(echo "$RESPONSE_ENROLL" | jq -r '.error // .detail // "unknown"')
  echo "   Error: $ERROR"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 3: Follow-Up Tick (sends the messages)
echo "3️⃣  Testing Follow-Up Tick (Every 10 minutes)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Endpoint: $BASE_URL/api/internal/followups/tick"
echo "   Schedule: Every 10 minutes (*/10 * * * *)"
echo ""

RESPONSE_TICK=$(curl -s -X POST "$BASE_URL/api/internal/followups/tick" \
  -H "x-admin-token: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}')

echo "   Response:"
echo "$RESPONSE_TICK" | jq '.' 2>/dev/null || echo "$RESPONSE_TICK"
echo ""

# Check if successful
if echo "$RESPONSE_TICK" | jq -e '.ok == true' >/dev/null 2>&1; then
  echo "   ✅ Follow-Up Tick is working!"
  PICKED=$(echo "$RESPONSE_TICK" | jq -r '.picked // 0')
  PROCESSED=$(echo "$RESPONSE_TICK" | jq -r '.processed // 0')
  echo "   📊 Picked: $PICKED, Processed: $PROCESSED"
else
  echo "   ❌ Follow-Up Tick failed"
  ERROR=$(echo "$RESPONSE_TICK" | jq -r '.error // .detail // "unknown"')
  echo "   Error: $ERROR"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# CRM Status
if echo "$RESPONSE_CRM" | jq -e '.ok == true' >/dev/null 2>&1; then
  echo "✅ CRM Sync: Working"
else
  echo "❌ CRM Sync: Failed"
fi

# Enrollment Status
if echo "$RESPONSE_ENROLL" | jq -e '.ok == true' >/dev/null 2>&1; then
  echo "✅ Follow-Up Enrollment: Working"
  if [ "$(echo "$RESPONSE_ENROLL" | jq -r '.enrolled // 0')" -gt 0 ]; then
    echo "   💡 $(echo "$RESPONSE_ENROLL" | jq -r '.enrolled') lead(s) enrolled in follow-up sequences"
  else
    echo "   💡 No leads need follow-up yet (conversations haven't died)"
  fi
else
  echo "❌ Follow-Up Enrollment: Failed"
  echo "   $(echo "$RESPONSE_ENROLL" | jq -r '.error // .detail // "Check database tables"')"
fi

# Tick Status
if echo "$RESPONSE_TICK" | jq -e '.ok == true' >/dev/null 2>&1; then
  echo "✅ Follow-Up Tick: Working"
  if [ "$(echo "$RESPONSE_TICK" | jq -r '.processed // 0')" -gt 0 ]; then
    echo "   💡 $(echo "$RESPONSE_TICK" | jq -r '.processed') follow-up message(s) sent"
  else
    echo "   💡 No follow-ups due yet (check next_at times in database)"
  fi
else
  echo "❌ Follow-Up Tick: Failed"
  echo "   $(echo "$RESPONSE_TICK" | jq -r '.error // .detail // "Check database tables"')"
fi

echo ""
echo "🔔 Next Steps:"
echo "   - Cron jobs run automatically via Vercel"
echo "   - CRM Sync: Hourly at :00 minutes"
echo "   - Follow-Up Enrollment: Hourly at :00 minutes"
echo "   - Follow-Up Tick: Every 10 minutes"
echo ""
echo "   Monitor in Vercel: Deployments → Functions tab"
echo ""
