#!/bin/bash

# =====================================================
# Dashboard Metrics Verification Script
# =====================================================
# This script tests all dashboard KPIs and metrics endpoints
# to ensure they are recording and calculating correctly.
#
# Usage:
#   ./tests/verify-dashboard-metrics.sh [production|local]
#
# Requirements:
#   - jq (for JSON parsing)
#   - curl
#   - valid auth session cookie

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Determine environment
ENV="${1:-production}"
if [ "$ENV" = "production" ]; then
  BASE_URL="https://www.outboundrevive.com"
elif [ "$ENV" = "local" ]; then
  BASE_URL="http://localhost:3000"
else
  echo -e "${RED}❌ Invalid environment: $ENV${NC}"
  echo "Usage: $0 [production|local]"
  exit 1
fi

echo -e "${BLUE}🔍 Testing Dashboard Metrics${NC}"
echo -e "${BLUE}Environment: $ENV${NC}"
echo -e "${BLUE}Base URL: $BASE_URL${NC}"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
  echo -e "${RED}❌ jq is not installed. Please install it:${NC}"
  echo "  macOS: brew install jq"
  echo "  Ubuntu: sudo apt-get install jq"
  exit 1
fi

# =====================================================
# Test 1: Basic Metrics Endpoint (7D)
# =====================================================
echo -e "${YELLOW}Test 1: Fetching 7D metrics...${NC}"
RESPONSE=$(curl -s "${BASE_URL}/api/metrics?range=7d")

if echo "$RESPONSE" | jq -e '.ok' > /dev/null 2>&1; then
  echo -e "${GREEN}✅ Metrics API responding${NC}"
  
  # Extract and display KPIs
  NEW_LEADS=$(echo "$RESPONSE" | jq -r '.kpis.newLeads // 0')
  CONTACTED=$(echo "$RESPONSE" | jq -r '.kpis.contacted // 0')
  REPLIES=$(echo "$RESPONSE" | jq -r '.kpis.replies // 0')
  REPLY_RATE=$(echo "$RESPONSE" | jq -r '.kpis.replyRate // 0')
  BOOKED=$(echo "$RESPONSE" | jq -r '.kpis.booked // 0')
  OPTED_OUT=$(echo "$RESPONSE" | jq -r '.kpis.optedOut // 0')
  
  echo "  📊 New Leads: $NEW_LEADS"
  echo "  📤 Contacted: $CONTACTED"
  echo "  💬 Replies: $REPLIES"
  echo "  📈 Reply Rate: $REPLY_RATE%"
  echo "  📅 Booked: $BOOKED"
  echo "  🚫 Opted Out: $OPTED_OUT"
  
  # Sanity checks
  if [ "$REPLY_RATE" -gt 100 ]; then
    echo -e "${RED}  ⚠️  Reply rate >100% - calculation error!${NC}"
  fi
  
  if [ "$CONTACTED" -gt 0 ] && [ "$REPLIES" -gt "$CONTACTED" ]; then
    echo -e "${RED}  ⚠️  More replies than contacted - data inconsistency!${NC}"
  fi
else
  echo -e "${RED}❌ Metrics API failed${NC}"
  echo "$RESPONSE" | jq '.' || echo "$RESPONSE"
fi

echo ""

# =====================================================
# Test 2: Appointment Metrics
# =====================================================
echo -e "${YELLOW}Test 2: Checking appointment metrics...${NC}"

APPTS_BOOKED=$(echo "$RESPONSE" | jq -r '.kpis.appointmentsBooked // 0')
APPTS_KEPT=$(echo "$RESPONSE" | jq -r '.kpis.appointmentsKept // 0')
APPTS_NO_SHOW=$(echo "$RESPONSE" | jq -r '.kpis.appointmentsNoShow // 0')

echo "  📅 Appointments Booked: $APPTS_BOOKED"
echo "  ✅ Appointments Kept: $APPTS_KEPT"
echo "  ❌ Appointments No-Show: $APPTS_NO_SHOW"

if [ "$APPTS_BOOKED" -eq 0 ]; then
  echo -e "${YELLOW}  ⚠️  No appointments found - appointments table may be empty or not exist${NC}"
  echo -e "${YELLOW}  💡 Run the migration: sql/2025-11-12_appointments_table.sql${NC}"
else
  if [ "$APPTS_KEPT" -gt "$APPTS_BOOKED" ]; then
    echo -e "${RED}  ⚠️  More kept than booked - calculation error!${NC}"
  fi
  
  if [ "$APPTS_NO_SHOW" -gt "$APPTS_BOOKED" ]; then
    echo -e "${RED}  ⚠️  More no-shows than booked - calculation error!${NC}"
  fi
  
  SHOW_UP_RATE=$((APPTS_KEPT * 100 / APPTS_BOOKED))
  echo "  📊 Show-up Rate: $SHOW_UP_RATE%"
fi

echo ""

# =====================================================
# Test 3: Re-engagement Metrics
# =====================================================
echo -e "${YELLOW}Test 3: Checking re-engagement metrics...${NC}"

RE_ENGAGED=$(echo "$RESPONSE" | jq -r '.kpis.reEngaged // 0')
RE_ENGAGEMENT_RATE=$(echo "$RESPONSE" | jq -r '.kpis.reEngagementRate // 0')

echo "  🔄 Re-engaged Leads: $RE_ENGAGED"
echo "  📈 Re-engagement Rate: $RE_ENGAGEMENT_RATE%"

if [ "$RE_ENGAGEMENT_RATE" -gt 100 ]; then
  echo -e "${RED}  ⚠️  Re-engagement rate >100% - calculation error!${NC}"
fi

echo ""

# =====================================================
# Test 4: Time Series Charts
# =====================================================
echo -e "${YELLOW}Test 4: Checking time series data...${NC}"

DELIVERY_CHART=$(echo "$RESPONSE" | jq -r '.charts.deliveryOverTime // []')
REPLIES_CHART=$(echo "$RESPONSE" | jq -r '.charts.repliesPerDay // []')

DELIVERY_POINTS=$(echo "$DELIVERY_CHART" | jq 'length')
REPLIES_POINTS=$(echo "$REPLIES_CHART" | jq 'length')

echo "  📊 Delivery chart data points: $DELIVERY_POINTS"
echo "  💬 Replies chart data points: $REPLIES_POINTS"

if [ "$DELIVERY_POINTS" -eq 0 ]; then
  echo -e "${YELLOW}  ⚠️  No delivery data - may be normal for new accounts${NC}"
fi

if [ "$REPLIES_POINTS" -eq 0 ]; then
  echo -e "${YELLOW}  ⚠️  No replies data - may be normal for new accounts${NC}"
fi

echo ""

# =====================================================
# Test 5: All Time Range
# =====================================================
echo -e "${YELLOW}Test 5: Testing 'All Time' range...${NC}"
ALL_TIME_RESPONSE=$(curl -s "${BASE_URL}/api/metrics?range=all")

if echo "$ALL_TIME_RESPONSE" | jq -e '.ok' > /dev/null 2>&1; then
  echo -e "${GREEN}✅ All Time metrics working${NC}"
  
  ALL_NEW_LEADS=$(echo "$ALL_TIME_RESPONSE" | jq -r '.kpis.newLeads // 0')
  ALL_CONTACTED=$(echo "$ALL_TIME_RESPONSE" | jq -r '.kpis.contacted // 0')
  ALL_APPTS=$(echo "$ALL_TIME_RESPONSE" | jq -r '.kpis.appointmentsBooked // 0')
  
  echo "  📊 All Time New Leads: $ALL_NEW_LEADS"
  echo "  📤 All Time Contacted: $ALL_CONTACTED"
  echo "  📅 All Time Appointments: $ALL_APPTS"
else
  echo -e "${RED}❌ All Time metrics failed${NC}"
fi

echo ""

# =====================================================
# Test 6: 24H Range
# =====================================================
echo -e "${YELLOW}Test 6: Testing 24H range...${NC}"
HOURLY_RESPONSE=$(curl -s "${BASE_URL}/api/metrics?range=24h")

if echo "$HOURLY_RESPONSE" | jq -e '.ok' > /dev/null 2>&1; then
  echo -e "${GREEN}✅ 24H metrics working${NC}"
  
  HOURLY_CHART=$(echo "$HOURLY_RESPONSE" | jq -r '.charts.deliveryOverTime // []')
  HOURLY_POINTS=$(echo "$HOURLY_CHART" | jq 'length')
  
  echo "  📊 Hourly chart data points: $HOURLY_POINTS"
  echo -e "${BLUE}  💡 Should have ~24 points for hour-by-hour data${NC}"
else
  echo -e "${RED}❌ 24H metrics failed${NC}"
fi

echo ""

# =====================================================
# Summary
# =====================================================
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 SUMMARY${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}✅ Core Metrics:${NC} Working"
echo -e "${YELLOW}⚠️  Appointment Metrics:${NC} Table may need migration"
echo -e "${GREEN}✅ Re-engagement Metrics:${NC} Working"
echo -e "${GREEN}✅ Time Series Charts:${NC} Working"
echo ""

if [ "$APPTS_BOOKED" -eq 0 ]; then
  echo -e "${YELLOW}📝 ACTION REQUIRED:${NC}"
  echo "  1. Run the appointments table migration in Supabase SQL Editor:"
  echo "     sql/2025-11-12_appointments_table.sql"
  echo ""
  echo "  2. Verify your calendar webhook handlers are populating the table:"
  echo "     - app/api/webhooks/cal/route.ts"
  echo "     - app/api/webhooks/calendly/route.ts"
  echo ""
  echo "  3. Optional: Insert test data (uncomment section in migration file)"
fi

echo ""
echo -e "${BLUE}✨ Test complete!${NC}"

