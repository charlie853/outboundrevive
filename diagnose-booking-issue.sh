#!/bin/bash

echo "🔍 Diagnosing Why Your Booking Didn't Show Up"
echo "=============================================="
echo ""

# You need to provide the phone or email you used to book
PHONE="$1"
EMAIL="$2"
ACCOUNT_ID="${3:-11111111-1111-1111-1111-111111111111}"

if [ -z "$PHONE" ] && [ -z "$EMAIL" ]; then
  echo "❌ Please provide the phone or email you used to book:"
  echo ""
  echo "Usage:"
  echo "  ./diagnose-booking-issue.sh '+15551234567'"
  echo "  ./diagnose-booking-issue.sh '' 'your@email.com'"
  echo "  ./diagnose-booking-issue.sh '+15551234567' 'your@email.com' 'YOUR_ACCOUNT_ID'"
  echo ""
  exit 1
fi

echo "📋 Checking for lead with:"
[ -n "$PHONE" ] && echo "   Phone: $PHONE"
[ -n "$EMAIL" ] && echo "   Email: $EMAIL"
echo "   Account: $ACCOUNT_ID"
echo ""

# Check Vercel logs for webhook
echo "1️⃣  Check Calendly webhook delivery in Calendly dashboard:"
echo "   https://calendly.com/integrations/api_webhooks"
echo "   Look for 200 status = webhook was received ✅"
echo "   Look for 4xx/5xx = webhook failed ❌"
echo ""

echo "2️⃣  Check if lead exists in your database:"
echo "   Run this in Supabase SQL Editor:"
echo ""
if [ -n "$PHONE" ]; then
  echo "   SELECT id, name, phone, email, account_id"
  echo "   FROM leads"
  echo "   WHERE phone = '$PHONE';"
  echo ""
fi
if [ -n "$EMAIL" ]; then
  echo "   SELECT id, name, phone, email, account_id"
  echo "   FROM leads"
  echo "   WHERE email = '$EMAIL';"
  echo ""
fi

echo "3️⃣  Check if appointment was created:"
echo "   SELECT *"
echo "   FROM appointments"
echo "   WHERE account_id = '$ACCOUNT_ID'"
echo "   ORDER BY created_at DESC"
echo "   LIMIT 5;"
echo ""

echo "4️⃣  Check Vercel logs for webhook errors:"
echo "   vercel logs --follow"
echo "   OR"
echo "   https://vercel.com/your-team/outboundrevive/logs"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 COMMON FIXES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "❌ Problem: Lead doesn't exist in database"
echo "✅ Solution: Create the lead first:"
echo ""
if [ -n "$PHONE" ] && [ -n "$EMAIL" ]; then
  echo "INSERT INTO leads (account_id, name, phone, email, created_at)"
  echo "VALUES ("
  echo "  '$ACCOUNT_ID',"
  echo "  'Your Name',"
  echo "  '$PHONE',"
  echo "  '$EMAIL',"
  echo "  NOW()"
  echo ");"
elif [ -n "$PHONE" ]; then
  echo "INSERT INTO leads (account_id, name, phone, created_at)"
  echo "VALUES ('$ACCOUNT_ID', 'Your Name', '$PHONE', NOW());"
elif [ -n "$EMAIL" ]; then
  echo "INSERT INTO leads (account_id, name, email, created_at)"
  echo "VALUES ('$ACCOUNT_ID', 'Your Name', '$EMAIL', NOW());"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "❌ Problem: Wrong account_id in webhook header"
echo "✅ Solution: Update Calendly webhook header:"
echo "   1. Go to: https://calendly.com/integrations/api_webhooks"
echo "   2. Edit your webhook"
echo "   3. Set header: x-account-id = $ACCOUNT_ID"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "❌ Problem: Phone format doesn't match"
echo "✅ Solution: Phone must be in E.164 format (+1XXXXXXXXXX)"
echo "   Webhook converts: (555) 123-4567 → +15551234567"
echo "   Make sure lead.phone is also: +15551234567"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

