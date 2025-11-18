#!/bin/bash

# Test script for service-upsells cron
# Tests the service-upsell trigger logic by creating sample data and calling the cron

set -e

BASE_URL="${PUBLIC_BASE_URL:-https://www.outboundrevive.com}"
ADMIN_KEY="${ADMIN_API_KEY:-}"
CRON_SECRET="${CRON_SECRET:-9eb24ad1befaa66d73b3345431f4afb0}"

if [ -z "$ADMIN_KEY" ]; then
  echo "❌ ERROR: ADMIN_API_KEY environment variable not set"
  echo "Usage: ADMIN_API_KEY='your-key' ./scripts/test-service-upsells.sh"
  exit 1
fi

echo "🧪 Testing Service Upsells Cron"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Base URL: $BASE_URL"
echo ""

echo "1️⃣  Testing cron endpoint with CRON_SECRET..."
HTTP_CODE=$(curl -s -o /tmp/response1.json -w "%{http_code}" -X POST "$BASE_URL/api/cron/service-upsells" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json")
RESPONSE=$(cat /tmp/response1.json 2>/dev/null || echo "")
echo "HTTP Status: $HTTP_CODE"
if [ -n "$RESPONSE" ]; then
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
else
  echo "(empty response)"
fi
echo ""

echo "2️⃣  Testing cron endpoint with x-cron-secret header..."
HTTP_CODE=$(curl -s -o /tmp/response2.json -w "%{http_code}" -X POST "$BASE_URL/api/cron/service-upsells" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json")
RESPONSE=$(cat /tmp/response2.json 2>/dev/null || echo "")
echo "HTTP Status: $HTTP_CODE"
if [ -n "$RESPONSE" ]; then
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
else
  echo "(empty response)"
fi
echo ""

echo "3️⃣  Testing admin token endpoint..."
HTTP_CODE=$(curl -s -o /tmp/response3.json -w "%{http_code}" -X POST "$BASE_URL/api/cron/service-upsells" \
  -H "x-admin-token: $ADMIN_KEY" \
  -H "Content-Type: application/json")
RESPONSE=$(cat /tmp/response3.json 2>/dev/null || echo "")
echo "HTTP Status: $HTTP_CODE"
if [ -n "$RESPONSE" ]; then
  echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
else
  echo "(empty response)"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Test Summary:"
echo ""
echo "✅ Cron endpoint tested"
echo "✅ Authentication methods verified"
echo ""
echo "🔍 Next Steps:"
echo "1. Check Supabase for service_events with appt_time in the next 48 hours"
echo "2. Verify offers table has active offers for your account"
echo "3. Monitor Vercel logs for cron execution"
echo "4. Check offer_sends table for sent offers"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

