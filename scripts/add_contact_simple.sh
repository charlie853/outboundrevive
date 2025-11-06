#!/bin/bash
# Quick script to add contact and send initial text
# Usage: ./scripts/add_contact_simple.sh

set -e

# Load env vars if .env.local exists
if [ -f .env.local ]; then
  export $(cat .env.local | grep -v '^#' | xargs)
fi

BASE_URL="${PUBLIC_BASE_URL:-http://localhost:3000}"
NAME="Charlie Fregozo"
PHONE="8183709444"
PHONE_E164="+18183709444"

echo "📋 Adding contact: $NAME ($PHONE_E164)..."

# Step 1: Create/upsert lead via API
echo "  Creating lead..."
LEAD_RESPONSE=$(curl -s -X POST "$BASE_URL/api/leads" \
  -H "Content-Type: application/json" \
  -d "[{\"name\":\"$NAME\",\"phone\":\"$PHONE\"}]")

echo "  Response: $LEAD_RESPONSE"

# Extract lead ID (assuming response has sample array)
LEAD_ID=$(echo $LEAD_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$LEAD_ID" ]; then
  echo "  ⚠️  Could not extract lead ID. Trying to get from /api/leads list..."
  LEADS_LIST=$(curl -s "$BASE_URL/api/leads?limit=10")
  LEAD_ID=$(echo $LEADS_LIST | grep -o "\"id\":\"[^\"]*\",\"name\":\"$NAME\"" | head -1 | cut -d'"' -f4)
fi

if [ -z "$LEAD_ID" ]; then
  echo "  ❌ Could not find or create lead. Response: $LEAD_RESPONSE"
  exit 1
fi

echo "  ✅ Lead ID: $LEAD_ID"

# Step 2: Send initial message
echo ""
echo "💬 Sending initial message..."
MESSAGE="Hey Charlie—it's Charlie from OutboundRevive. Quick test of our AI SMS. Want a link to pick a time?"

SEND_RESPONSE=$(curl -s -X POST "$BASE_URL/api/ui/leads/send" \
  -H "Content-Type: application/json" \
  -d "{\"lead_id\":\"$LEAD_ID\",\"body\":\"$MESSAGE\"}")

echo "  Response: $SEND_RESPONSE"
echo ""
echo "✅ Done! Check the threads section - it should appear there!"
echo "   Lead ID: $LEAD_ID"

