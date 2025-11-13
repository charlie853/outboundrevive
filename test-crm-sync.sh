#!/bin/bash

BASE_URL="https://www.outboundrevive.com"
CRON_SECRET="9eb24ad1befaa66d73b3345431f4afb0"

echo "🔍 Testing CRM Sync Cron"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Endpoint: $BASE_URL/api/cron/sync-crm"
echo "Method: GET (not POST!)"
echo "Auth: Bearer token in Authorization header"
echo ""

# Correct way - GET with Bearer token
RESPONSE=$(curl -s -X GET "$BASE_URL/api/cron/sync-crm" \
  -H "Authorization: Bearer $CRON_SECRET")

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Check if successful
if echo "$RESPONSE" | jq -e '.success == true' >/dev/null 2>&1; then
  echo "✅ CRM Sync is working!"
  SYNCED=$(echo "$RESPONSE" | jq -r '.synced // 0')
  FAILED=$(echo "$RESPONSE" | jq -r '.failed // 0')
  TOTAL=$(echo "$RESPONSE" | jq -r '.total // 0')
  
  echo "📊 Results:"
  echo "   Total connections: $TOTAL"
  echo "   Successfully synced: $SYNCED"
  echo "   Failed: $FAILED"
  
  if [ "$TOTAL" -eq 0 ]; then
    echo ""
    echo "💡 No CRM connections found"
    echo "   Connect a CRM in your dashboard to enable auto-sync"
  fi
  
  # Show details if available
  if [ "$SYNCED" -gt 0 ]; then
    echo ""
    echo "📋 Sync Details:"
    echo "$RESPONSE" | jq -r '.results[] | "   \(.accountId): \(.result.created // 0) created, \(.result.updated // 0) updated, \(.result.skipped // 0) skipped"' 2>/dev/null
  fi
else
  echo "❌ CRM Sync failed"
  ERROR=$(echo "$RESPONSE" | jq -r '.error // .hint // "unknown"')
  echo "Error: $ERROR"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ This cron runs automatically every hour"
echo "   Schedule: 0 * * * * (at :00 minutes)"
echo "   Monitor in: Vercel → Deployments → Functions"
echo ""
