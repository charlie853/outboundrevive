#!/bin/bash
# Validation script for appointment & re-engagement metrics
# This script calls the /api/metrics endpoint and validates the response structure

set -e

BASE_URL="${PUBLIC_BASE_URL:-http://localhost:3000}"
ACCOUNT_ID="${TEST_ACCOUNT_ID:-11111111-1111-1111-1111-111111111111}"

echo "🧪 Testing Appointment & Re-engagement Metrics"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_passed=0
test_failed=0

# Function to test an endpoint
test_endpoint() {
  local range=$1
  local description=$2
  
  echo -n "Testing $description ($range range)... "
  
  response=$(curl -s "${BASE_URL}/api/metrics?range=${range}&account_id=${ACCOUNT_ID}")
  
  # Check if response is valid JSON
  if ! echo "$response" | jq . > /dev/null 2>&1; then
    echo -e "${RED}✗ FAILED${NC} (Invalid JSON)"
    echo "Response: $response"
    ((test_failed++))
    return 1
  fi
  
  # Check for required fields
  local ok=$(echo "$response" | jq -r '.ok // false')
  local has_appointments_booked=$(echo "$response" | jq 'has("kpis") and (.kpis | has("appointmentsBooked"))')
  local has_appointments_kept=$(echo "$response" | jq 'has("kpis") and (.kpis | has("appointmentsKept"))')
  local has_appointments_no_show=$(echo "$response" | jq 'has("kpis") and (.kpis | has("appointmentsNoShow"))')
  local has_re_engaged=$(echo "$response" | jq 'has("kpis") and (.kpis | has("reEngaged"))')
  local has_re_engagement_rate=$(echo "$response" | jq 'has("kpis") and (.kpis | has("reEngagementRate"))')
  
  if [ "$ok" != "true" ]; then
    echo -e "${RED}✗ FAILED${NC} (ok: false)"
    echo "Response: $response"
    ((test_failed++))
    return 1
  fi
  
  if [ "$has_appointments_booked" != "true" ] || \
     [ "$has_appointments_kept" != "true" ] || \
     [ "$has_appointments_no_show" != "true" ] || \
     [ "$has_re_engaged" != "true" ] || \
     [ "$has_re_engagement_rate" != "true" ]; then
    echo -e "${RED}✗ FAILED${NC} (Missing required fields)"
    echo "Response: $response"
    ((test_failed++))
    return 1
  fi
  
  # Extract values
  local appts_booked=$(echo "$response" | jq -r '.kpis.appointmentsBooked')
  local appts_kept=$(echo "$response" | jq -r '.kpis.appointmentsKept')
  local appts_no_show=$(echo "$response" | jq -r '.kpis.appointmentsNoShow')
  local re_engaged=$(echo "$response" | jq -r '.kpis.reEngaged')
  local re_engagement_rate=$(echo "$response" | jq -r '.kpis.reEngagementRate')
  
  echo -e "${GREEN}✓ PASSED${NC}"
  echo "  📅 Appointments Booked: $appts_booked"
  echo "  ✅ Appointments Kept: $appts_kept"
  echo "  👻 Appointments No-Show: $appts_no_show"
  echo "  🔄 Re-engaged Leads: $re_engaged"
  echo "  📈 Re-engagement Rate: ${re_engagement_rate}%"
  ((test_passed++))
}

# Run tests for different ranges
echo "1. Testing 24H range"
test_endpoint "24h" "24-hour metrics"
echo ""

echo "2. Testing 7D range"
test_endpoint "7d" "7-day metrics"
echo ""

echo "3. Testing 1M range"
test_endpoint "30d" "30-day metrics"
echo ""

echo "4. Testing All Time range"
test_endpoint "all" "all-time metrics"
echo ""

# Summary
echo "================================================"
echo "Test Results:"
echo -e "  ${GREEN}Passed: $test_passed${NC}"
if [ $test_failed -gt 0 ]; then
  echo -e "  ${RED}Failed: $test_failed${NC}"
  exit 1
else
  echo -e "  ${YELLOW}Failed: $test_failed${NC}"
fi
echo ""
echo "✅ All appointment & re-engagement metric tests passed!"

