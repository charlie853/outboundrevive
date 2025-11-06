#!/bin/bash
# Smoke test script for OutboundRevive
# Runs a quick end-to-end check of critical flows

set -e

BASE_URL="${BASE_URL:-${PUBLIC_BASE_URL:-http://localhost:3000}}"
ACCOUNT_ID="${DEFAULT_ACCOUNT_ID:-11111111-1111-1111-1111-111111111111}"

echo "🚀 OutboundRevive Smoke Test"
echo "=============================="
echo "Base URL: $BASE_URL"
echo "Account ID: $ACCOUNT_ID"
echo ""

PASS=0
FAIL=0

test_case() {
  local name="$1"
  local cmd="$2"
  echo -n "Testing: $name... "
  
  if eval "$cmd" > /dev/null 2>&1; then
    echo "✅ PASS"
    ((PASS++))
  else
    echo "❌ FAIL"
    ((FAIL++))
  fi
}

# Health checks
test_case "Health endpoint" "curl -sf $BASE_URL/api/ok"
test_case "SMS health endpoint" "curl -sf $BASE_URL/api/health/sms"

# Metrics endpoint
test_case "Metrics endpoint" "curl -sf '$BASE_URL/api/metrics?account_id=$ACCOUNT_ID&range=7d' | jq -e '.ok == true'"

# Thread endpoint (if test lead exists)
test_case "Thread endpoint structure" "curl -sf '$BASE_URL/api/ui/leads/00000000-0000-0000-0000-000000000000/thread' | jq -e '.items != null'"

# Billing status
test_case "Billing status endpoint" "curl -sf '$BASE_URL/api/billing/status?account_id=$ACCOUNT_ID' | jq -e '.account_id != null'"

echo ""
echo "=============================="
echo "Results: $PASS passed, $FAIL failed"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "✅ All smoke tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi

