#!/bin/bash

# Simple test script for follow-up endpoints
# Usage: ./scripts/test-followups-simple.sh YOUR_ADMIN_KEY

set -e

ADMIN_KEY="${1:-${ADMIN_API_KEY:-${ADMIN_TOKEN}}}"
BASE_URL="${PUBLIC_BASE_URL:-https://www.outboundrevive.com}"

if [ -z "$ADMIN_KEY" ]; then
  echo "❌ ERROR: No admin key provided"
  echo ""
  echo "Usage:"
  echo "  ./scripts/test-followups-simple.sh YOUR_ADMIN_KEY"
  echo ""
  echo "Or set environment variable:"
  echo "  export ADMIN_API_KEY='your-key'"
  echo "  ./scripts/test-followups-simple.sh"
  echo ""
  echo "To find your key, check Vercel environment variables:"
  echo "  https://vercel.com/your-project/settings/environment-variables"
  exit 1
fi

echo "🧪 Testing Follow-Up Endpoints"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Base URL: $BASE_URL"
echo "Using admin key: ${ADMIN_KEY:0:20}..."  # Show first 20 chars
echo ""

# Test 1: Enrollment
echo "1️⃣  Testing Enrollment Endpoint..."
echo ""
ENROLL_RESPONSE=$(curl -s -X POST "$BASE_URL/api/cron/enroll-followups" \
  -H "x-admin-token: $ADMIN_KEY" \
  -H "Content-Type: application/json")

if echo "$ENROLL_RESPONSE" | grep -q '"ok"'; then
  echo "✅ SUCCESS"
  echo "$ENROLL_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$ENROLL_RESPONSE"
else
  echo "❌ FAILED"
  echo "Response: $ENROLL_RESPONSE"
  if echo "$ENROLL_RESPONSE" | grep -q "Unauthorized"; then
    echo ""
    echo "⚠️  Authentication failed. Check:"
    echo "   - Your ADMIN_API_KEY matches the one in Vercel"
    echo "   - The key has no extra spaces or quotes"
    echo "   - Try: echo \$ADMIN_API_KEY | wc -c  (should show key length)"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 2: Tick
echo "2️⃣  Testing Follow-Up Tick (sends messages)..."
echo ""
TICK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/internal/followups/tick" \
  -H "x-admin-token: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}')

if echo "$TICK_RESPONSE" | grep -q '"ok"'; then
  echo "✅ SUCCESS"
  echo "$TICK_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$TICK_RESPONSE"
else
  echo "❌ FAILED"
  echo "Response: $TICK_RESPONSE"
  if echo "$TICK_RESPONSE" | grep -q "unauthorized"; then
    echo ""
    echo "⚠️  Authentication failed. Check your ADMIN_API_KEY"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""


