#!/bin/bash
# Test "who is this" to verify LLM-generated (not canned) response

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 Testing 'Who is this' Response"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

BASE_URL="https://outboundrevive-z73k.vercel.app"
PHONE="+12062959002"  # Paul Anderson's number

echo "Base URL: $BASE_URL"
echo "Test Phone: $PHONE"
echo ""

# Send "who is this" message
echo "Sending 'who is this' message..."
echo ""

RESPONSE=$(curl -sS -X POST "$BASE_URL/api/webhooks/twilio/inbound" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=$PHONE" \
  -d "To=+18182234567" \
  -d "Body=who is this" \
  -d "MessageSid=SM$(openssl rand -hex 16)" \
  -w "\nHTTP_STATUS:%{http_code}")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | grep -v "HTTP_STATUS")

echo "HTTP Status: $HTTP_STATUS"
echo ""
echo "TwiML Response:"
echo "$BODY"
echo ""

# Extract message from TwiML
MESSAGE=$(echo "$BODY" | sed -n 's/.*<Message>\(.*\)<\/Message>.*/\1/p')

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Extracted Message:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$MESSAGE"
echo ""

# Check if it's the old canned response
CANNED_RESPONSE="Charlie from OutboundRevive."
if echo "$MESSAGE" | grep -qF "$CANNED_RESPONSE"; then
  echo "❌ FAIL: Got canned response! Should be LLM-generated."
  exit 1
fi

# Check if it includes key elements (should be LLM-generated)
if echo "$MESSAGE" | grep -qi "charlie" && echo "$MESSAGE" | grep -qi "outboundrevive"; then
  echo "✅ SUCCESS! Got LLM-generated response (not canned)"
  echo ""
  echo "Response includes:"
  echo "  ✓ Charlie mention"
  echo "  ✓ OutboundRevive mention"
  echo "  ✓ Context-aware (not exact canned text)"
  exit 0
else
  echo "❌ FAIL: Response doesn't mention Charlie or OutboundRevive"
  exit 1
fi

