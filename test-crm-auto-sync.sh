#!/bin/bash

# Test the CRM auto-sync cron job
# This script simulates what Vercel's cron job does

echo "🧪 Testing CRM Auto-Sync Cron Job"
echo "=================================="
echo ""

# Check for CRON_SECRET
if [ -z "$CRON_SECRET" ]; then
  echo "⚠️  CRON_SECRET not found in environment"
  echo "💡 Loading from .env.local..."
  
  if [ -f .env.local ]; then
    export CRON_SECRET=$(grep CRON_SECRET .env.local | cut -d '=' -f2 | tr -d '"' | tr -d ' ')
  fi
  
  if [ -z "$CRON_SECRET" ]; then
    echo "❌ CRON_SECRET not found in .env.local"
    echo "Please set CRON_SECRET in your environment or .env.local"
    exit 1
  fi
fi

echo "✅ CRON_SECRET found: ${CRON_SECRET:0:10}..."
echo ""

# Determine the base URL
if [ "$1" = "prod" ] || [ "$1" = "production" ]; then
  BASE_URL="https://www.outboundrevive.com"
  echo "🌐 Testing PRODUCTION: $BASE_URL"
else
  BASE_URL="http://localhost:3000"
  echo "🏠 Testing LOCAL: $BASE_URL"
fi

echo ""
echo "📡 Calling /api/cron/sync-crm..."
echo ""

# Make the request
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$BASE_URL/api/cron/sync-crm")

# Parse response and status
HTTP_BODY=$(echo "$RESPONSE" | sed -e 's/HTTP_STATUS\:.*//g')
HTTP_STATUS=$(echo "$RESPONSE" | tr -d '\n' | sed -e 's/.*HTTP_STATUS://')

echo "📊 Response Status: $HTTP_STATUS"
echo ""

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅ SUCCESS! Cron job executed successfully"
  echo ""
  echo "📄 Response Body:"
  echo "$HTTP_BODY" | jq '.' 2>/dev/null || echo "$HTTP_BODY"
else
  echo "❌ FAILED! Expected 200, got $HTTP_STATUS"
  echo ""
  echo "📄 Response Body:"
  echo "$HTTP_BODY"
fi

echo ""
echo "=================================="
echo ""
echo "📝 Notes:"
echo "   • This cron job runs automatically every hour on Vercel"
echo "   • It syncs all active CRM connections in the database"
echo "   • Check Vercel logs to see real cron executions"
echo ""
echo "🔍 To check Vercel logs:"
echo "   vercel logs --follow"
echo ""

