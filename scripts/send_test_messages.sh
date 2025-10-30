#!/bin/bash

# Send initial outreach to test leads
# Paul Anderson: +12062959002
# Scott McCarthy: +14152655001

BASE_URL="https://outboundrevive-z73k.vercel.app"

# Get credentials from .env
source .env 2>/dev/null || true

ADMIN_TOKEN="${ADMIN_API_KEY:-${ADMIN_TOKEN}}"
ACCOUNT_ID="${DEFAULT_ACCOUNT_ID}"

if [ -z "$ADMIN_TOKEN" ]; then
  echo "❌ Error: ADMIN_API_KEY or ADMIN_TOKEN not found in .env"
  exit 1
fi

if [ -z "$ACCOUNT_ID" ]; then
  echo "❌ Error: DEFAULT_ACCOUNT_ID not found in .env"
  exit 1
fi

# Initial outreach message
MESSAGE="Hey—it's Charlie from OutboundRevive. Quick check-in: would you like pricing, a 2-min overview, or a quick call link?"

echo "📱 Sending initial outreach messages..."
echo "Message: $MESSAGE"
echo ""

# Send to Paul Anderson
echo "🔵 Sending to Paul Anderson (+12062959002)..."
PAUL_RESPONSE=$(curl -s -X POST "$BASE_URL/api/sms/send" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d "{
    \"account_id\": \"$ACCOUNT_ID\",
    \"message\": \"$MESSAGE\",
    \"leadIds\": [],
    \"gate_context\": \"initial_outreach\",
    \"phone\": \"+12062959002\",
    \"name\": \"Paul Anderson\"
  }")

echo "$PAUL_RESPONSE" | jq '.' 2>/dev/null || echo "$PAUL_RESPONSE"
echo ""

# Wait 2 seconds between sends
sleep 2

# Send to Scott McCarthy
echo "🔵 Sending to Scott McCarthy (+14152655001)..."
SCOTT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/sms/send" \
  -H "Content-Type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d "{
    \"account_id\": \"$ACCOUNT_ID\",
    \"message\": \"$MESSAGE\",
    \"leadIds\": [],
    \"gate_context\": \"initial_outreach\",
    \"phone\": \"+14152655001\",
    \"name\": \"Scott McCarthy\"
  }")

echo "$SCOTT_RESPONSE" | jq '.' 2>/dev/null || echo "$SCOTT_RESPONSE"
echo ""

echo "✅ Messages sent! Check your dashboard or threads for responses."

