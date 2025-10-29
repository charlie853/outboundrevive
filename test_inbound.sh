#!/bin/bash
# Test script to simulate an inbound SMS and verify it shows up in threads

PHONE="+18183709444"
TEST_MESSAGE="Test message $(date +%H:%M:%S) - verifying inbound recording works!"
BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 Testing Inbound Message Recording"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Phone: $PHONE"
echo "Message: $TEST_MESSAGE"
echo "Base URL: $BASE_URL"
echo ""

# Step 1: Simulate Twilio webhook (inbound SMS)
echo "Step 1: Simulating inbound SMS from $PHONE..."
echo ""

RESPONSE=$(curl -s -X POST "$BASE_URL/api/webhooks/twilio/inbound" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=$PHONE" \
  -d "To=+18182234567" \
  -d "Body=$TEST_MESSAGE" \
  -d "MessageSid=SM$(openssl rand -hex 16)" \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS")

echo "HTTP Status: $HTTP_STATUS"
echo "Response:"
echo "$BODY" | head -20
echo ""

if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ Webhook failed with status $HTTP_STATUS"
  exit 1
fi

echo "✅ Webhook received and processed"
echo ""

# Step 2: Wait a moment for DB to update
echo "Step 2: Waiting 2 seconds for database to update..."
sleep 2
echo ""

# Step 3: Query the threads endpoint to verify the message appears
echo "Step 3: Querying threads for phone $PHONE..."
echo ""

# First, get the lead_id
LEAD_RESPONSE=$(curl -s "$BASE_URL/api/threads/$PHONE")
echo "Thread response:"
echo "$LEAD_RESPONSE" | jq '.' 2>/dev/null || echo "$LEAD_RESPONSE"
echo ""

# Check if our test message appears in the response
if echo "$LEAD_RESPONSE" | grep -q "$TEST_MESSAGE"; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ SUCCESS! Test message found in threads!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Show the message details
  echo ""
  echo "Message details:"
  echo "$LEAD_RESPONSE" | jq '.messages[] | select(.body | contains("Test message"))' 2>/dev/null || echo "(jq not available)"
  exit 0
else
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ FAIL: Test message NOT found in threads"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Show what messages we did find
  echo ""
  echo "Messages found:"
  echo "$LEAD_RESPONSE" | jq '.messages | length' 2>/dev/null || echo "(jq not available)"
  exit 1
fi

