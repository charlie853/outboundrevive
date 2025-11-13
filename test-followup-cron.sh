#!/bin/bash

echo "🔍 Testing Follow-Up Cron Jobs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check environment variables
echo "1️⃣  Checking Environment Variables:"
echo ""

if [ -z "$CRON_SECRET" ]; then
  echo "   ❌ CRON_SECRET not set in environment"
  echo "      This is required for Vercel cron jobs to call the endpoints"
else
  echo "   ✅ CRON_SECRET is set"
fi

if [ -z "$ADMIN_API_KEY" ] && [ -z "$ADMIN_TOKEN" ]; then
  echo "   ❌ ADMIN_API_KEY/ADMIN_TOKEN not set"
  echo "      This is required for internal API calls"
else
  echo "   ✅ ADMIN_API_KEY or ADMIN_TOKEN is set"
fi

if [ -z "$PUBLIC_BASE_URL" ]; then
  echo "   ⚠️  PUBLIC_BASE_URL not set (will default to localhost in dev)"
else
  echo "   ✅ PUBLIC_BASE_URL: $PUBLIC_BASE_URL"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "2️⃣  Vercel Cron Configuration (from vercel.json):"
echo ""
echo "   ✅ /api/cron/enroll-followups     - Runs hourly (0 * * * *)"
echo "   ✅ /api/internal/followups/tick   - Runs every 10 minutes (*/10 * * * *)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "3️⃣  Testing Enrollment Endpoint:"
echo ""

BASE_URL="https://www.outboundrevive.com"
ADMIN_KEY="${ADMIN_API_KEY:-${ADMIN_TOKEN}}"

if [ -z "$ADMIN_KEY" ]; then
  echo "   ⚠️  Cannot test - ADMIN_API_KEY/ADMIN_TOKEN not set"
  echo ""
  echo "   To test manually, run:"
  echo "   curl -X POST $BASE_URL/api/cron/enroll-followups \\"
  echo "     -H 'x-admin-token: YOUR_ADMIN_KEY'"
else
  echo "   Making request to: $BASE_URL/api/cron/enroll-followups"
  RESPONSE=$(curl -s -X POST "$BASE_URL/api/cron/enroll-followups" \
    -H "x-admin-token: $ADMIN_KEY" \
    -H "Content-Type: application/json")
  
  echo "   Response:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "4️⃣  Testing Follow-Up Tick (sends the actual messages):"
echo ""

if [ -z "$ADMIN_KEY" ]; then
  echo "   ⚠️  Cannot test - ADMIN_API_KEY/ADMIN_TOKEN not set"
  echo ""
  echo "   To test manually, run:"
  echo "   curl -X POST $BASE_URL/api/internal/followups/tick \\"
  echo "     -H 'x-admin-token: YOUR_ADMIN_KEY' \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"limit\": 5}'"
else
  echo "   Making request to: $BASE_URL/api/internal/followups/tick"
  RESPONSE=$(curl -s -X POST "$BASE_URL/api/internal/followups/tick" \
    -H "x-admin-token: $ADMIN_KEY" \
    -H "Content-Type: application/json" \
    -d '{"limit": 5}')
  
  echo "   Response:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ REQUIRED VERCEL ENVIRONMENT VARIABLES:"
echo ""
echo "   1. CRON_SECRET - For Vercel cron authentication"
echo "   2. ADMIN_API_KEY or ADMIN_TOKEN - For internal API calls"
echo "   3. PUBLIC_BASE_URL - Your production URL"
echo ""
echo "   Add these in: https://vercel.com/your-project/settings/environment-variables"
echo ""
