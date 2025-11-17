#!/bin/bash

echo "🔍 Testing Current Booking State"
echo "=================================================="
echo ""

ACCOUNT_ID="11111111-1111-1111-1111-111111111111"
BASE_URL="https://www.outboundrevive.com"

# Test all time ranges
for RANGE in "24h" "7d" "1m" "all"; do
  echo "📊 Range: $RANGE"
  BOOKED=$(curl -s "${BASE_URL}/api/metrics?account_id=${ACCOUNT_ID}&range=${RANGE}" | jq -r '.kpis.appointmentsBooked // "null"')
  echo "   Booked: $BOOKED"
done

echo ""
echo "=================================================="
echo ""
echo "📋 If all ranges show the same number (e.g., all show 1),"
echo "   then the second booking didn't make it to the database."
echo ""
echo "🔍 Check:"
echo "   1. Run sql/debug-bookings.sql in Supabase"
echo "   2. Look for 2 appointments"
echo "   3. If only 1 appointment exists, webhook didn't fire or lead wasn't found"
echo ""
echo "⚠️  Most common issue: Lead's phone/email in Calendly"
echo "    doesn't match the phone/email in your leads table"
echo ""

