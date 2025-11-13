#!/bin/bash

echo "🧪 Testing Calendly Webhook"
echo "============================="
echo ""

# Get account ID from localStorage or use default
ACCOUNT_ID="${1:-11111111-1111-1111-1111-111111111111}"

echo "📋 Using account_id: $ACCOUNT_ID"
echo ""

# Test booking created
echo "📅 Simulating 'Booking Created' event..."
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST \
  https://www.outboundrevive.com/api/webhooks/calendar/calendly \
  -H "Content-Type: application/json" \
  -H "x-account-id: $ACCOUNT_ID" \
  -d '{
    "event": "invitee.created",
    "payload": {
      "event_uuid": "test-'$(date +%s)'",
      "scheduled_event": {
        "start_time": "2025-11-15T15:00:00Z",
        "end_time": "2025-11-15T15:30:00Z"
      },
      "invitee": {
        "email": "test@example.com",
        "text_reminder_number": "+15551234567",
        "name": "Test Booking"
      }
    }
  }')

HTTP_BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "Status: $HTTP_STATUS"
echo "Response: $HTTP_BODY"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ Webhook is working!"
  echo ""
  echo "🔍 Now check your dashboard metrics:"
  echo "   https://www.outboundrevive.com/dashboard"
  echo ""
  echo "📊 Or query Supabase directly:"
  echo "   SELECT * FROM appointments WHERE account_id = '$ACCOUNT_ID' ORDER BY created_at DESC LIMIT 5;"
else
  echo "❌ Webhook failed!"
  echo ""
  echo "💡 Common issues:"
  echo "   1. Make sure appointments table exists (run sql/2025-11-12_appointments_table.sql)"
  echo "   2. Check that you added x-account-id header in Calendly webhook settings"
  echo "   3. Verify the account_id is correct"
fi

echo ""

