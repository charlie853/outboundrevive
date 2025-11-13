#!/bin/bash

echo "🔍 BOOKING METRIC DIAGNOSTIC TOOL"
echo "=================================================="
echo ""

ACCOUNT_ID="11111111-1111-1111-1111-111111111111"
BASE_URL="https://www.outboundrevive.com"

# Step 1: Check metrics API directly
echo "📊 Step 1: Checking metrics API..."
echo ""
curl -s "${BASE_URL}/api/metrics?account_id=${ACCOUNT_ID}&range=all" | jq '{
  appointmentsBooked: .kpis.appointmentsBooked,
  appointmentsKept: .kpis.appointmentsKept,
  appointmentsNoShow: .kpis.appointmentsNoShow,
  bookedLegacy: .kpis.booked
}'
echo ""

# Step 2: Check appointments table directly via Supabase REST API
echo "📅 Step 2: Querying appointments table (you'll need to run the SQL script)..."
echo ""
echo "   → Run sql/debug-bookings.sql in Supabase SQL Editor"
echo ""

# Step 3: Test the webhook endpoint
echo "🧪 Step 3: Checking if webhook endpoint is responding..."
echo ""
WEBHOOK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/api/webhooks/calendar/calendly" -X POST -H "Content-Type: application/json" -d '{}')
echo "   Webhook endpoint status: $WEBHOOK_STATUS"
if [ "$WEBHOOK_STATUS" = "200" ]; then
  echo "   ✅ Webhook endpoint is live"
else
  echo "   ⚠️  Webhook returned: $WEBHOOK_STATUS"
fi
echo ""

# Step 4: Check Vercel deployment
echo "🚀 Step 4: Checking latest Vercel deployment..."
echo ""
HEALTH_CHECK=$(curl -s "${BASE_URL}/api/health" 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "   ✅ Site is up"
  echo "   Response: $HEALTH_CHECK"
else
  echo "   ❌ Site health check failed"
fi
echo ""

echo "=================================================="
echo "📋 ACTION ITEMS:"
echo ""
echo "1. Run the SQL diagnostic:"
echo "   → Copy/paste sql/debug-bookings.sql into Supabase SQL Editor"
echo "   → Look for the appointment in the results"
echo ""
echo "2. Check Vercel logs for webhook activity:"
echo "   → Run: ./check-webhook-logs.sh"
echo "   → Or: vercel logs --prod --follow"
echo ""
echo "3. Verify Calendly webhook configuration:"
echo "   → Webhook URL: ${BASE_URL}/api/webhooks/calendar/calendly"
echo "   → Custom header: x-account-id = ${ACCOUNT_ID}"
echo "   → Events: invitee.created, invitee.canceled, invitee_no_show"
echo ""
echo "4. If appointment exists but metric shows 0:"
echo "   → Check the date range filter (24H, 7D, 1M, All Time)"
echo "   → Appointment might be outside current range"
echo ""
echo "5. If appointment doesn't exist:"
echo "   → Lead's phone/email format doesn't match Calendly"
echo "   → Run: sql/normalize-all-phone-numbers.sql"
echo ""
echo "=================================================="

